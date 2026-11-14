use std::env::consts::{ARCH, OS};
use std::fs;
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_http::reqwest;

use crate::pcb::hex;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

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
pub struct Store(Mutex<Option<(Child, Endpoint)>>);

impl Store {
    pub fn kill(&self) {
        if let Some((mut child, _)) = self.0.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}

fn asset_name() -> Result<String, String> {
    let os = match OS {
        "windows" => "Windows",
        "linux" => "Linux",
        "macos" => "Darwin",
        "freebsd" => "Freebsd",
        other => return Err(format!("unsupported_platform:{other}")),
    };
    let arch = match ARCH {
        "x86_64" => "x86_64",
        "aarch64" => "arm64",
        other => return Err(format!("unsupported_platform:{other}")),
    };
    let extension = if cfg!(windows) { "zip" } else { "tar.gz" };

    Ok(format!("versitygw_{VERSITYGW}_{os}_{arch}.{extension}"))
}

#[cfg(windows)]
fn unpack(archive: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::{Cursor, Read};

    let mut zip = zip::ZipArchive::new(Cursor::new(archive)).map_err(|e| e.to_string())?;
    let name = zip
        .file_names()
        .filter_map(Result::ok)
        .find(|n| n.ends_with(&format!("/{EXECUTABLE}")))
        .map(|n| n.into_owned())
        .ok_or("versitygw_archive_invalid")?;
    let mut bytes = Vec::new();

    zip.by_name(&name)
        .map_err(|e| e.to_string())?
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;

    Ok(bytes)
}

#[cfg(not(windows))]
fn unpack(archive: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::Read;

    let mut tar = tar::Archive::new(flate2::read::GzDecoder::new(archive));

    for entry in tar.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?;

        if path.file_name().is_some_and(|n| n == EXECUTABLE) {
            let mut bytes = Vec::new();

            entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;

            return Ok(bytes);
        }
    }

    Err("versitygw_archive_invalid".into())
}

async fn download(target: &Path) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("atrix")
        .build()
        .map_err(|e| e.to_string())?;
    let listing = client
        .get(format!(
            "https://api.github.com/repos/versity/versitygw/releases/tags/{VERSITYGW}"
        ))
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| format!("versitygw_download:{e}"))?
        .bytes()
        .await
        .map_err(|e| format!("versitygw_download:{e}"))?;
    let release: Release = serde_json::from_slice(&listing).map_err(|e| e.to_string())?;
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
    let archive = client
        .get(&asset.browser_download_url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| format!("versitygw_download:{e}"))?
        .bytes()
        .await
        .map_err(|e| format!("versitygw_download:{e}"))?;

    if hex(&Sha256::digest(&archive)) != expected {
        return Err("versitygw_checksum_mismatch".into());
    }

    let binary = unpack(&archive)?;
    let partial = target.with_extension("partial");

    fs::create_dir_all(target.parent().ok_or("versitygw_archive_invalid")?)
        .map_err(|e| e.to_string())?;
    fs::write(&partial, binary).map_err(|e| e.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        fs::set_permissions(&partial, fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }

    fs::rename(&partial, target).map_err(|e| e.to_string())
}

async fn binary(home: &Path) -> Result<PathBuf, String> {
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

fn free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;

    listener
        .local_addr()
        .map(|a| a.port())
        .map_err(|e| e.to_string())
}

fn wait_ready(port: u16) -> Result<(), String> {
    let start = Instant::now();

    while start.elapsed() < READY_TIMEOUT {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return Ok(());
        }

        thread::sleep(Duration::from_millis(100));
    }

    Err("kg_store_timeout".into())
}

fn running(store: &Store) -> Option<Endpoint> {
    let mut running = store.0.lock().unwrap();
    let (child, endpoint) = running.as_mut()?;

    child
        .try_wait()
        .is_ok_and(|status| status.is_none())
        .then(|| endpoint.clone())
}

#[tauri::command]
pub async fn kg_start(
    app: AppHandle,
    store: State<'_, Store>,
    access: String,
    secret: String,
) -> Result<Endpoint, String> {
    if let Some(endpoint) = running(&store) {
        return Ok(endpoint);
    }

    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let program = binary(&home).await?;
    let mut running = store.0.lock().unwrap();
    let root = home.join(".atrix").join("kg");
    let dirs = ["data", "meta", "versions"].map(|d| root.join(d));

    for dir in &dirs {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }

    let [data, meta, versions] = dirs;
    let port = free_port()?;
    let mut command = Command::new(program);

    command
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
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        command.creation_flags(CREATE_NO_WINDOW);
    }

    let child = command.spawn().map_err(|e| e.to_string())?;
    let endpoint = Endpoint {
        port,
        access,
        secret,
    };

    *running = Some((child, endpoint.clone()));
    wait_ready(port)?;

    Ok(endpoint)
}
