use std::collections::HashMap;
use std::fs::{self, TryLockError};
use std::io::ErrorKind;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

use serde_json::Value;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::{AppHandle, Manager};

#[tauri::command(async)]
pub fn claude_presence(app: AppHandle) -> Vec<Value> {
    let Ok(home) = app.path().home_dir() else {
        return Vec::new();
    };
    let Ok(entries) = fs::read_dir(home.join(".claude").join("sessions")) else {
        return Vec::new();
    };

    let records: Vec<(Pid, Value)> = entries
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| fs::read(e.path()).ok())
        .filter_map(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .filter_map(|r| Some((Pid::from_u32(r["pid"].as_u64()? as u32), r)))
        .collect();
    let pids: Vec<Pid> = records.iter().map(|(pid, _)| *pid).collect();
    let mut system = System::new();

    system.refresh_processes_specifics(
        ProcessesToUpdate::Some(&pids),
        true,
        ProcessRefreshKind::nothing(),
    );

    records
        .into_iter()
        .filter(|(pid, _)| system.process(*pid).is_some())
        .map(|(_, record)| record)
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

#[tauri::command(async)]
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

#[tauri::command(async)]
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

const SUBAGENT_TAIL_BYTES: u64 = 64 * 1024;

const SUBAGENT_TAIL_LINES: usize = 24;

fn tail_lines(path: &Path) -> Vec<String> {
    use std::io::{Read, Seek, SeekFrom};

    let Ok(mut file) = fs::File::open(path) else {
        return Vec::new();
    };
    let length = file.metadata().map(|m| m.len()).unwrap_or(0);
    let mut buffer = Vec::new();

    if file
        .seek(SeekFrom::Start(length.saturating_sub(SUBAGENT_TAIL_BYTES)))
        .and_then(|_| file.read_to_end(&mut buffer))
        .is_err()
    {
        return Vec::new();
    }

    let text = String::from_utf8_lossy(&buffer);
    let lines: Vec<String> = text
        .lines()
        .filter(|l| l.starts_with('{'))
        .map(String::from)
        .collect();

    lines[lines.len().saturating_sub(SUBAGENT_TAIL_LINES)..].to_vec()
}

#[derive(Default)]
struct Usage {
    offset: u64,
    rows: Vec<Value>,
}

static USAGE: LazyLock<Mutex<HashMap<PathBuf, Usage>>> = LazyLock::new(Default::default);

fn usage_row(line: &str) -> Option<Value> {
    let row: Value = serde_json::from_str(line).ok()?;
    let message = row.get("message");

    Some(serde_json::json!({
        "type": row.get("type")?,
        "timestamp": row.get("timestamp")?,
        "id": message.and_then(|m| m.get("id")),
        "tokens": message.and_then(|m| m.pointer("/usage/output_tokens")),
    }))
}

fn usage_lines(path: &Path) -> Vec<Value> {
    let Ok(mut cache) = USAGE.lock() else {
        return Vec::new();
    };
    let usage = cache.entry(path.to_path_buf()).or_default();
    let Ok(mut file) = fs::File::open(path) else {
        return Vec::new();
    };
    let mut fresh = Vec::new();

    if file.seek(SeekFrom::Start(usage.offset)).is_err() || file.read_to_end(&mut fresh).is_err() {
        return usage.rows.clone();
    }

    let Some(end) = fresh.iter().rposition(|b| *b == b'\n') else {
        return usage.rows.clone();
    };
    let text = String::from_utf8_lossy(&fresh[..=end]);

    for line in text.lines() {
        if usage.rows.is_empty()
            && let Some(at) = serde_json::from_str::<Value>(line)
                .ok()
                .and_then(|row| row.get("timestamp").cloned())
        {
            usage
                .rows
                .push(serde_json::json!({ "type": "start", "timestamp": at }));
        }

        if line.contains("\"api-request\"") || line.contains("\"output_tokens\"") {
            usage.rows.extend(usage_row(line));
        }
    }

    usage.offset += end as u64 + 1;

    usage.rows.clone()
}

#[tauri::command(async)]
pub fn claude_subagents(transcript: String) -> Vec<Value> {
    let folder = Path::new(&transcript).with_extension("").join("subagents");
    let Ok(entries) = fs::read_dir(&folder) else {
        return Vec::new();
    };

    entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let id = path.file_name()?.to_str()?.strip_suffix(".meta.json")?;
            let meta: Value = serde_json::from_slice(&fs::read(&path).ok()?).ok()?;

            if meta.get("finished").and_then(Value::as_bool) == Some(true) {
                return None;
            }

            let log = folder.join(format!("{id}.jsonl"));
            let tail = tail_lines(&log);
            let usage = usage_lines(&log);

            Some(serde_json::json!({ "id": id, "meta": meta, "tail": tail, "usage": usage }))
        })
        .collect()
}
