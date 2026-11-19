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

const SUBMIT_LIMIT: Duration = Duration::from_secs(300);

const POLL: Duration = Duration::from_millis(200);

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
    process::which("tokscale").is_some()
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

        thread::sleep(POLL);
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

fn token(app: &AppHandle) -> Result<String> {
    #[derive(Deserialize)]
    struct Credentials {
        token: String,
    }

    let path = app
        .path()
        .home_dir()?
        .join(".config")
        .join("tokscale")
        .join("credentials.json");

    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .map(|credentials: Credentials| credentials.token)
        .ok_or_else(|| Error::from("usage_login"))
}

#[tauri::command]
pub async fn usage_graph(app: AppHandle) -> Result<String> {
    let response = fetch::client()?
        .get(STATS)
        .bearer_auth(token(&app)?)
        .send()
        .await
        .map_err(|e| Error::code("usage_failed", e))?;

    if response.status() == StatusCode::UNAUTHORIZED {
        return Err("usage_login".into());
    }

    response
        .error_for_status()
        .map_err(|e| Error::code("usage_failed", e))?
        .text()
        .await
        .map_err(|e| Error::code("usage_failed", e))
}

#[tauri::command]
pub async fn usage_submit() -> Result<()> {
    tauri::async_runtime::spawn_blocking(|| {
        tokscale(&["submit"], "usage_submit_failed", SUBMIT_LIMIT).map(|_| ())
    })
    .await?
}

#[tauri::command]
pub async fn usage_adopt_schedule() -> Result<u32> {
    if !installed() {
        return Ok(0);
    }

    tauri::async_runtime::spawn_blocking(|| {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Schedule {
            enabled: bool,
            interval_minutes: u32,
        }

        let output = tokscale(
            &["autosubmit", "status", "--json"],
            "usage_submit_failed",
            STATUS_LIMIT,
        )?;
        let schedule: Schedule = serde_json::from_str(&output)?;

        if !schedule.enabled {
            return Ok(0);
        }

        // the OS scheduler entry runs a console exe, which flashes a terminal window on Windows
        tokscale(
            &["autosubmit", "disable"],
            "usage_submit_failed",
            SCHEDULE_LIMIT,
        )?;

        Ok(schedule.interval_minutes)
    })
    .await?
}
