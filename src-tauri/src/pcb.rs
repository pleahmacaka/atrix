use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use tauri::{AppHandle, Manager};

use crate::error::{Error, Result};
use crate::fetch::sha256_hex;
use crate::platform;

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

fn manifest(root: &Path) -> Result<Manifest> {
    let text = fs::read_to_string(root.join(MANIFEST))?;

    toml::from_str(&text).map_err(|e| Error::code("pcb_manifest", e.message()))
}

fn inside(root: &str, relative: &str) -> Result<PathBuf> {
    let root = PathBuf::from(root);
    let path = Path::new(relative);
    let plain = path
        .components()
        .all(|c| matches!(c, Component::Normal(_) | Component::CurDir));

    if !root.join(MANIFEST).is_file() || !plain {
        return Err(Error::code("path_not_allowed", relative));
    }

    Ok(root.join(path))
}

fn file_sha(path: &Path) -> Result<String> {
    Ok(sha256_hex(&fs::read(path)?))
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

fn cache_root(app: &AppHandle, root: &str) -> Result<PathBuf> {
    let digest = sha256_hex(root.to_lowercase().as_bytes());

    Ok(app
        .path()
        .home_dir()?
        .join(".atrix/pcb")
        .join(&digest[..16]))
}

fn bun(scripts: &Path, script: &str, args: &[&str]) -> Result<()> {
    let bun = which::which("bun").map_err(|_| Error::code("command_not_found", "bun"))?;
    let output = platform::hidden(bun)
        .arg(scripts.join(script))
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| Error::code("pcb_derive_failed", e))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let lines: Vec<&str> = stderr.trim().lines().collect();

    Err(Error::code(
        "pcb_derive_failed",
        lines[lines.len().saturating_sub(6)..].join("\n"),
    ))
}

fn derive_board(
    scripts: &Path,
    cache: &Path,
    root: &str,
    manifest: &Manifest,
    board: &Board,
) -> Result<PathBuf> {
    let project = &manifest.project.name;
    let main = manifest.board.first().is_some_and(|b| b.name == board.name);
    let out = if main {
        cache.join(project)
    } else {
        cache.join(format!("{project}-{}", board.name))
    };
    let pcb = inside(root, &board.pcb)?;

    if derived_sha(&out) == Some(file_sha(&pcb)?) {
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

    bun(scripts, "derive-pcb.ts", &args)?;

    Ok(out)
}

fn derive_assembly(
    scripts: &Path,
    cache: &Path,
    root: &str,
    manifest: &Manifest,
    boards: &[PathBuf],
) -> Result<Option<PathBuf>> {
    let Some(assembly) = &manifest.project.assembly else {
        return Ok(None);
    };

    let spec = inside(root, assembly)?;
    let out = cache.join(format!("{}-assembly", manifest.project.name));
    let built = modified(&out.join("manifest.json"));
    let newer_board = boards
        .iter()
        .any(|b| modified(&b.join("manifest.json")) > built);

    if derived_sha(&out) == Some(file_sha(&spec)?) && !newer_board {
        return Ok(Some(out));
    }

    let source = spec
        .parent()
        .unwrap_or(&spec)
        .to_string_lossy()
        .into_owned();
    let out_arg = out.to_string_lossy().into_owned();

    bun(
        scripts,
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

fn derive(app: &AppHandle, root: &str, assembly: bool) -> Result<Outputs> {
    // concurrent kicad-cli exports of one board write truncated GLBs
    let _guard = DERIVE.lock()?;
    let parsed = manifest(Path::new(root))?;
    let cache = cache_root(app, root)?;
    let scripts = app.path().resource_dir()?.join("scripts");
    let dirs = parsed
        .board
        .iter()
        .map(|b| derive_board(&scripts, &cache, root, &parsed, b))
        .collect::<Result<Vec<_>>>()?;
    let assembly = if assembly {
        derive_assembly(&scripts, &cache, root, &parsed, &dirs)?
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

#[tauri::command(async)]
pub fn pcb_project(cwd: String) -> Result<Option<Project>> {
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

#[tauri::command(async)]
pub fn pcb_read(root: String, path: String) -> Result<Response> {
    Ok(Response::new(fs::read(inside(&root, &path)?)?))
}

#[tauri::command(async)]
pub fn pcb_files(root: String, dir: String) -> Result<Vec<String>> {
    let mut out = Vec::new();

    files_under(Path::new(&root), &inside(&root, &dir)?, &mut out);
    out.sort();

    Ok(out)
}

#[tauri::command]
pub async fn pcb_derive(app: AppHandle, root: String, assembly: bool) -> Result<Outputs> {
    tauri::async_runtime::spawn_blocking(move || derive(&app, &root, assembly)).await?
}
