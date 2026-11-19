pub(crate) mod appbar;
pub(crate) mod desktop;
pub(crate) mod edge;
pub(crate) mod edit;
pub(crate) mod features;
pub(crate) mod outside;
pub(crate) mod preview;
pub(crate) mod priority;
pub(crate) mod shortcuts;
pub(crate) mod windowing;
pub(crate) mod winkey;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, DeviceEventFilter, Listener};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_store::StoreExt;

use crate::desktop::apps::launcher;
use crate::desktop::system::share;
use crate::desktop::{clipboard, usage};
use features::{DOCK_ON, LAUNCHER_ON, release_shell, start_dock, stored_features, sync_topbar};

static RUNNING: AtomicBool = AtomicBool::new(false);

fn onboarded(app: &AppHandle) -> bool {
    app.store("settings.json")
        .ok()
        .and_then(|store| store.get("device"))
        .and_then(|device| device.get("onboarded")?.as_bool())
        .unwrap_or(false)
}

// the installer swaps the exe on rename but leaves the Run key and statusLine on the old path
fn follow_exe(app: &AppHandle) {
    usage::repoint_usage_bridge();

    let launch = app.autolaunch();

    if launch.is_enabled().unwrap_or(false) {
        let _ = launch.enable();
    }
}

pub fn start(app: &AppHandle) {
    RUNNING.store(true, Ordering::Relaxed);

    if !cfg!(debug_assertions) {
        follow_exe(app);
    }

    // windows skips a low level keyboard hook whose process registered for raw input
    app.set_device_event_filter(DeviceEventFilter::Always);

    priority::start(app);
    winkey::install(app.clone());
    clipboard::watch(app.clone());
    desktop::watch(app.clone());
    launcher::watch(app.clone());

    app.listen_any("store://change", {
        let app = app.clone();

        move |event| {
            let device = serde_json::from_str::<serde_json::Value>(event.payload())
                .is_ok_and(|change| change["key"] == "device");

            // the store emits while it holds its own locks, so reading it here would deadlock
            if device {
                let app = app.clone();

                std::thread::spawn(move || sync_topbar(&app));
            }
        }
    });

    share::watch(app.clone());

    if stored_features(app).launcher {
        let _ = shortcuts::set_launcher_shortcut(app.clone(), Some("Alt+Space".into()));
    }
}

pub fn ready(app: &AppHandle) {
    if !RUNNING.load(Ordering::Relaxed) {
        return;
    }

    sync_topbar(app);

    let features = stored_features(app);

    DOCK_ON.store(features.dock, Ordering::Relaxed);
    LAUNCHER_ON.store(features.launcher, Ordering::Relaxed);

    let app = app.clone();

    std::thread::spawn(move || {
        windowing::build_resident(&app);

        if features.dock {
            windowing::show(&app, "taskbar");
            start_dock(&app);
        }

        if !onboarded(&app) {
            windowing::show(&app, "onboarding");
        }
    });
}

pub fn exit(app: &AppHandle) {
    if RUNNING.load(Ordering::Relaxed) {
        clipboard::flush(app);
        release_shell(app);
    }
}
