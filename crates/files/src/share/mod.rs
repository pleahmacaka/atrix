mod browse;
pub mod commands;
mod net;
mod store;
mod wire;

use std::fs::File;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, OnceLock};

use tauri::AppHandle;

use crate::error::Result;
use net::Net;
use store::Saved;

pub use net::mount;

struct Node {
    dir: PathBuf,
    app: AppHandle,
    saved: Mutex<Saved>,
    attention: AtomicBool,
    net: OnceLock<Net>,
    gate: Mutex<browse::Gate>,
    _lock: File,
}

fn node(app: &AppHandle) -> Result<Arc<Node>> {
    static NODE: Mutex<Option<Arc<Node>>> = Mutex::new(None);

    let mut slot = NODE.lock().unwrap();

    if let Some(node) = slot.as_ref() {
        return Ok(node.clone());
    }

    let node = Arc::new(Node::load(app)?);

    *slot = Some(node.clone());

    Ok(node)
}

pub fn start(app: &AppHandle) {
    #[cfg(mobile)]
    {
        use tauri::Manager;

        let scope = app.asset_protocol_scope();

        for root in browse::drives() {
            let _ = scope.allow_directory(root, true);
        }

        if let Ok(cache) = app.path().app_cache_dir() {
            let _ = scope.allow_directory(cache, true);
        }

        let window = app.clone();

        // plugin setup runs while Tauri holds the plugin store lock, and building a webview takes it again
        tauri::async_runtime::spawn(async move {
            let _ = tauri::WebviewWindowBuilder::new(
                &window,
                "files-mobile",
                tauri::WebviewUrl::App("mobile".into()),
            )
            .build();
        });
    }

    let _ = node(app);
}
