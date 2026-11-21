use std::thread;

use tauri::{AppHandle, Runtime};
use tiny_http::{Header, Response, Server};

pub fn serve<R: Runtime>(app: &AppHandle<R>, addr: &str) -> crate::error::Result<()> {
    let server = Server::http(addr).map_err(|e| crate::error::Error::code("web_bind", e))?;
    let assets = app.asset_resolver();

    tauri_plugin_log::log::info!("web client at http://{addr}");
    println!("web client at http://{addr}");

    thread::spawn(move || {
        for request in server.incoming_requests() {
            let path = request.url().split(['?', '#']).next().unwrap_or("/");

            let Some(asset) = assets.get(path.to_string()) else {
                let _ = request.respond(Response::empty(404));
                continue;
            };

            let mut response = Response::from_data(asset.bytes);

            if let Ok(mime) = Header::from_bytes("Content-Type", asset.mime_type) {
                response.add_header(mime);
            }

            let _ = request.respond(response);
        }
    });

    Ok(())
}
