use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

use crate::error::Result;

const TEMPLATE: &str = "float";

#[tauri::command]
pub async fn float_open(app: AppHandle, label: String, url: String, title: String) -> Result<()> {
    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == TEMPLATE)
        .ok_or("float window is not configured")?
        .clone();

    config.label = label;
    config.url = WebviewUrl::App(url.into());
    config.title = title;

    let builder = WebviewWindowBuilder::from_config(&app, &config)?;

    #[cfg(debug_assertions)]
    let builder = builder.icon(crate::dev_icon())?;

    builder.build()?;

    Ok(())
}
