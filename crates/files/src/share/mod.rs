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
use tokio::sync::watch;

use crate::error::Result;
use net::Net;
use store::Saved;

pub use net::mount;

#[cfg(target_os = "android")]
pub(crate) struct Mobile(pub(crate) tauri::plugin::PluginHandle<tauri::Wry>);

struct Node {
    dir: PathBuf,
    app: AppHandle,
    saved: Mutex<Saved>,
    attention: AtomicBool,
    net: OnceLock<Net>,
    gate: Mutex<browse::Gate>,
    transfers: watch::Sender<usize>,
    _lock: File,
}

struct Transfer(Arc<Node>);

impl Node {
    fn transfer(self: &Arc<Self>) -> Transfer {
        self.transfers.send_modify(|active| *active += 1);

        Transfer(self.clone())
    }
}

impl Drop for Transfer {
    fn drop(&mut self) {
        self.0.transfers.send_modify(|active| *active -= 1);
    }
}

fn node(app: &AppHandle) -> Result<Arc<Node>> {
    static NODE: Mutex<Option<Arc<Node>>> = Mutex::new(None);

    let mut slot = NODE.lock().unwrap();

    if let Some(node) = slot.as_ref() {
        return Ok(node.clone());
    }

    let node = Arc::new(Node::load(app)?);

    #[cfg(target_os = "android")]
    keep_alive(app.clone(), node.transfers.subscribe());

    *slot = Some(node.clone());

    Ok(node)
}

#[cfg(target_os = "android")]
async fn set_alive(app: &AppHandle, enabled: bool) {
    use tauri::Manager;

    let Some(mobile) = app.try_state::<Mobile>() else {
        return;
    };

    let payload = serde_json::json!({ "enabled": enabled });

    if let Err(error) = mobile
        .0
        .run_mobile_plugin_async::<serde_json::Value>("keepAlive", payload)
        .await
    {
        log::warn!("transfer service unavailable: {error}");
    }
}

#[cfg(target_os = "android")]
fn keep_alive(app: AppHandle, mut transfers: watch::Receiver<usize>) {
    // Android 8 and 9 crash the app when a foreground service stops before it calls startForeground
    const LINGER: std::time::Duration = std::time::Duration::from_secs(10);

    tauri::async_runtime::spawn(async move {
        loop {
            if transfers.wait_for(|active| *active > 0).await.is_err() {
                return;
            }

            set_alive(&app, true).await;

            loop {
                if transfers.wait_for(|active| *active == 0).await.is_err() {
                    return;
                }

                let resumed =
                    tokio::time::timeout(LINGER, transfers.wait_for(|active| *active > 0));

                match resumed.await {
                    Ok(Ok(_)) => continue,
                    Ok(Err(_)) => return,
                    Err(_) => break,
                }
            }

            set_alive(&app, false).await;
        }
    });
}

pub fn start(app: &AppHandle) {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;

        let scope = app.asset_protocol_scope();

        for root in browse::drives() {
            let _ = scope.allow_directory(root, true);
        }

        if let Ok(cache) = app.path().app_cache_dir() {
            let _ = scope.allow_directory(cache, true);
        }
    }

    let _ = node(app);
}
