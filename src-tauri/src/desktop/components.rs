use std::path::PathBuf;
use std::sync::{Mutex, PoisonError};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use crate::error::Result;

const SETTINGS: &str = "settings";

const SETTINGS_OPENED: &str = "desktop-settings:open";

static SECTION: Mutex<Option<String>> = Mutex::new(None);

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(default)]
pub struct Components {
    pub agent: bool,
    pub shell: bool,
    pub files: bool,
    pub terminal: bool,
}

impl Default for Components {
    fn default() -> Self {
        Self {
            agent: true,
            shell: false,
            files: false,
            terminal: true,
        }
    }
}

fn path() -> PathBuf {
    crate::process::home().join(".atrix").join("desktop.json")
}

impl Components {
    pub fn load() -> Self {
        let saved: Self = std::fs::read(path())
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();

        Self {
            agent: saved.agent || !(cfg!(windows) && saved.shell),
            ..saved
        }
    }

    pub fn at_launch(self, headless: bool) -> Self {
        Self {
            shell: self.shell && !headless,
            ..self
        }
    }

    fn save(&self) -> Result<()> {
        let path = path();

        if let Some(folder) = path.parent() {
            std::fs::create_dir_all(folder)?;
        }

        std::fs::write(path, serde_json::to_vec_pretty(self)?)?;

        Ok(())
    }
}

pub fn open_settings<R: Runtime>(app: &AppHandle<R>, section: Option<String>) {
    *SECTION.lock().unwrap_or_else(PoisonError::into_inner) = section;

    let app = app.clone();

    // building a webview inside a main-thread callback deadlocks the event loop
    std::thread::spawn(move || {
        if let Some(window) = app.get_webview_window(SETTINGS) {
            let _ = app.emit_to(SETTINGS, SETTINGS_OPENED, ());

            if !atrix_window_kit::headless() {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }

            return;
        }

        let config = app
            .config()
            .app
            .windows
            .iter()
            .find(|window| window.label == SETTINGS)
            .cloned();

        if let Some(builder) =
            config.and_then(|config| tauri::WebviewWindowBuilder::from_config(&app, &config).ok())
        {
            let _ = atrix_window_kit::build(builder);
        }
    });
}

#[tauri::command]
pub fn desktop_components_get() -> Components {
    Components::load()
}

#[tauri::command]
pub fn desktop_components_set(components: Components) -> Result<()> {
    components.save()
}

#[tauri::command]
pub fn desktop_components_launched(launched: State<'_, Components>) -> Components {
    *launched
}

#[tauri::command]
pub fn desktop_settings_open(app: AppHandle, section: Option<String>) {
    open_settings(&app, section);
}

#[tauri::command]
pub fn desktop_settings_section() -> Option<String> {
    SECTION
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .take()
}
