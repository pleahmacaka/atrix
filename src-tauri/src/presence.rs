use std::fs;

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
