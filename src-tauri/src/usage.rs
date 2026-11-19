use std::fs;
use std::io::Read;
use std::process::Stdio;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde::Deserialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_http::reqwest::StatusCode;

use crate::error::{Error, Result};
use crate::{fetch, platform, process};

const STATS: &str = "https://tokscale.ai/api/me/stats";

const STATUS_LIMIT: Duration = Duration::from_secs(20);

const SCHEDULE_LIMIT: Duration = Duration::from_secs(120);

const HOURS: [u32; 3] = [1, 6, 24];

fn drain(pipe: Option<impl Read + Send + 'static>) -> JoinHandle<Vec<u8>> {
    thread::spawn(move || {
        let mut bytes = Vec::new();

        if let Some(mut pipe) = pipe {
            let _ = pipe.read_to_end(&mut bytes);
        }

        bytes
    })
}

fn installed() -> bool {
    process::command("tokscale").is_ok()
}

fn tokscale(args: &[&str], failure: &str, limit: Duration) -> Result<String> {
    let mut command = process::command("tokscale").map_err(|_| Error::from("usage_missing"))?;

    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = platform::tree(command).spawn()?;
    let stdout = drain(child.stdout().take());
    let stderr = drain(child.stderr().take());
    let started = Instant::now();

    while child.try_wait()?.is_none() {
        if started.elapsed() > limit {
            let _ = child.kill();

            return Err("usage_timeout".into());
        }

        thread::sleep(Duration::from_millis(200));
    }

    let status = child.wait()?;
    let output = stdout.join().unwrap_or_default();

    if !status.success() {
        let errors = stderr.join().unwrap_or_default();

        return Err(Error::code(
            failure,
            String::from_utf8_lossy(&errors).trim(),
        ));
    }

    Ok(String::from_utf8_lossy(&output).into_owned())
}

#[derive(Deserialize)]
struct Credentials {
    token: String,
}

#[tauri::command]
pub async fn usage_graph(app: AppHandle) -> Result<String> {
    let path = app
        .path()
        .home_dir()?
        .join(".config")
        .join("tokscale")
        .join("credentials.json");
    let credentials: Credentials = fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .ok_or_else(|| Error::from("usage_login"))?;

    let response = fetch::client()?
        .get(STATS)
        .bearer_auth(credentials.token)
        .send()
        .await
        .map_err(|e| Error::code("usage_failed", e))?;

    if response.status() == StatusCode::UNAUTHORIZED {
        return Err("usage_login".into());
    }

    let response = response
        .error_for_status()
        .map_err(|e| Error::code("usage_failed", e))?;

    response
        .text()
        .await
        .map_err(|e| Error::code("usage_failed", e))
}

#[tauri::command]
pub async fn usage_autosubmit(hours: u32) -> Result<()> {
    if hours != 0 && !HOURS.contains(&hours) {
        return Err(Error::code("usage_interval_invalid", hours));
    }

    if hours == 0 && !installed() {
        return Ok(());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let interval = format!("{hours}h");
        let args: &[&str] = if hours == 0 {
            &["autosubmit", "disable"]
        } else {
            &["autosubmit", "enable", "--interval", &interval]
        };

        tokscale(args, "usage_submit_failed", SCHEDULE_LIMIT).map(|_| ())
    })
    .await?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Schedule {
    enabled: bool,
    interval_minutes: u32,
}

#[tauri::command]
pub async fn usage_autosubmit_status() -> Result<u32> {
    if !installed() {
        return Ok(0);
    }

    tauri::async_runtime::spawn_blocking(|| {
        let output = tokscale(
            &["autosubmit", "status", "--json"],
            "usage_submit_failed",
            STATUS_LIMIT,
        )?;
        let schedule: Schedule = serde_json::from_str(&output)?;

        Ok(if schedule.enabled {
            schedule.interval_minutes
        } else {
            0
        })
    })
    .await?
}
