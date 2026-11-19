use std::fs::{OpenOptions, TryLockError};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Mutex, MutexGuard, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use super::browse::{members, Browse, Member};
use super::wire::{self, fail};
use super::Node;
use crate::error::{Error, Result};

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Saved {
    #[serde(default)]
    pub(super) browse: Browse,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    devices: Vec<Member>,
    browse: Browse,
    browse_asks: Vec<Member>,
}

fn read_saved(file: &Path) -> Result<Option<Saved>> {
    let bytes = match std::fs::read(file) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };

    if let Ok(saved) = serde_json::from_slice(&bytes) {
        return Ok(Some(saved));
    }

    let folder = file.parent().ok_or(Error::Invalid)?;

    std::fs::rename(file, wire::vacant(folder, "share.json.bad"))?;

    Ok(None)
}

// Atrix and Atrix Files run side by side and each holds its own node, so the desktop host keeps a separate store
fn node_dir(app: &AppHandle) -> Result<PathBuf> {
    let base = crate::data_dir(app)?;
    let embedded = app
        .try_state::<crate::Host>()
        .is_some_and(|host| host.marker.is_some());

    Ok(if embedded { base.join("atrix") } else { base })
}

impl Node {
    pub(super) fn load(app: &AppHandle) -> Result<Self> {
        let dir = node_dir(app)?;

        std::fs::create_dir_all(&dir)?;

        let lock = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(false)
            .open(dir.join("share.lock"))?;

        match lock.try_lock() {
            Ok(()) => {}
            // std has no file locks on Android, where the store has one app process anyway
            Err(TryLockError::Error(error)) if error.kind() == ErrorKind::Unsupported => {}
            Err(_) => return Err(Error::Busy),
        }

        let saved = read_saved(&dir.join("share.json"))?.unwrap_or_default();

        Ok(Self {
            dir,
            app: app.clone(),
            saved: Mutex::new(saved),
            attention: AtomicBool::new(false),
            net: OnceLock::new(),
            gate: Mutex::default(),
            _lock: lock,
        })
    }

    pub(super) fn lock(&self) -> MutexGuard<'_, Saved> {
        self.saved.lock().unwrap()
    }

    fn persist(&self, saved: &Saved) -> Result<()> {
        let file = self.dir.join("share.json");
        let staging = file.with_extension("json.tmp");

        std::fs::write(&staging, serde_json::to_vec(saved).map_err(fail)?)?;
        std::fs::rename(staging, file)?;

        Ok(())
    }

    pub(super) fn changed(&self) {
        let _ = self.app.emit("share-changed", ());
    }

    pub(super) fn update<T>(&self, change: impl FnOnce(&mut Saved) -> T) -> Result<T> {
        let (value, stored) = {
            let mut saved = self.lock();
            let value = change(&mut saved);

            (value, self.persist(&saved))
        };

        self.changed();

        stored.map(|_| value)
    }

    pub(super) fn state(&self) -> State {
        let devices = members(&self.app);
        let browse_asks = self.browse_asks();
        let mut browse = self.lock().browse.clone();

        browse
            .always
            .retain(|id| devices.iter().any(|device| device.id == *id));

        State {
            devices,
            browse,
            browse_asks,
        }
    }
}
