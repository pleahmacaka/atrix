use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const READY_TIMEOUT: Duration = Duration::from_secs(10);

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

fn binary(home: &Path) -> Result<PathBuf, String> {
    let bundled = home.join(".atrix").join("bin").join("versitygw.exe");

    if bundled.exists() {
        return Ok(bundled);
    }

    which::which("versitygw").map_err(|_| "command_not_found:versitygw".into())
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

#[tauri::command]
pub fn kg_start(
    app: AppHandle,
    store: State<'_, Store>,
    access: String,
    secret: String,
) -> Result<Endpoint, String> {
    let mut running = store.0.lock().unwrap();

    if let Some((child, endpoint)) = running.as_mut()
        && child.try_wait().is_ok_and(|status| status.is_none())
    {
        return Ok(endpoint.clone());
    }

    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let root = home.join(".atrix").join("kg");
    let dirs = ["data", "meta", "versions"].map(|d| root.join(d));

    for dir in &dirs {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }

    let [data, meta, versions] = dirs;
    let port = free_port()?;
    let mut command = Command::new(binary(&home)?);

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
