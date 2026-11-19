use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::OnceLock;
use std::thread;

use tauri::ipc::Channel;

use crate::error::{Error, Result};
use crate::process::{self, home, tools_dir};

pub enum Source<'a> {
    Npm { package: &'a str },
    Uv { package: &'a str },
    Binary { id: &'a str, cmd: &'a str },
}

pub struct Found {
    pub path: PathBuf,
    pub local: bool,
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

fn uv_env(tools: &Path) -> Vec<(&'static str, PathBuf)> {
    vec![
        ("UV_TOOL_DIR", tools.join("uv")),
        ("UV_TOOL_BIN_DIR", tools.join("bin")),
        ("UV_PYTHON_INSTALL_DIR", tools.join("python")),
    ]
}

fn plan(source: &Source, tools: &Path) -> Option<Plan> {
    match source {
        Source::Npm { package } => Some(Plan {
            program: "npm",
            args: vec![
                "install".to_owned(),
                "--prefix".to_owned(),
                tools.to_string_lossy().into_owned(),
                "--no-fund".to_owned(),
                "--no-audit".to_owned(),
                (*package).to_owned(),
            ],
            env: Vec::new(),
        }),
        Source::Uv { package } => Some(Plan {
            program: "uv",
            args: vec![
                "tool".to_owned(),
                "install".to_owned(),
                (*package).to_owned(),
            ],
            env: uv_env(tools),
        }),
        Source::Binary { .. } => None,
    }
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
            env: uv_env(tools),
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

pub fn install(source: &Source, channel: &Channel<String>) -> Result<()> {
    let tools = tools_dir();
    let plan = plan(source, &tools).ok_or("install_unsupported")?;

    fs::create_dir_all(&tools)?;

    run(plan, channel)
}

pub fn uninstall(source: &Source, channel: &Channel<String>) -> Result<()> {
    if let Source::Binary { id, .. } = source {
        fs::remove_dir_all(tools_dir().join(safe(id)?))?;

        return Ok(());
    }

    run(
        removal(source, &tools_dir()).ok_or("install_unsupported")?,
        channel,
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

pub fn find(source: &Source) -> Option<Found> {
    let tools = tools_dir();

    match source {
        Source::Npm { package } => {
            let name = npm_name(package);
            let modules = tools.join("node_modules");
            let local = npm_bin(&modules, name)
                .and_then(|bin| process::which_in(&bin, modules.join(".bin").into_os_string()));

            if let Some(path) = local {
                return Some(Found { path, local: true });
            }

            process::which(&npm_bin(npm_global()?, name)?).map(|path| Found { path, local: false })
        }
        Source::Uv { package } => {
            let name = uv_name(package);

            if let Some(path) = uv_bin(&tools.join("uv"), name) {
                return Some(Found { path, local: true });
            }

            uv_bin(uv_global()?, name).map(|path| Found { path, local: false })
        }
        Source::Binary { id, cmd } => {
            let id = safe(id).ok()?;

            [(tools, true), (user_tools(), false)]
                .into_iter()
                .map(|(root, local)| (root.join(id).join(cmd), local))
                .find(|(path, _)| path.is_file())
                .map(|(path, local)| Found { path, local })
        }
    }
}
