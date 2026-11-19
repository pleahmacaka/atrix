use tauri::{AppHandle, Manager};

use crate::desktop::Components;

const FILES: &str = "atrix:files";

const TERMINAL: &str = "atrix:terminal";

pub fn icon(path: &str) -> Option<&'static [u8]> {
    match path {
        FILES => Some(tauri_plugin_atrix_files::ICON),
        TERMINAL => Some(tauri_plugin_atrix_terminal::ICON),
        _ => None,
    }
}

pub fn launch(app: &AppHandle, path: &str) -> Option<Result<(), String>> {
    let components = app.state::<Components>();

    match path {
        FILES if components.files => {
            tauri_plugin_atrix_files::show(app, None, false);

            Some(Ok(()))
        }
        TERMINAL if components.terminal => Some(
            tauri_plugin_atrix_terminal::open_window(app, None)
                .map(|_| ())
                .map_err(|e| e.to_string()),
        ),
        FILES | TERMINAL => Some(Ok(())),
        _ => None,
    }
}

pub fn location(path: &str) -> Option<String> {
    icon(path)?;

    std::env::current_exe()
        .ok()
        .map(|exe| exe.to_string_lossy().into_owned())
}
