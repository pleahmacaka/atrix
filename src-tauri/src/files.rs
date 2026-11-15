use std::fs;
use std::io::{BufRead, BufReader, ErrorKind, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

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

    Ok(fs::write(path, content)?)
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

#[tauri::command(async)]
pub fn browse_dirs(app: AppHandle, path: String) -> Result<Browse> {
    let dir = if path.trim().is_empty() {
        app.path().home_dir()?
    } else {
        PathBuf::from(path.trim())
    };

    if !dir.is_dir() {
        return Err(Error::code("not_a_folder", dir.display()));
    }

    let mut dirs: Vec<Dir> = fs::read_dir(&dir)?
        .flatten()
        .filter(|e| e.path().is_dir())
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
