use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::ipc::Response;
use tauri::{AppHandle, Manager};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const MANIFEST: &str = "pcb.toml";

#[derive(Deserialize)]
struct Manifest {
    project: ProjectSection,
    #[serde(default)]
    board: Vec<Board>,
}

#[derive(Deserialize)]
struct ProjectSection {
    name: String,
    title: Option<String>,
    assembly: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct Board {
    name: String,
    title: Option<String>,
    circuit: Option<String>,
    pcb: String,
    schematic: Option<String>,
    bom: Option<String>,
}

#[derive(Serialize)]
pub struct Project {
    root: String,
    name: String,
    title: Option<String>,
    assembly: Option<String>,
    boards: Vec<Board>,
}

fn manifest(root: &Path) -> Result<Manifest, String> {
    let text = fs::read_to_string(root.join(MANIFEST)).map_err(|e| e.to_string())?;

    toml::from_str(&text).map_err(|e| format!("pcb_manifest:{}", e.message()))
}

fn inside(root: &str, relative: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(root);
    let path = Path::new(relative);
    let plain = path
        .components()
        .all(|c| matches!(c, Component::Normal(_) | Component::CurDir));

    if !root.join(MANIFEST).is_file() || !plain {
        return Err(format!("path_not_allowed:{relative}"));
    }

    Ok(root.join(path))
}

pub(crate) fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn sha256(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;

    Ok(hex(&Sha256::digest(bytes)))
}

#[derive(Deserialize)]
struct Derived {
    source: Stamp,
}

#[derive(Deserialize)]
struct Stamp {
    sha256: String,
}

fn derived_sha(out: &Path) -> Option<String> {
    let text = fs::read_to_string(out.join("manifest.json")).ok()?;

    serde_json::from_str::<Derived>(&text)
        .ok()
        .map(|d| d.source.sha256)
}

fn modified(path: &Path) -> Option<SystemTime> {
    fs::metadata(path).and_then(|m| m.modified()).ok()
}

fn cache_root(app: &AppHandle, root: &str) -> Result<PathBuf, String> {
    let digest = Sha256::digest(root.to_lowercase().as_bytes());

    Ok(app
        .path()
        .home_dir()
        .map_err(|e| e.to_string())?
        .join(".atrix/pcb")
        .join(&hex(&digest)[..16]))
}

fn scripts() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../scripts")
}

fn bun(script: &str, args: &[&str]) -> Result<(), String> {
    let bun = which::which("bun").map_err(|_| "command_not_found:bun".to_string())?;
    let mut command = Command::new(bun);

    command
        .arg(scripts().join(script))
        .args(args)
        .stdin(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command
        .output()
        .map_err(|e| format!("pcb_derive_failed:{e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let tail: Vec<&str> = stderr.trim().lines().rev().take(6).collect();
    let detail: Vec<&str> = tail.into_iter().rev().collect();

    Err(format!(
        "pcb_derive_failed:{}",
        detail.join(
            "
"
        )
    ))
}

fn derive_board(
    cache: &Path,
    root: &str,
    manifest: &Manifest,
    board: &Board,
) -> Result<PathBuf, String> {
    let project = &manifest.project.name;
    let main = manifest.board.first().is_some_and(|b| b.name == board.name);
    let out = if main {
        cache.join(project)
    } else {
        cache.join(format!("{project}-{}", board.name))
    };
    let pcb = inside(root, &board.pcb)?;

    if derived_sha(&out) == Some(sha256(&pcb)?) {
        return Ok(out);
    }

    let source = pcb.parent().unwrap_or(&pcb).to_string_lossy().into_owned();
    let out_arg = out.to_string_lossy().into_owned();
    let mut args = vec![source.as_str(), "--project", project, "--out", &out_arg];

    if !main {
        args.extend(["--board", &board.name]);
    }

    if let Some(title) = &board.title {
        args.extend(["--title", title]);
    }

    bun("derive-pcb.ts", &args)?;

    Ok(out)
}

fn derive_assembly(
    cache: &Path,
    root: &str,
    manifest: &Manifest,
    boards: &[PathBuf],
) -> Result<Option<PathBuf>, String> {
    let Some(assembly) = &manifest.project.assembly else {
        return Ok(None);
    };

    let spec = inside(root, assembly)?;
    let out = cache.join(format!("{}-assembly", manifest.project.name));
    let built = modified(&out.join("manifest.json"));
    let newer_board = boards
        .iter()
        .any(|b| modified(&b.join("manifest.json")) > built);

    if derived_sha(&out) == Some(sha256(&spec)?) && !newer_board {
        return Ok(Some(out));
    }

    let source = spec
        .parent()
        .unwrap_or(&spec)
        .to_string_lossy()
        .into_owned();
    let out_arg = out.to_string_lossy().into_owned();

    bun(
        "derive-assembly.ts",
        &[
            &source,
            "--project",
            &manifest.project.name,
            "--out",
            &out_arg,
        ],
    )?;

    Ok(Some(out))
}

#[derive(Serialize)]
pub struct Outputs {
    boards: Vec<(String, String)>,
    assembly: Option<String>,
}

static DERIVE: Mutex<()> = Mutex::new(());

fn derive(app: &AppHandle, root: &str, assembly: bool) -> Result<Outputs, String> {
    // concurrent kicad-cli exports of one board write truncated GLBs
    let _guard = DERIVE.lock().map_err(|e| e.to_string())?;
    let parsed = manifest(Path::new(root))?;
    let cache = cache_root(app, root)?;
    let dirs = parsed
        .board
        .iter()
        .map(|b| derive_board(&cache, root, &parsed, b))
        .collect::<Result<Vec<_>, _>>()?;
    let assembly = if assembly {
        derive_assembly(&cache, root, &parsed, &dirs)?
    } else {
        None
    };
    let text = |p: &Path| p.to_string_lossy().into_owned();

    Ok(Outputs {
        boards: parsed
            .board
            .iter()
            .zip(&dirs)
            .map(|(b, d)| (b.name.clone(), text(d)))
            .collect(),
        assembly: assembly.as_deref().map(text),
    })
}

fn files_under(root: &Path, dir: &Path, out: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();

        if path.is_dir() {
            files_under(root, &path, out);
        } else if let Ok(relative) = path.strip_prefix(root) {
            out.push(relative.to_string_lossy().replace('\\', "/"));
        }
    }
}

#[tauri::command]
pub fn pcb_project(cwd: String) -> Result<Option<Project>, String> {
    let Some(root) = Path::new(&cwd)
        .ancestors()
        .find(|dir| dir.join(MANIFEST).is_file())
    else {
        return Ok(None);
    };

    let parsed = manifest(root)?;

    Ok(Some(Project {
        root: root.to_string_lossy().into_owned(),
        name: parsed.project.name,
        title: parsed.project.title,
        assembly: parsed.project.assembly,
        boards: parsed.board,
    }))
}

#[tauri::command]
pub fn pcb_read(root: String, path: String) -> Result<Response, String> {
    let bytes = fs::read(inside(&root, &path)?).map_err(|e| e.to_string())?;

    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn pcb_files(root: String, dir: String) -> Result<Vec<String>, String> {
    let mut out = Vec::new();

    files_under(Path::new(&root), &inside(&root, &dir)?, &mut out);
    out.sort();

    Ok(out)
}

#[tauri::command]
pub async fn pcb_derive(app: AppHandle, root: String, assembly: bool) -> Result<Outputs, String> {
    tauri::async_runtime::spawn_blocking(move || derive(&app, &root, assembly))
        .await
        .map_err(|e| e.to_string())?
}
