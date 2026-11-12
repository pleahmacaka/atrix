use std::collections::HashMap;
use std::io::Cursor;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use serde::Serialize;
use tauri::State;
use tauri::ipc::Channel;
use tiny_http::{Header, Request, Response, Server};

#[derive(Clone, Serialize)]
pub struct Incoming {
    id: u64,
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: String,
}

type Sink = Arc<Mutex<Option<Channel<Incoming>>>>;

#[derive(Default)]
pub struct Bridge {
    port: Mutex<Option<u16>>,
    sink: Sink,
    pending: Arc<Mutex<HashMap<u64, Request>>>,
}

fn incoming(id: u64, request: &mut Request) -> Incoming {
    let mut body = String::new();
    let _ = request.as_reader().read_to_string(&mut body);

    Incoming {
        id,
        method: request.method().to_string(),
        url: request.url().to_owned(),
        headers: request
            .headers()
            .iter()
            .map(|h| (h.field.to_string(), h.value.to_string()))
            .collect(),
        body,
    }
}

#[tauri::command]
pub fn bridge_start(bridge: State<'_, Bridge>, channel: Channel<Incoming>) -> Result<u16, String> {
    *bridge.sink.lock().unwrap() = Some(channel);

    let mut port = bridge.port.lock().unwrap();

    if let Some(port) = *port {
        return Ok(port);
    }

    let server = Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let bound = server
        .server_addr()
        .to_ip()
        .ok_or("bridge_no_address")?
        .port();
    let pending = bridge.pending.clone();
    let sink = bridge.sink.clone();
    let next = AtomicU64::new(1);

    thread::spawn(move || {
        for mut request in server.incoming_requests() {
            let id = next.fetch_add(1, Ordering::Relaxed);
            let frame = incoming(id, &mut request);

            pending.lock().unwrap().insert(id, request);

            let sent = sink
                .lock()
                .unwrap()
                .as_ref()
                .is_some_and(|c| c.send(frame).is_ok());

            if !sent && let Some(request) = pending.lock().unwrap().remove(&id) {
                let _ = request.respond(Response::empty(503));
            }
        }
    });

    *port = Some(bound);

    Ok(bound)
}

#[tauri::command]
pub fn bridge_reply(
    bridge: State<'_, Bridge>,
    id: u64,
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
) -> Result<(), String> {
    let request = bridge
        .pending
        .lock()
        .unwrap()
        .remove(&id)
        .ok_or("bridge_unknown_request")?;
    let headers = headers
        .iter()
        .filter_map(|(k, v)| Header::from_bytes(k.as_bytes(), v.as_bytes()).ok())
        .collect();
    let length = body.len();
    let response = Response::new(
        status.into(),
        headers,
        Cursor::new(body.into_bytes()),
        Some(length),
        None,
    );

    request.respond(response).map_err(|e| e.to_string())
}
