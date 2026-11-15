use std::env::consts::{ARCH, OS};
use std::fs;
use std::io::{BufRead, BufReader, Cursor, Read};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::OnceLock;
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::async_runtime::spawn_blocking;
use tauri::ipc::Channel;

use crate::error::{Error, Result};
use crate::fetch;
use crate::platform;
use crate::process::{self, home, tools_dir, user_bin};

#[derive(Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Source {
    Npm {
        package: String,
    },
    Uv {
        package: String,
    },
    Binary {
        id: String,
        archive: String,
        cmd: String,
        sha256: Option<String>,
    },
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Scope {
    Atrix,
    Global,
}

#[derive(Serialize)]
pub struct Found {
    path: String,
    local: bool,
}

struct Plan {
    program: &'static str,
    args: Vec<String>,
    env: Vec<(&'static str, PathBuf)>,
}

fn user_tools() -> PathBuf {
    home().join(".local").join("share").join("acp")
}

fn npm_name(spec: &str) -> &str {
    match spec.get(1..).and_then(|rest| rest.find('@')) {
        Some(i) => &spec[..i + 1],
        None => spec,
    }
}

fn uv_name(spec: &str) -> &str {
    spec.split(['=', '<', '>', '!', '~', '[', ';', ' '])
        .next()
        .unwrap_or(spec)
}

fn safe(name: &str) -> Result<&str> {
    let bad = name.is_empty() || name.contains(['/', '\\']) || name.contains("..");

    if bad {
        return Err(Error::code("install_name_invalid", name));
    }

    Ok(name)
}

fn uv_env(scope: Scope, tools: &Path) -> Vec<(&'static str, PathBuf)> {
    match scope {
        Scope::Atrix => vec![
            ("UV_TOOL_DIR", tools.join("uv")),
            ("UV_TOOL_BIN_DIR", tools.join("bin")),
            ("UV_PYTHON_INSTALL_DIR", tools.join("python")),
        ],
        Scope::Global => Vec::new(),
    }
}

fn plan(source: &Source, scope: Scope, tools: &Path) -> Option<Plan> {
    match source {
        Source::Npm { package } => {
            let target = match scope {
                Scope::Atrix => vec!["--prefix".into(), tools.to_string_lossy().into_owned()],
                Scope::Global => vec!["-g".into()],
            };
            let args = ["install".into()]
                .into_iter()
                .chain(target)
                .chain(["--no-fund".into(), "--no-audit".into(), package.clone()])
                .collect();

            Some(Plan {
                program: "npm",
                args,
                env: Vec::new(),
            })
        }
        Source::Uv { package } => Some(Plan {
            program: "uv",
            args: vec!["tool".into(), "install".into(), package.clone()],
            env: uv_env(scope, tools),
        }),
        Source::Binary { .. } => None,
    }
}

fn removal(source: &Source, tools: &Path) -> Option<Plan> {
    match source {
        Source::Npm { package } => Some(Plan {
            program: "npm",
            args: vec![
                "uninstall".into(),
                "--prefix".into(),
                tools.to_string_lossy().into_owned(),
                npm_name(package).to_owned(),
            ],
            env: Vec::new(),
        }),
        Source::Uv { package } => Some(Plan {
            program: "uv",
            args: vec![
                "tool".into(),
                "uninstall".into(),
                uv_name(package).to_owned(),
            ],
            env: uv_env(Scope::Atrix, tools),
        }),
        Source::Binary { .. } => None,
    }
}

fn relay<R: Read>(stream: Option<R>, channel: &Channel<String>) -> Vec<String> {
    let Some(stream) = stream else {
        return Vec::new();
    };

    BufReader::new(stream)
        .lines()
        .map_while(std::io::Result::ok)
        .filter(|l| !l.trim().is_empty())
        .inspect(|l| {
            let _ = channel.send(l.clone());
        })
        .collect()
}

fn denied(line: &str) -> bool {
    let line = line.to_lowercase();

    [
        "eacces",
        "eperm",
        "erofs",
        "permission denied",
        "read-only file system",
    ]
    .iter()
    .any(|w| line.contains(w))
}

fn run(plan: Plan, channel: &Channel<String>) -> Result<()> {
    let mut child = process::command(plan.program)?
        .args(&plan.args)
        .envs(plan.env)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let stderr = child.stderr.take();
    let errors = {
        let channel = channel.clone();

        thread::spawn(move || relay(stderr, &channel))
    };
    let mut lines = relay(child.stdout.take(), channel);

    lines.extend(errors.join().unwrap_or_default());

    if child.wait()?.success() {
        return Ok(());
    }

    if lines.iter().any(|l| denied(l)) {
        return Err("install_permission".into());
    }

    Err(Error::code(
        "install_failed",
        lines.last().map_or("", String::as_str),
    ))
}

async fn download(url: &str, sha256: Option<&str>) -> Result<Vec<u8>> {
    if !url.starts_with("https://") {
        return Err(Error::code("install_download", url));
    }

    let bytes = fetch::get(&fetch::client()?, url, "install_download").await?;

    if let Some(expected) = sha256
        && !fetch::sha256_hex(&bytes).eq_ignore_ascii_case(expected)
    {
        return Err("install_checksum".into());
    }

    Ok(bytes)
}

fn unpack(url: &str, cmd: &str, bytes: &[u8], dir: &Path) -> Result<()> {
    let name = url.split(['?', '#']).next().unwrap_or(url).to_lowercase();
    let invalid = |e: &dyn ToString| Error::code("install_archive_invalid", e.to_string());

    if name.ends_with(".zip") {
        return zip::ZipArchive::new(Cursor::new(bytes))
            .and_then(|mut z| z.extract(dir))
            .map_err(|e| invalid(&e));
    }

    if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        return tar::Archive::new(flate2::read::GzDecoder::new(bytes))
            .unpack(dir)
            .map_err(|e| invalid(&e));
    }

    if name.ends_with(".tar.bz2") {
        return tar::Archive::new(bzip2::read::BzDecoder::new(bytes))
            .unpack(dir)
            .map_err(|e| invalid(&e));
    }

    let file = Path::new(cmd).file_name().ok_or_else(|| invalid(&cmd))?;

    Ok(fs::write(dir.join(file), bytes)?)
}

fn link(program: &Path) -> Result<()> {
    let bin = user_bin();
    let stem = program
        .file_stem()
        .ok_or("install_archive_invalid")?
        .to_string_lossy()
        .into_owned();

    fs::create_dir_all(&bin)?;

    #[cfg(unix)]
    {
        let target = bin.join(&stem);
        let _ = fs::remove_file(&target);

        std::os::unix::fs::symlink(program, target)?;
    }

    #[cfg(not(unix))]
    {
        let shim = format!("@\"{}\" %*\r\n", program.display());

        fs::write(bin.join(format!("{stem}.cmd")), shim)?;
    }

    Ok(())
}

fn place(id: &str, url: &str, cmd: &str, bytes: &[u8], scope: Scope) -> Result<()> {
    let root = match scope {
        Scope::Atrix => tools_dir(),
        Scope::Global => user_tools(),
    };
    let dir = root.join(safe(id)?);

    if dir.exists() {
        fs::remove_dir_all(&dir)?;
    }

    fs::create_dir_all(&dir)?;
    unpack(url, cmd, bytes, &dir)?;

    let program = dir.join(cmd);

    if !program.is_file() {
        return Err(Error::code("install_archive_invalid", cmd));
    }

    platform::make_executable(&program)?;

    if scope == Scope::Global {
        link(&program)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn tool_install(
    source: Source,
    scope: Scope,
    channel: Channel<String>,
) -> Result<Option<String>> {
    let worker = match source.clone() {
        Source::Binary {
            id,
            archive,
            cmd,
            sha256,
        } => {
            let _ = channel.send(archive.clone());
            let bytes = download(&archive, sha256.as_deref()).await?;

            spawn_blocking(move || place(&id, &archive, &cmd, &bytes, scope))
        }
        other => {
            let plan = plan(&other, scope, &tools_dir()).ok_or("install_unsupported")?;

            if scope == Scope::Atrix {
                fs::create_dir_all(tools_dir())?;
            }

            spawn_blocking(move || run(plan, &channel))
        }
    };

    worker.await??;

    let hint = scope == Scope::Global
        && !matches!(source, Source::Npm { .. })
        && !process::on_system_path(&user_bin());

    Ok(hint.then(|| user_bin().to_string_lossy().into_owned()))
}

#[tauri::command(async)]
pub fn tool_uninstall(source: Source, channel: Channel<String>) -> Result<()> {
    let tools = tools_dir();

    if let Source::Binary { id, .. } = &source {
        fs::remove_dir_all(tools.join(safe(id)?))?;

        return Ok(());
    }

    run(
        removal(&source, &tools).ok_or("install_unsupported")?,
        &channel,
    )
}

fn output(program: &str, args: &[&str]) -> Option<PathBuf> {
    let out = process::command(program)
        .ok()?
        .args(args)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_owned();

    (out.status.success() && !text.is_empty()).then(|| PathBuf::from(text))
}

fn npm_global() -> Option<&'static PathBuf> {
    static ROOT: OnceLock<Option<PathBuf>> = OnceLock::new();

    ROOT.get_or_init(|| output("npm", &["root", "-g"])).as_ref()
}

fn uv_global() -> Option<&'static PathBuf> {
    static ROOT: OnceLock<Option<PathBuf>> = OnceLock::new();

    ROOT.get_or_init(|| output("uv", &["tool", "dir"])).as_ref()
}

fn npm_bin(root: &Path, name: &str) -> Option<String> {
    let manifest = fs::read(root.join(name).join("package.json")).ok()?;
    let manifest: serde_json::Value = serde_json::from_slice(&manifest).ok()?;
    let base = name.rsplit('/').next().unwrap_or(name);

    match manifest.get("bin")? {
        serde_json::Value::String(_) => Some(base.to_owned()),
        serde_json::Value::Object(bins) if bins.contains_key(base) => Some(base.to_owned()),
        serde_json::Value::Object(bins) => bins.keys().next().cloned(),
        _ => None,
    }
}

fn uv_bin(root: &Path, name: &str) -> Option<PathBuf> {
    let folder = name.to_lowercase().replace(['_', '.'], "-");
    let receipt = fs::read_to_string(root.join(folder).join("uv-receipt.toml")).ok()?;
    let receipt: toml::Value = toml::from_str(&receipt).ok()?;
    let points = receipt.get("tool")?.get("entrypoints")?.as_array()?;
    let point = points
        .iter()
        .find(|p| p.get("name").and_then(toml::Value::as_str) == Some(name))
        .or_else(|| points.first())?;
    let path = PathBuf::from(point.get("install-path")?.as_str()?);

    path.is_file().then_some(path)
}

fn found(path: PathBuf, local: bool) -> Found {
    Found {
        path: path.to_string_lossy().into_owned(),
        local,
    }
}

fn find(source: &Source) -> Option<Found> {
    let tools = tools_dir();

    match source {
        Source::Npm { package } => {
            let name = npm_name(package);
            let modules = tools.join("node_modules");
            let local = npm_bin(&modules, name)
                .and_then(|b| process::which_in(&b, modules.join(".bin").into_os_string()));

            if let Some(path) = local {
                return Some(found(path, true));
            }

            let bin = npm_bin(npm_global()?, name)?;

            process::which(&bin).map(|p| found(p, false))
        }
        Source::Uv { package } => {
            let name = uv_name(package);

            if let Some(path) = uv_bin(&tools.join("uv"), name) {
                return Some(found(path, true));
            }

            uv_bin(uv_global()?, name).map(|p| found(p, false))
        }
        Source::Binary { id, cmd, .. } => [(tools, true), (user_tools(), false)]
            .into_iter()
            .map(|(root, local)| (root.join(id).join(cmd), local))
            .find(|(path, _)| path.is_file())
            .map(|(path, local)| found(path, local)),
    }
}

#[tauri::command(async)]
pub fn tool_find(sources: Vec<Source>) -> Vec<Option<Found>> {
    sources.iter().map(find).collect()
}

#[tauri::command]
pub fn tool_platform() -> String {
    let os = if OS == "macos" { "darwin" } else { OS };

    format!("{os}-{ARCH}")
}
