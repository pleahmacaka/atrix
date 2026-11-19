use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(default)]
pub struct Components {
    pub shell: bool,
    pub files: bool,
    pub terminal: bool,
}

impl Default for Components {
    fn default() -> Self {
        Self {
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
        std::fs::read(path())
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    pub fn at_launch(headless: bool) -> Self {
        let mut components = Self::load();

        components.shell &= !headless;

        components
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

#[tauri::command]
pub fn desktop_components_get() -> Components {
    Components::load()
}

#[tauri::command]
pub fn desktop_components_set(components: Components) -> Result<()> {
    components.save()
}
