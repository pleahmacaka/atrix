use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::fail;

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
    std::env::home_dir()
        .unwrap_or_default()
        .join(".atrix")
        .join("desktop.json")
}

impl Components {
    pub fn load() -> Self {
        std::fs::read(path())
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    pub fn for_platform(mut self) -> Self {
        self.shell &= cfg!(windows);
        self.agent |= !self.shell;

        self
    }

    pub fn save(&self) -> Result<(), String> {
        let path = path();

        if let Some(folder) = path.parent() {
            std::fs::create_dir_all(folder).map_err(fail)?;
        }

        let json = serde_json::to_vec_pretty(self).map_err(fail)?;

        std::fs::write(path, json).map_err(fail)
    }
}
