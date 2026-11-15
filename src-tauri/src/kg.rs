use std::env::consts::{ARCH, OS};
use std::fs;
use std::io::Read;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tokio::net::TcpStream;

use crate::error::{Error, Result};
use crate::{fetch, platform};

const READY_TIMEOUT: Duration = Duration::from_secs(10);

const VERSITYGW: &str = "v1.11.0";

const EXECUTABLE: &str = if cfg!(windows) {
    "versitygw.exe"
} else {
    "versitygw"
};

#[derive(Deserialize)]
struct Release {
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
    digest: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct Endpoint {
    port: u16,
    access: String,
    secret: String,
}

#[derive(Default)]
pub struct Store {
    running: Mutex<Option<(Child, Endpoint)>>,

    starting: tokio::sync::Mutex<()>,
}

impl Store {
    pub fn kill(&self) {
        if let Some((mut child, _)) = self.running.lock().unwrap().take() {
            let _ = child.kill();
        }
    }

    fn running(&self) -> Option<Endpoint> {
        let mut running = self.running.lock().unwrap();
        let (child, endpoint) = running.as_mut()?;

        child
            .try_wait()
            .is_ok_and(|status| status.is_none())
            .then(|| endpoint.clone())
    }
}

fn asset_name() -> Result<String> {
    let os = match OS {
        "windows" => "Windows",
        "linux" => "Linux",
        "macos" => "Darwin",
        "freebsd" => "Freebsd",
        other => return Err(Error::code("unsupported_platform", other)),
    };
    let arch = match ARCH {
        "x86_64" => "x86_64",
        "aarch64" => "arm64",
        other => return Err(Error::code("unsupported_platform", other)),
    };
    let extension = if cfg!(windows) { "zip" } else { "tar.gz" };

    Ok(format!("versitygw_{VERSITYGW}_{os}_{arch}.{extension}"))
}

#[cfg(windows)]
fn unpack(archive: &[u8]) -> Result<Vec<u8>> {
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(archive))?;
    let name = zip
        .file_names()
        .flatten()
        .find(|n| n.ends_with(&format!("/{EXECUTABLE}")))
        .map(|n| n.into_owned())
        .ok_or("versitygw_archive_invalid")?;
    let mut bytes = Vec::new();

    zip.by_name(&name)?.read_to_end(&mut bytes)?;

    Ok(bytes)
}

#[cfg(not(windows))]
fn unpack(archive: &[u8]) -> Result<Vec<u8>> {
    let mut tar = tar::Archive::new(flate2::read::GzDecoder::new(archive));

    for entry in tar.entries()? {
        let mut entry = entry?;

        if entry.path()?.file_name().is_some_and(|n| n == EXECUTABLE) {
            let mut bytes = Vec::new();

            entry.read_to_end(&mut bytes)?;

            return Ok(bytes);
        }
    }

    Err("versitygw_archive_invalid".into())
}

async fn download(target: &Path) -> Result<()> {
    let client = fetch::client()?;
    let listing = fetch::get(
        &client,
        &format!("https://api.github.com/repos/versity/versitygw/releases/tags/{VERSITYGW}"),
        "versitygw_download",
    )
    .await?;
    let release: Release = serde_json::from_slice(&listing)?;
    let name = asset_name()?;
    let asset = release
        .assets
        .into_iter()
        .find(|a| a.name == name)
        .ok_or("versitygw_archive_invalid")?;
    let expected = asset
        .digest
        .as_deref()
        .and_then(|d| d.strip_prefix("sha256:"))
        .ok_or("versitygw_archive_invalid")?
        .to_owned();
    let archive = fetch::get(&client, &asset.browser_download_url, "versitygw_download").await?;

    if fetch::sha256_hex(&archive) != expected {
        return Err("versitygw_checksum_mismatch".into());
    }

    let binary = unpack(&archive)?;
    let partial = target.with_extension("partial");

    fs::create_dir_all(target.parent().ok_or("versitygw_archive_invalid")?)?;
    fs::write(&partial, binary)?;
    platform::make_executable(&partial)?;
    fs::rename(&partial, target)?;

    Ok(())
}

async fn binary(home: &Path) -> Result<PathBuf> {
    let local = home.join(".atrix").join("bin").join(EXECUTABLE);

    if local.exists() {
        return Ok(local);
    }

    if let Ok(found) = which::which("versitygw") {
        return Ok(found);
    }

    download(&local).await?;

    Ok(local)
}

fn free_port() -> Result<u16> {
    Ok(TcpListener::bind("127.0.0.1:0")?.local_addr()?.port())
}

async fn wait_ready(port: u16) -> Result<()> {
    let start = Instant::now();

    while start.elapsed() < READY_TIMEOUT {
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
            return Ok(());
        }

        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    Err("kg_store_timeout".into())
}

#[tauri::command]
pub async fn kg_start(
    app: AppHandle,
    store: State<'_, Store>,
    access: String,
    secret: String,
) -> Result<Endpoint> {
    let _starting = store.starting.lock().await;

    if let Some(endpoint) = store.running() {
        return Ok(endpoint);
    }

    let home = app.path().home_dir()?;
    let program = binary(&home).await?;
    let root = home.join(".atrix").join("kg");
    let dirs = ["data", "meta", "versions"].map(|d| root.join(d));

    for dir in &dirs {
        fs::create_dir_all(dir)?;
    }

    let [data, meta, versions] = dirs;
    let port = free_port()?;
    let mut child = platform::hidden(program)
        .env("ROOT_ACCESS_KEY", &access)
        .env("ROOT_SECRET_KEY", &secret)
        .args(["--port", &format!("127.0.0.1:{port}"), "--quiet", "posix"])
        .arg("--sidecar")
        .arg(meta)
        .arg("--versioning-dir")
        .arg(versions)
        .arg(data)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    let endpoint = Endpoint {
        port,
        access,
        secret,
    };

    if let Err(e) = wait_ready(port).await {
        let _ = child.kill();
        let _ = child.wait();

        return Err(e);
    }

    *store.running.lock().unwrap() = Some((child, endpoint.clone()));

    Ok(endpoint)
}
