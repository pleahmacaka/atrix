use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use atrix_net::{Event, Info, Key, Member, Node, Pairing};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::OnceCell;
use tokio::sync::mpsc::UnboundedReceiver;

use crate::error::{Error, Result};
use crate::platform;

const HEADLESS_PAIR_MINUTES: u64 = 10;

const ROSTER_EVENT: &str = "net-roster";

type Sink = Arc<Mutex<Option<Channel<Event>>>>;

#[derive(Default)]
pub struct Net {
    node: OnceCell<Node>,
    sink: Sink,
}

fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let staged = path.with_extension("tmp");

    fs::write(&staged, [])?;
    platform::make_private(&staged)?;
    fs::write(&staged, bytes)?;
    fs::rename(&staged, path)
}

fn load_key(path: &Path) -> Result<Key> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == ErrorKind::NotFound => {
            let key = Key::generate();

            write_private(path, &key.to_bytes())?;

            return Ok(key);
        }
        Err(_) => return Err(Error::code("net_key_invalid", path.display())),
    };

    <[u8; 32]>::try_from(bytes.as_slice())
        .map(|bytes| Key::from_bytes(&bytes))
        .map_err(|_| Error::code("net_key_invalid", path.display()))
}

fn load_peers(path: &Path) -> Vec<Member> {
    fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn deliver(sink: &Sink, event: Event) {
    if let Some(channel) = sink.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
        let _ = channel.send(event);
    }
}

fn save_peers(roster: &Path, peers: &[Member]) {
    if let Ok(json) = serde_json::to_vec_pretty(peers) {
        let _ = write_private(roster, &json);
    }
}

fn forward(app: AppHandle, mut events: UnboundedReceiver<Event>, sink: Sink, roster: PathBuf) {
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            if let Event::Peers { peers } = &event {
                save_peers(&roster, peers);
                let _ = app.emit("share-changed", ());
            }

            if matches!(event, Event::Peers { .. } | Event::Paired { .. }) {
                let _ = app.emit(ROSTER_EVENT, &event);
            }

            deliver(&sink, event);
        }
    });
}

fn issue_headless_pairs(node: Node) {
    let minutes = HEADLESS_PAIR_MINUTES;

    tauri::async_runtime::spawn(async move {
        loop {
            let pairing = node.issue(minutes).await;

            println!("pair code ({minutes} minutes): {}", pairing.code);

            tokio::time::sleep(Duration::from_secs(minutes * 60)).await;
        }
    });
}

fn node<'a>(net: &'a State<'_, Net>) -> Result<&'a Node> {
    net.node.get().ok_or("net_stopped:".into())
}

pub fn paired(app: &AppHandle) -> Vec<(String, String)> {
    let Some(node) = app.state::<Net>().inner().node.get() else {
        return Vec::new();
    };

    node.peers()
        .into_iter()
        .filter(|m| !m.removed)
        .map(|m| (m.id, m.info.name))
        .collect()
}

async fn launch(app: &AppHandle, sink: Sink, info: Info) -> Result<Node> {
    let dir = app.path().app_data_dir()?.join("net");

    fs::create_dir_all(&dir)?;

    let router = atrix_net::bind(load_key(&dir.join("key"))?).await?;
    let router = tauri_plugin_atrix_files::mount_share(app, router).await;
    let roster = dir.join("peers.json");
    let (node, events) = Node::serve(router, load_peers(&roster), info);

    forward(app.clone(), events, sink, roster);

    if app.state::<crate::launch::Launch>().headless {
        issue_headless_pairs(node.clone());
    }

    node.announce();

    Ok(node)
}

#[tauri::command]
pub async fn net_start(
    app: AppHandle,
    net: State<'_, Net>,
    info: Info,
    channel: Channel<Event>,
) -> Result<String> {
    *net.sink.lock().unwrap_or_else(|e| e.into_inner()) = Some(channel);

    if let Some(node) = net.node.get() {
        node.set_info(info);
        node.announce();

        return Ok(node.id());
    }

    let node = net
        .node
        .get_or_try_init(|| launch(&app, net.sink.clone(), info))
        .await?;

    Ok(node.id())
}

#[tauri::command]
pub fn net_roster(net: State<'_, Net>) -> Option<Vec<Member>> {
    net.node.get().map(Node::peers)
}

#[tauri::command]
pub async fn net_info(net: State<'_, Net>, info: Info) -> Result<()> {
    node(&net)?.set_info(info);

    Ok(())
}

#[tauri::command]
pub async fn net_send(net: State<'_, Net>, to: Option<String>, data: String) -> Result<()> {
    node(&net)?.send(to.as_deref(), data)?;

    Ok(())
}

#[tauri::command]
pub async fn net_request(net: State<'_, Net>, to: String, data: String) -> Result<String> {
    Ok(node(&net)?.request(&to, data).await?)
}

#[tauri::command]
pub async fn net_reply(net: State<'_, Net>, id: u64, data: String) -> Result<()> {
    node(&net)?.reply(id, data);

    Ok(())
}

#[tauri::command]
pub async fn net_issue(net: State<'_, Net>, minutes: u64) -> Result<Pairing> {
    Ok(node(&net)?.issue(minutes).await)
}

#[tauri::command]
pub async fn net_cancel(net: State<'_, Net>) -> Result<()> {
    node(&net)?.cancel();

    Ok(())
}

#[tauri::command]
pub async fn net_join(net: State<'_, Net>, code: String) -> Result<String> {
    Ok(node(&net)?.join(&code).await?)
}

#[tauri::command]
pub async fn net_unpair(net: State<'_, Net>, id: String) -> Result<()> {
    node(&net)?.unpair(&id);

    Ok(())
}
