#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod components;
#[cfg_attr(windows, path = "windows.rs")]
#[cfg_attr(target_os = "macos", path = "macos.rs")]
#[cfg_attr(all(unix, not(target_os = "macos")), path = "linux.rs")]
mod platform;
#[cfg(unix)]
mod unix;

use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use components::Components;

include!(concat!(env!("OUT_DIR"), "/payload.rs"));

pub(crate) fn fail(error: impl std::fmt::Display) -> String {
    error.to_string()
}

pub(crate) fn wait(done: impl Fn() -> bool, limit: Duration) -> bool {
    let start = Instant::now();

    while !done() {
        if start.elapsed() > limit {
            return false;
        }

        std::thread::sleep(Duration::from_millis(250));
    }

    true
}

#[derive(Serialize)]
struct Overview {
    version: &'static str,
    platform: &'static str,
    installed: bool,
    outdated: bool,
    available: bool,
    components: Components,
}

#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
enum State {
    Running,
    Done,
    Failed,
}

#[derive(Serialize, Clone)]
struct Step {
    id: &'static str,
    state: State,
    error: Option<String>,
}

fn step(
    handle: &AppHandle,
    id: &'static str,
    work: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let emit = |state, error| {
        let _ = handle.emit("step", Step { id, state, error });
    };

    emit(State::Running, None);

    let result = work();

    match &result {
        Ok(()) => emit(State::Done, None),
        Err(error) => emit(State::Failed, Some(error.clone())),
    }

    result
}

fn stop(handle: &AppHandle) -> Result<bool, String> {
    if !platform::running() {
        return Ok(false);
    }

    let shell = Components::load().shell;

    step(handle, "stop", || platform::stop(shell))?;

    Ok(true)
}

fn apply_blocking(handle: &AppHandle, chosen: Components) -> Result<(), String> {
    let chosen = chosen.for_platform();
    let fresh = !platform::installed();
    let restart = !fresh && stop(handle)?;

    if fresh || platform::outdated() {
        let payload = PAYLOAD.ok_or("setup package missing")?;

        step(handle, "client", || platform::install(payload))?;
    }

    step(handle, "components", || {
        chosen.save()?;
        platform::default_app(chosen.files)
    })?;

    if restart {
        step(handle, "start", platform::launch)?;
    }

    Ok(())
}

fn uninstall_blocking(handle: &AppHandle) -> Result<(), String> {
    stop(handle)?;
    step(handle, "remove", platform::uninstall)
}

#[tauri::command]
fn overview() -> Overview {
    Overview {
        version: VERSION,
        platform: platform::NAME,
        installed: platform::installed(),
        outdated: platform::outdated(),
        available: PAYLOAD.is_some(),
        components: Components::load().for_platform(),
    }
}

#[tauri::command]
async fn apply(handle: AppHandle, components: Components) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || apply_blocking(&handle, components))
        .await
        .map_err(fail)?
}

#[tauri::command]
async fn uninstall(handle: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || uninstall_blocking(&handle))
        .await
        .map_err(fail)?
}

#[tauri::command]
fn launch(handle: AppHandle) -> Result<(), String> {
    platform::launch()?;
    handle.exit(0);

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![overview, apply, uninstall, launch])
        .run(tauri::generate_context!())
        .expect("error while running the Atrix installer");
}
