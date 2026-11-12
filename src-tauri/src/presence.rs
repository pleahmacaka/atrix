use std::fs::{self, TryLockError};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde_json::Value;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn claude_presence(app: AppHandle) -> Vec<Value> {
    let Ok(home) = app.path().home_dir() else {
        return Vec::new();
    };
    let Ok(entries) = fs::read_dir(home.join(".claude").join("sessions")) else {
        return Vec::new();
    };

    let records: Vec<Value> = entries
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| fs::read(e.path()).ok())
        .filter_map(|bytes| serde_json::from_slice(&bytes).ok())
        .collect();

    let pids: Vec<Pid> = records
        .iter()
        .filter_map(|r| r["pid"].as_u64())
        .map(|p| Pid::from_u32(p as u32))
        .collect();
    let mut system = System::new();

    system.refresh_processes_specifics(
        ProcessesToUpdate::Some(&pids),
        true,
        ProcessRefreshKind::nothing(),
    );

    records
        .into_iter()
        .filter(|r| {
            r["pid"]
                .as_u64()
                .is_some_and(|p| system.process(Pid::from_u32(p as u32)).is_some())
        })
        .collect()
}

fn codex_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().home_dir().ok().map(|h| h.join(".codex"))
}

fn held(path: &Path) -> bool {
    match fs::OpenOptions::new().read(true).write(true).open(path) {
        Ok(file) => matches!(file.try_lock(), Err(TryLockError::WouldBlock)),
        Err(e) => e.kind() != ErrorKind::NotFound,
    }
}

#[tauri::command]
pub fn codex_presence(app: AppHandle) -> Vec<String> {
    let Some(dir) = codex_dir(&app) else {
        return Vec::new();
    };
    let Ok(entries) = fs::read_dir(dir.join("thread-writer-locks")) else {
        return Vec::new();
    };

    entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| held(p))
        .filter_map(|p| {
            let name = p.file_name()?.to_str()?;

            name.strip_suffix(".lock")
                .filter(|id| !id.starts_with('.'))
                .map(str::to_owned)
        })
        .collect()
}

fn newest_first(dir: &Path) -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = fs::read_dir(dir)
        .map(|entries| entries.flatten().map(|e| e.path()).collect())
        .unwrap_or_default();

    paths.sort_unstable_by(|a, b| b.cmp(a));
    paths
}

#[tauri::command]
pub fn codex_rollout(app: AppHandle, id: String) -> Option<String> {
    let suffix = format!("-{id}.jsonl");
    let sessions = codex_dir(&app)?.join("sessions");

    newest_first(&sessions)
        .iter()
        .flat_map(|year| newest_first(year))
        .flat_map(|month| newest_first(&month))
        .flat_map(|day| newest_first(&day))
        .find(|f| f.to_string_lossy().ends_with(&suffix))
        .map(|f| f.to_string_lossy().into_owned())
}
