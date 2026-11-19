use tauri::{AppHandle, Manager, WebviewWindowBuilder};

use crate::error::Result;

const LABEL: &str = "overlay";

const MARGIN: f64 = 24.0;

fn corner(app: &AppHandle, width: f64, height: f64) -> Option<(f64, f64)> {
    let monitor = app.primary_monitor().ok()??;
    let area = monitor.work_area();
    let origin = area.position.to_logical::<f64>(monitor.scale_factor());
    let size = area.size.to_logical::<f64>(monitor.scale_factor());

    Some((
        origin.x + size.width - width - MARGIN,
        origin.y + size.height - height - MARGIN,
    ))
}

#[tauri::command]
pub async fn overlay_open(app: AppHandle, x: Option<f64>, y: Option<f64>) -> Result<()> {
    if app.get_webview_window(LABEL).is_some() {
        return Ok(());
    }

    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == LABEL)
        .cloned()
        .ok_or("overlay window is not configured")?;
    let position = match (x, y) {
        (Some(x), Some(y)) => Some((x, y)),
        _ => corner(&app, config.width, config.height),
    };
    let mut builder = WebviewWindowBuilder::from_config(&app, &config)?;

    if let Some((x, y)) = position {
        builder = builder.position(x, y);
    }

    builder.build()?;

    Ok(())
}
