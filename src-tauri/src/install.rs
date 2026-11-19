use std::env::consts::{ARCH, OS};
use std::fs;
use std::io::{BufRead, BufReader, Read};
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

const DENIED: [&str; 5] = [
    "eacces",
    "eperm",
    "erofs",
    "permission denied",
    "read-only file system",
];

fn user_tools() -> PathBuf {
    home().join(".local").join("share").join("acp")
}

fn npm_name(spec: &str) -> &str {
    let scope = spec.get(1..).and_then(|rest| rest.find('@'));

    match scope {
        Some(at) => &spec[..at + 1],
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
    let package = match source {
        Source::Npm { package } => package,
        Source::Uv { package } => package,
        Source::Binary { .. } => return None,
    };
    let npm = matches!(source, Source::Npm { .. });

    let (mut args, env) = if npm {
        let target = match scope {
            Scope::Atrix => vec!["--prefix".to_owned(), tools.to_string_lossy().into_owned()],
            Scope::Global => vec!["-g".to_owned()],
        };
        let args = ["install".to_owned()]
            .into_iter()
            .chain(target)
            .chain(["--no-fund".to_owned(), "--no-audit".to_owned()])
            .collect();

        (args, Vec::new())
    } else {
        (
            vec!["tool".to_owned(), "install".to_owned()],
            uv_env(scope, tools),
        )
    };

    args.push(package.clone());

    Some(Plan {
        program: if npm { "npm" } else { "uv" },
        args,
        env,
    })
}

fn removal(source: &Source, tools: &Path) -> Option<Plan> {
    match source {
        Source::Npm { package } => Some(Plan {
            program: "npm",
            args: vec![
                "uninstall".to_owned(),
                "--prefix".to_owned(),
                tools.to_string_lossy().into_owned(),
                npm_name(package).to_owned(),
            ],
            env: Vec::new(),
        }),
        Source::Uv { package } => Some(Plan {
            program: "uv",
            args: vec![
                "tool".to_owned(),
                "uninstall".to_owned(),
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
        .filter(|line| !line.trim().is_empty())
        .inspect(|line| {
            let _ = channel.send(line.clone());
        })
        .collect()
}

fn denied(line: &str) -> bool {
    let line = line.to_lowercase();

    DENIED.iter().any(|word| line.contains(word))
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

    if lines.iter().any(|line| denied(line)) {
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

    if sha256.is_some_and(|expected| !fetch::sha256_hex(&bytes).eq_ignore_ascii_case(expected)) {
        return Err("install_checksum".into());
    }

    Ok(bytes)
}

enum Archive {
    Zip,
    TarGz,
    TarBz2,
    Raw,
}

impl Archive {
    fn of(url: &str) -> Self {
        let name = url.split(['?', '#']).next().unwrap_or(url).to_lowercase();

        if name.ends_with(".zip") {
            Self::Zip
        } else if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
            Self::TarGz
        } else if name.ends_with(".tar.bz2") {
            Self::TarBz2
        } else {
            Self::Raw
        }
    }
}

fn unpack(url: &str, cmd: &str, bytes: &[u8], dir: &Path) -> Result<()> {
    let invalid = |e: &dyn ToString| Error::code("install_archive_invalid", e.to_string());

    match Archive::of(url) {
        Archive::Zip => zip::ZipArchive::new(std::io::Cursor::new(bytes))
            .and_then(|mut zip| zip.extract(dir))
            .map_err(|e| invalid(&e)),
        Archive::TarGz => tar::Archive::new(flate2::read::GzDecoder::new(bytes))
            .unpack(dir)
            .map_err(|e| invalid(&e)),
        Archive::TarBz2 => tar::Archive::new(bzip2::read::BzDecoder::new(bytes))
            .unpack(dir)
            .map_err(|e| invalid(&e)),
        Archive::Raw => {
            let file = Path::new(cmd).file_name().ok_or_else(|| invalid(&cmd))?;

            Ok(fs::write(dir.join(file), bytes)?)
        }
    }
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
    fs::write(
        bin.join(format!("{stem}.cmd")),
        format!("@\"{}\" %*\r\n", program.display()),
    )?;

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
    match source.clone() {
        Source::Binary {
            id,
            archive,
            cmd,
            sha256,
        } => {
            let _ = channel.send(archive.clone());
            let bytes = download(&archive, sha256.as_deref()).await?;

            spawn_blocking(move || place(&id, &archive, &cmd, &bytes, scope)).await??;
        }
        plan_source => {
            let plan = plan(&plan_source, scope, &tools_dir()).ok_or("install_unsupported")?;

            if scope == Scope::Atrix {
                fs::create_dir_all(tools_dir())?;
            }

            spawn_blocking(move || run(plan, &channel)).await??;
        }
    }

    let hint = scope == Scope::Global
        && !matches!(source, Source::Npm { .. })
        && !process::on_system_path(&user_bin());

    Ok(hint.then(|| user_bin().to_string_lossy().into_owned()))
}

#[tauri::command(async)]
pub fn tool_uninstall(source: Source, channel: Channel<String>) -> Result<()> {
    if let Source::Binary { id, .. } = &source {
        fs::remove_dir_all(tools_dir().join(safe(id)?))?;

        return Ok(());
    }

    run(
        removal(&source, &tools_dir()).ok_or("install_unsupported")?,
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
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(root.join(name).join("package.json")).ok()?).ok()?;
    let base = name.rsplit('/').next().unwrap_or(name);

    match manifest.get("bin")? {
        serde_json::Value::Object(bins) if !bins.contains_key(base) => bins.keys().next().cloned(),
        _ => Some(base.to_owned()),
    }
}

fn uv_bin(root: &Path, name: &str) -> Option<PathBuf> {
    let folder = name.to_lowercase().replace(['_', '.'], "-");
    let receipt = fs::read_to_string(root.join(folder).join("uv-receipt.toml")).ok()?;
    let receipt: toml::Value = toml::from_str(&receipt).ok()?;
    let points = receipt.get("tool")?.get("entrypoints")?.as_array()?;
    let named = |want: &str| {
        points
            .iter()
            .find(|point| point.get("name").and_then(toml::Value::as_str) == Some(want))
    };
    let short = name.split('-').next().unwrap_or(name);
    let only = points.first().filter(|_| points.len() == 1);
    let path = PathBuf::from(
        named(name)
            .or_else(|| named(short))
            .or(only)?
            .get("install-path")?
            .as_str()?,
    );

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
                .and_then(|bin| process::which_in(&bin, modules.join(".bin").into_os_string()));

            if let Some(path) = local {
                return Some(found(path, true));
            }

            process::which(&npm_bin(npm_global()?, name)?).map(|path| found(path, false))
        }
        Source::Uv { package } => {
            let name = uv_name(package);

            if let Some(path) = uv_bin(&tools.join("uv"), name) {
                return Some(found(path, true));
            }

            uv_bin(uv_global()?, name).map(|path| found(path, false))
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
