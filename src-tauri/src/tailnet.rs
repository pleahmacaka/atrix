use std::collections::HashMap;
use std::io::Cursor;
use std::net::{IpAddr, SocketAddr};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};

use ipnet::IpNet;
use serde::{Deserialize, Serialize};
use tauri::State;
use tauri::ipc::Channel;
use tiny_http::{Header, Method, ReadWrite, Request, Response, Server};
use tungstenite::handshake::derive_accept_key;
use tungstenite::protocol::Role;
use tungstenite::{Message, WebSocket};

use crate::bridge::{Incoming, incoming};

const RANGES: [&str; 2] = ["100.64.0.0/10", "fd7a:115c:a1e0::/48"];

#[derive(Clone, Serialize)]
pub struct Address {
    iface: String,
    address: String,
}

#[derive(Deserialize, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Mode {
    #[default]
    All,
    Allow,
    Block,
}

#[derive(Deserialize, Default)]
pub struct Rule {
    mode: Mode,
    list: Vec<String>,
}

impl Rule {
    fn admits(&self, ip: IpAddr) -> bool {
        let listed = self.list.iter().any(|entry| covers(entry.trim(), ip));

        match self.mode {
            Mode::All => true,
            Mode::Allow => listed,
            Mode::Block => !listed,
        }
    }
}

fn covers(entry: &str, ip: IpAddr) -> bool {
    match entry.parse::<IpNet>() {
        Ok(net) => net.contains(&ip),
        Err(_) => entry.parse::<IpAddr>().is_ok_and(|a| a == ip),
    }
}

fn tailscale(ip: &IpAddr) -> bool {
    RANGES
        .iter()
        .filter_map(|r| r.parse::<IpNet>().ok())
        .any(|net| net.contains(ip))
}

fn detect() -> Vec<Address> {
    if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|iface| tailscale(&iface.ip()))
        .map(|iface| Address {
            address: iface.ip().to_string(),
            iface: iface.name,
        })
        .collect()
}

type Socket = WebSocket<Box<dyn ReadWrite + Send>>;

#[derive(Default)]
pub struct Tailnet {
    servers: Mutex<Vec<(Arc<Server>, JoinHandle<()>)>>,
    sink: Arc<Mutex<Option<Channel<Incoming>>>>,
    pending: Arc<Mutex<HashMap<u64, Request>>>,
    sockets: Mutex<Vec<Socket>>,
    next: Arc<AtomicU64>,
}

fn cors<R: std::io::Read>(response: Response<R>) -> Response<R> {
    response.with_header(Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap())
}

fn preflight() -> Response<std::io::Empty> {
    [
        ("Access-Control-Allow-Methods", "GET, POST"),
        (
            "Access-Control-Allow-Headers",
            "authorization, content-type",
        ),
        ("Access-Control-Allow-Private-Network", "true"),
    ]
    .into_iter()
    .filter_map(|(k, v)| Header::from_bytes(k, v).ok())
    .fold(cors(Response::empty(204)), Response::with_header)
}

impl Tailnet {
    fn listen(&self, server: Arc<Server>, rule: Arc<Rule>) -> JoinHandle<()> {
        let pending = self.pending.clone();
        let sink = self.sink.clone();
        let next = self.next.clone();

        thread::spawn(move || {
            for mut request in server.incoming_requests() {
                if !request.remote_addr().is_some_and(|a| rule.admits(a.ip())) {
                    let _ = request.respond(Response::empty(403));
                    continue;
                }

                if *request.method() == Method::Options {
                    let _ = request.respond(preflight());
                    continue;
                }

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
        })
    }
}

#[tauri::command(async)]
pub fn tailnet_addresses() -> Vec<Address> {
    detect()
}

#[tauri::command(async)]
pub fn tailnet_start(
    tailnet: State<'_, Tailnet>,
    channel: Channel<Incoming>,
    port: u16,
    rule: Rule,
) -> Result<Vec<String>, String> {
    *tailnet.sink.lock().unwrap() = Some(channel);
    tailnet.sockets.lock().unwrap().clear();

    let mut servers = tailnet.servers.lock().unwrap();

    for (server, handle) in servers.drain(..) {
        server.unblock();
        let _ = handle.join();
    }

    let rule = Arc::new(rule);
    let mut bound = Vec::new();

    for address in detect() {
        let Ok(ip) = address.address.parse::<IpAddr>() else {
            continue;
        };
        let Ok(server) = Server::http(SocketAddr::new(ip, port)) else {
            continue;
        };
        let server = Arc::new(server);

        let handle = tailnet.listen(server.clone(), rule.clone());

        servers.push((server, handle));
        bound.push(address.address);
    }

    Ok(bound)
}

#[tauri::command(async)]
pub fn tailnet_reply(
    tailnet: State<'_, Tailnet>,
    id: u64,
    status: u16,
    body: String,
) -> Result<(), String> {
    let request = tailnet
        .pending
        .lock()
        .unwrap()
        .remove(&id)
        .ok_or("tailnet_unknown_request")?;

    if status == 101 {
        let key = request
            .headers()
            .iter()
            .find(|h| h.field.equiv("Sec-WebSocket-Key"))
            .map(|h| derive_accept_key(h.value.as_bytes()))
            .ok_or("tailnet_not_websocket")?;
        let accept = Header::from_bytes("Sec-WebSocket-Accept", key).unwrap();
        let stream = request.upgrade("websocket", Response::empty(101).with_header(accept));

        tailnet
            .sockets
            .lock()
            .unwrap()
            .push(WebSocket::from_raw_socket(stream, Role::Server, None));

        return Ok(());
    }

    let json = Header::from_bytes("Content-Type", "application/json").unwrap();
    let length = body.len();
    let response = Response::new(
        status.into(),
        vec![json],
        Cursor::new(body.into_bytes()),
        Some(length),
        None,
    );

    request.respond(cors(response)).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn tailnet_emit(tailnet: State<'_, Tailnet>, event: String) -> Result<(), String> {
    tailnet
        .sockets
        .lock()
        .unwrap()
        .retain_mut(|s| s.send(Message::text(event.clone())).is_ok());

    Ok(())
}

#[tauri::command]
pub fn tailnet_valid(entry: String) -> bool {
    let entry = entry.trim();

    entry.parse::<IpNet>().is_ok() || entry.parse::<IpAddr>().is_ok()
}
