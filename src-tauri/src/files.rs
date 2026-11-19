use std::fs;
use std::io::{BufRead, BufReader, ErrorKind, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tempfile::NamedTempFile;

use crate::error::{Error, Result};

const ROOTS: [&str; 4] = [".atrix", ".claude", ".claude.json", ".codex"];

fn allowed(app: &AppHandle, path: &str) -> Result<PathBuf> {
    let path = PathBuf::from(path);
    let home = app.path().home_dir()?;
    let escapes = path.components().any(|c| c == Component::ParentDir);
    let inside = ROOTS.iter().any(|root| path.starts_with(home.join(root)));

    if escapes || !inside {
        return Err(Error::code("path_not_allowed", path.display()));
    }

    Ok(path)
}

#[tauri::command(async)]
pub fn read_text(app: AppHandle, path: String) -> Result<Option<String>> {
    match fs::read_to_string(allowed(&app, &path)?) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

#[tauri::command(async)]
pub fn write_text(app: AppHandle, path: String, content: String) -> Result<()> {
    let path = allowed(&app, &path)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let linked = fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink());
    let own = path.starts_with(app.path().home_dir()?.join(".atrix"));

    if linked || !own {
        return Ok(fs::write(path, content)?);
    }

    let mut staged = NamedTempFile::new_in(path.parent().unwrap_or(Path::new(".")))?;

    staged.write_all(content.as_bytes())?;
    staged.as_file().sync_all()?;

    // windows refuses the rename while another process holds the target open
    if staged.persist(&path).is_err() {
        return Ok(fs::write(path, content)?);
    }

    Ok(())
}

#[tauri::command(async)]
pub fn list_dirs(app: AppHandle, path: String) -> Result<Vec<String>> {
    let Ok(entries) = fs::read_dir(allowed(&app, &path)?) else {
        return Ok(Vec::new());
    };

    let mut names: Vec<String> = entries
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();

    names.sort();

    Ok(names)
}

fn copy_all(from: &Path, to: &Path, skipped: &mut Vec<String>) -> std::io::Result<()> {
    if from.is_dir() {
        fs::create_dir_all(to)?;

        for entry in fs::read_dir(from)?.flatten() {
            copy_all(&entry.path(), &to.join(entry.file_name()), skipped)?;
        }

        return Ok(());
    }

    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent)?;
    }

    match fs::copy(from, to) {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == ErrorKind::PermissionDenied => {
            skipped.push(from.display().to_string());

            Ok(())
        }
        Err(e) => Err(std::io::Error::new(
            e.kind(),
            format!("{}: {e}", from.display()),
        )),
    }
}

#[tauri::command(async)]
pub fn copy_path(app: AppHandle, from: String, to: String) -> Result<Vec<String>> {
    let from = allowed(&app, &from)?;
    let to = allowed(&app, &to)?;
    let mut skipped = Vec::new();

    if from.exists() {
        copy_all(&from, &to, &mut skipped)?;
    }

    Ok(skipped)
}

#[tauri::command(async)]
pub fn remove_path(app: AppHandle, path: String) -> Result<()> {
    let path = allowed(&app, &path)?;
    let home = app.path().home_dir()?;

    if ROOTS.iter().any(|root| path == home.join(root)) {
        return Err("root_protected".into());
    }

    if path.is_dir() {
        Ok(fs::remove_dir_all(path)?)
    } else if path.exists() {
        Ok(fs::remove_file(path)?)
    } else {
        Ok(())
    }
}

#[derive(Serialize)]
pub struct Lines {
    lines: Vec<String>,
    offset: u64,
}

#[tauri::command(async)]
pub fn read_lines(app: AppHandle, path: String, offset: u64, tail: u64) -> Result<Lines> {
    let path = allowed(&app, &path)?;
    let file = match fs::File::open(&path) {
        Ok(file) => file,
        Err(e) if e.kind() == ErrorKind::NotFound => {
            return Ok(Lines {
                lines: Vec::new(),
                offset: 0,
            });
        }
        Err(e) => return Err(e.into()),
    };
    let size = file.metadata()?.len();
    let fresh = offset == 0 || offset > size;
    let start = if fresh {
        size.saturating_sub(tail)
    } else {
        offset
    };
    let mut reader = BufReader::new(file);
    let mut line = Vec::new();
    let mut position = start;
    let mut lines = Vec::new();

    reader.seek(SeekFrom::Start(start))?;

    if fresh && start > 0 {
        position += reader.read_until(b'\n', &mut line)? as u64;
    }

    loop {
        line.clear();

        let read = reader.read_until(b'\n', &mut line)?;

        if read == 0 || line.last() != Some(&b'\n') {
            break;
        }

        lines.push(String::from_utf8_lossy(&line).into_owned());
        position += read as u64;
    }

    Ok(Lines {
        lines,
        offset: position,
    })
}

#[tauri::command(async)]
pub fn grep_head(
    app: AppHandle,
    path: String,
    tail: u64,
    needles: Vec<String>,
) -> Result<Vec<String>> {
    let path = allowed(&app, &path)?;
    let file = match fs::File::open(&path) {
        Ok(file) => file,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.into()),
    };
    let size = file.metadata()?.len();
    let end = size.saturating_sub(tail);
    let mut reader = BufReader::new(file);
    let mut line = Vec::new();
    let mut position = 0;
    let mut found = Vec::new();

    while position < end {
        line.clear();

        let read = reader.read_until(b'\n', &mut line)?;

        if read == 0 {
            break;
        }

        position += read as u64;

        let text = String::from_utf8_lossy(&line);

        if needles.iter().any(|n| text.contains(n.as_str())) {
            found.push(text.into_owned());
        }
    }

    Ok(found)
}

#[derive(Serialize)]
pub struct Dir {
    name: String,
    path: String,
}

#[derive(Serialize)]
pub struct Browse {
    path: String,
    parent: Option<String>,
    dirs: Vec<Dir>,
}

fn native_path(path: &str) -> String {
    let mut chars = path.chars();
    let drive = (chars.next(), chars.next(), chars.next());

    match drive {
        (Some('/'), Some(letter), next)
            if cfg!(windows)
                && letter.is_ascii_alphabetic()
                && matches!(next, None | Some('/')) =>
        {
            format!(
                "{}:\\{}",
                letter.to_ascii_uppercase(),
                path[2..].trim_start_matches('/')
            )
            .replace('/', "\\")
        }
        _ => path.to_string(),
    }
}

#[cfg(windows)]
fn concealed(entry: &fs::DirEntry) -> bool {
    use std::os::windows::fs::MetadataExt;

    const HIDDEN_OR_SYSTEM: u32 = 0x2 | 0x4;

    entry
        .metadata()
        .is_ok_and(|m| m.file_attributes() & HIDDEN_OR_SYSTEM != 0)
}

#[cfg(not(windows))]
fn concealed(_: &fs::DirEntry) -> bool {
    false
}

#[tauri::command(async)]
pub fn browse_dirs(app: AppHandle, path: String) -> Result<Browse> {
    let path = path.trim();
    let dir = if path.is_empty() {
        app.path().home_dir()?
    } else if let Some(rest) = path.strip_prefix('~') {
        app.path()
            .home_dir()?
            .join(rest.trim_start_matches(['/', '\\']))
    } else {
        PathBuf::from(native_path(path))
    };

    if !dir.is_dir() {
        return Err(Error::code("not_a_folder", dir.display()));
    }

    let mut dirs: Vec<Dir> = fs::read_dir(&dir)?
        .flatten()
        .filter(|e| e.path().is_dir() && !concealed(e))
        .filter_map(|e| {
            let name = e.file_name().into_string().ok()?;

            Some(Dir {
                path: e.path().to_string_lossy().into_owned(),
                name,
            })
        })
        .filter(|d| !d.name.starts_with('.') && !d.name.starts_with('$'))
        .collect();

    dirs.sort_by_key(|d| d.name.to_lowercase());

    Ok(Browse {
        path: dir.to_string_lossy().into_owned(),
        parent: dir.parent().map(|p| p.to_string_lossy().into_owned()),
        dirs,
    })
}

#[tauri::command(async)]
pub fn append_text(app: AppHandle, path: String, content: String) -> Result<()> {
    let mut file = fs::OpenOptions::new()
        .append(true)
        .open(allowed(&app, &path)?)?;

    Ok(file.write_all(content.as_bytes())?)
}

const IMAGE_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];

#[tauri::command(async)]
pub fn read_image(path: String) -> Result<tauri::ipc::Response> {
    let path = PathBuf::from(path);
    let image = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| IMAGE_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()));

    if !image {
        return Err(Error::code("path_not_allowed", path.display()));
    }

    Ok(tauri::ipc::Response::new(fs::read(path)?))
}

const VIEW_EXTENSIONS: [&str; 9] = [
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "pdf", "html", "htm",
];

#[tauri::command(async)]
pub fn read_view(path: String) -> Result<tauri::ipc::Response> {
    let path = PathBuf::from(path);
    let viewable = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| VIEW_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()));

    if !viewable {
        return Err(Error::code("path_not_allowed", path.display()));
    }

    Ok(tauri::ipc::Response::new(fs::read(path)?))
}

#[derive(serde::Serialize)]
pub struct Git {
    remote: Option<String>,
}

fn git_dir(start: &Path) -> Option<PathBuf> {
    start.ancestors().find_map(|dir| {
        let dot = dir.join(".git");

        if dot.is_dir() {
            return Some(dot);
        }

        let pointer = fs::read_to_string(&dot).ok()?;
        let target = pointer.trim().strip_prefix("gitdir:")?.trim();

        Some(dir.join(target))
    })
}

fn remote_of(config: &str) -> Option<String> {
    let mut section = "";
    let mut first = None;

    for line in config.lines().map(str::trim) {
        if line.starts_with('[') {
            section = line;
            continue;
        }

        let Some(url) = line.strip_prefix("url").map(str::trim_start) else {
            continue;
        };
        let Some(url) = url.strip_prefix('=') else {
            continue;
        };

        if !section.starts_with("[remote ") {
            continue;
        }

        if section == "[remote \"origin\"]" {
            return Some(url.trim().to_owned());
        }

        first.get_or_insert_with(|| url.trim().to_owned());
    }

    first
}

#[tauri::command(async)]
pub fn git_remote(path: String) -> Result<Option<Git>> {
    let Some(dir) = git_dir(Path::new(&path)) else {
        return Ok(None);
    };
    let config = fs::read_to_string(dir.join("config"))
        .or_else(|_| {
            let common = fs::read_to_string(dir.join("commondir"))?;

            fs::read_to_string(dir.join(common.trim()).join("config"))
        })
        .unwrap_or_default();

    Ok(Some(Git {
        remote: remote_of(&config),
    }))
}

const ATTACHMENT_MAX: usize = 10 * 1024 * 1024;

#[tauri::command(async)]
pub fn save_attachment(app: AppHandle, name: String, data: String) -> Result<String> {
    let bytes = STANDARD
        .decode(data)
        .map_err(|e| Error::code("attachment_invalid", e))?;

    if bytes.len() > ATTACHMENT_MAX {
        return Err(Error::code("attachment_invalid", &name));
    }

    let file = Path::new(&name)
        .file_name()
        .ok_or_else(|| Error::code("attachment_invalid", &name))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let dir = app
        .path()
        .home_dir()?
        .join(".atrix")
        .join("attachments")
        .join(stamp.to_string());

    fs::create_dir_all(&dir)?;

    let path = dir.join(file);

    fs::write(&path, bytes)?;

    Ok(path.to_string_lossy().into_owned())
}
