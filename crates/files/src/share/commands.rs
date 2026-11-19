use std::sync::atomic::Ordering;

use iroh::EndpointId;
use tauri::AppHandle;

use super::browse::{local_dir, received_root, Answer, Browsed, LocalDir, Scope};
use super::node;
use super::store::State;
use super::wire::{Reply, Request};
use crate::error::{Error, Result};

#[tauri::command(async)]
pub fn share_state(app: AppHandle) -> Result<State> {
    Ok(node(&app)?.state())
}

#[tauri::command(async)]
pub fn share_take_attention(app: AppHandle) -> Result<bool> {
    Ok(node(&app)?.attention.swap(false, Ordering::Relaxed))
}

#[tauri::command(async)]
pub fn share_local(path: Option<String>) -> Result<LocalDir> {
    local_dir(path)
}

#[tauri::command(async)]
pub async fn share_browse(
    app: AppHandle,
    device: EndpointId,
    path: Option<String>,
) -> Result<Browsed> {
    Ok(
        match node(&app)?.call(device, Request::Browse { path }).await? {
            Reply::Listing { path, entries } => Browsed::Listing { path, entries },
            Reply::Pending => Browsed::Pending,
            _ => Browsed::Denied,
        },
    )
}

#[tauri::command(async)]
pub async fn share_browse_fetch(
    app: AppHandle,
    device: EndpointId,
    path: String,
) -> Result<Option<String>> {
    let node = node(&app)?;

    match node.call(device, Request::Fetch { path }).await? {
        Reply::Pending => Ok(None),
        Reply::Blob { hash, name, .. } => {
            let _transfer = node.transfer();

            node.save_remote(device, hash, &name, &received_root(&app)?)
                .await
                .map(Some)
        }
        _ => Err(Error::Denied),
    }
}

#[tauri::command(async)]
pub fn share_browse_answer(app: AppHandle, device: EndpointId, answer: Answer) -> Result<()> {
    node(&app)?.answer_browse(device, answer)
}

#[tauri::command(async)]
pub fn share_browse_revoke(app: AppHandle, device: EndpointId) -> Result<()> {
    node(&app)?.revoke_browse(device)
}

#[tauri::command(async)]
pub fn share_browse_scope(app: AppHandle, scope: Scope, folders: Vec<String>) -> Result<()> {
    node(&app)?.browse_scope(scope, folders)
}
