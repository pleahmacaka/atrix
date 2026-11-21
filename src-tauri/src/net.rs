use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use atrix_net::{Event, Info, Key, Member, Node, Pairing};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use crate::error::{Error, Result};
use crate::platform;

const HEADLESS_PAIR_MINUTES: u64 = 10;

type Sink = Arc<Mutex<Option<Channel<Event>>>>;

#[derive(Default)]
pub struct Net {
    node: tauri::async_runtime::Mutex<Option<Node>>,
    sink: Sink,
}

fn load_key(path: &Path) -> Result<Key> {
    match fs::read(path) {
        Ok(bytes) => <[u8; 32]>::try_from(bytes.as_slice())
            .map(|b| Key::from_bytes(&b))
            .map_err(|_| Error::code("net_key_invalid", path.display())),
        Err(e) if e.kind() == ErrorKind::NotFound => create_key(path),
        Err(_) => Err(Error::code("net_key_invalid", path.display())),
    }
}

fn create_key(path: &Path) -> Result<Key> {
    let key = Key::generate();

    write_private(path, &key.to_bytes())?;

    Ok(key)
}

fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let staged = path.with_extension("tmp");

    fs::write(&staged, [])?;
    platform::make_private(&staged)?;
    fs::write(&staged, bytes)?;
    fs::rename(&staged, path)
}

fn load_peers(path: &Path) -> Vec<Member> {
    fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn deliver(sink: &Sink, event: Event) {
    if let Some(channel) = sink.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
        let _ = channel.send(event);
    }
}

async fn node(net: &State<'_, Net>) -> Result<Node> {
    Ok(net.node.lock().await.clone().ok_or("net_stopped:")?)
}

#[tauri::command]
pub async fn net_start(
    app: AppHandle,
    net: State<'_, Net>,
    info: Info,
    channel: Channel<Event>,
) -> Result<String> {
    *net.sink.lock().unwrap_or_else(|e| e.into_inner()) = Some(channel);

    let mut slot = net.node.lock().await;

    if let Some(node) = slot.as_ref() {
        node.set_info(info);
        node.announce();

        return Ok(node.id());
    }

    let dir = app.path().app_data_dir()?.join("net");

    fs::create_dir_all(&dir)?;

    let key = load_key(&dir.join("key"))?;
    let roster = dir.join("peers.json");
    let (node, mut events) = Node::start(key, load_peers(&roster), info).await?;
    let sink = net.sink.clone();

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            if let Event::Peers { peers } = &event
                && let Ok(json) = serde_json::to_vec_pretty(peers)
            {
                let _ = write_private(&roster, &json);
            }

            deliver(&sink, event);
        }
    });

    let id = node.id();

    node.announce();

    if app.state::<crate::launch::Launch>().headless {
        let issuer = node.clone();

        tauri::async_runtime::spawn(async move {
            loop {
                let pairing = issuer.issue(HEADLESS_PAIR_MINUTES).await;

                println!(
                    "pair code ({HEADLESS_PAIR_MINUTES} minutes): {}",
                    pairing.code
                );

                tokio::time::sleep(Duration::from_secs(HEADLESS_PAIR_MINUTES * 60)).await;
            }
        });
    }
    *slot = Some(node);

    Ok(id)
}

#[tauri::command]
pub async fn net_info(net: State<'_, Net>, info: Info) -> Result<()> {
    node(&net).await?.set_info(info);

    Ok(())
}

#[tauri::command]
pub async fn net_send(net: State<'_, Net>, to: Option<String>, data: String) -> Result<()> {
    Ok(node(&net).await?.send(to.as_deref(), data)?)
}

#[tauri::command]
pub async fn net_request(net: State<'_, Net>, to: String, data: String) -> Result<String> {
    Ok(node(&net).await?.request(&to, data).await?)
}

#[tauri::command]
pub async fn net_reply(net: State<'_, Net>, id: u64, data: String) -> Result<()> {
    node(&net).await?.reply(id, data);

    Ok(())
}

#[tauri::command]
pub async fn net_issue(net: State<'_, Net>, minutes: u64) -> Result<Pairing> {
    Ok(node(&net).await?.issue(minutes).await)
}

#[tauri::command]
pub async fn net_cancel(net: State<'_, Net>) -> Result<()> {
    node(&net).await?.cancel();

    Ok(())
}

#[tauri::command]
pub async fn net_join(net: State<'_, Net>, code: String) -> Result<String> {
    Ok(node(&net).await?.join(&code).await?)
}

#[tauri::command]
pub async fn net_unpair(net: State<'_, Net>, id: String) -> Result<()> {
    node(&net).await?.unpair(&id);

    Ok(())
}
