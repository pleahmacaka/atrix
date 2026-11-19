use std::collections::HashMap;
use std::fs::{self, File, TryLockError};
use std::io::{ErrorKind, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use serde_json::{Value, json};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::{AppHandle, Manager};

fn home_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().home_dir().ok()
}

#[tauri::command(async)]
pub fn claude_presence(app: AppHandle) -> Vec<Value> {
    let Some(home) = home_dir(&app) else {
        return Vec::new();
    };
    let Ok(entries) = fs::read_dir(home.join(".claude").join("sessions")) else {
        return Vec::new();
    };

    let records: Vec<(Pid, Value)> = entries
        .flatten()
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
        .filter_map(|entry| fs::read(entry.path()).ok())
        .filter_map(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .filter_map(|record| {
            let pid = u32::try_from(record["pid"].as_u64()?).ok()?;

            Some((Pid::from_u32(pid), record))
        })
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
    home_dir(app).map(|home| home.join(".codex"))
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
        .map(|entry| entry.path())
        .filter(|path| held(path))
        .filter_map(|path| {
            let name = path.file_name()?.to_str()?;

            Some(name.strip_suffix(".lock")?.to_owned())
        })
        .filter(|id| !id.starts_with('.'))
        .collect()
}

fn newest_first(dir: &Path) -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = fs::read_dir(dir)
        .map(|entries| entries.flatten().map(|entry| entry.path()).collect())
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
        .find(|file| file.to_string_lossy().ends_with(&suffix))
        .map(|file| file.to_string_lossy().into_owned())
}

const TAIL_BYTES: u64 = 64 * 1024;

const TAIL_LINES: usize = 24;

fn tail(file: &mut File) -> Vec<String> {
    let length = file.metadata().map(|meta| meta.len()).unwrap_or(0);
    let mut buffer = Vec::new();

    if file
        .seek(SeekFrom::Start(length.saturating_sub(TAIL_BYTES)))
        .and_then(|_| file.read_to_end(&mut buffer))
        .is_err()
    {
        return Vec::new();
    }

    let text = String::from_utf8_lossy(&buffer);
    let lines: Vec<String> = text
        .lines()
        .filter(|line| line.starts_with('{'))
        .map(str::to_owned)
        .collect();

    lines[lines.len().saturating_sub(TAIL_LINES)..].to_vec()
}

fn tail_lines(path: &Path) -> Vec<String> {
    File::open(path)
        .map(|mut file| tail(&mut file))
        .unwrap_or_default()
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

    Some(json!({
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
    let Ok(mut file) = File::open(path) else {
        return Vec::new();
    };
    let mut fresh = Vec::new();

    if file.seek(SeekFrom::Start(usage.offset)).is_err() || file.read_to_end(&mut fresh).is_err() {
        return usage.rows.clone();
    }

    let Some(end) = fresh.iter().rposition(|byte| *byte == b'\n') else {
        return usage.rows.clone();
    };
    let text = String::from_utf8_lossy(&fresh[..=end]);

    for line in text.lines() {
        if usage.rows.is_empty()
            && let Some(at) = serde_json::from_str::<Value>(line)
                .ok()
                .and_then(|row| row.get("timestamp").cloned())
        {
            usage.rows.push(json!({ "type": "start", "timestamp": at }));
        }

        if line.contains("\"api-request\"") || line.contains("\"output_tokens\"") {
            usage.rows.extend(usage_row(line));
        }
    }

    usage.offset += end as u64 + 1;

    usage.rows.clone()
}

const STALE: Duration = Duration::from_secs(15 * 60);

fn stale(path: &Path) -> bool {
    fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|at| at.elapsed().ok())
        .is_none_or(|age| age > STALE)
}

fn subagent(meta: &Path) -> Option<Value> {
    let id = meta.file_name()?.to_str()?.strip_suffix(".meta.json")?;
    let parsed: Value = serde_json::from_slice(&fs::read(meta).ok()?).ok()?;

    if parsed.get("finished").and_then(Value::as_bool) == Some(true) {
        return None;
    }

    let log = meta.with_file_name(format!("{id}.jsonl"));

    if stale(&log) {
        return None;
    }

    Some(json!({
        "id": id,
        "meta": parsed,
        "tail": tail_lines(&log),
        "usage": usage_lines(&log),
    }))
}

#[tauri::command(async)]
pub fn claude_subagents(transcript: String) -> Vec<Value> {
    let folder = Path::new(&transcript).with_extension("").join("subagents");
    let Ok(entries) = fs::read_dir(&folder) else {
        return Vec::new();
    };

    entries
        .flatten()
        .filter_map(|entry| subagent(&entry.path()))
        .collect()
}
