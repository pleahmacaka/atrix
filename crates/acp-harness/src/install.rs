use std::collections::BTreeMap;
use std::fs;
use std::io::Cursor;
use std::path::{Component, Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::registry::{self, Agent, BinaryTarget, Package};
use crate::{Error, Result};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Invocation {
    pub command: PathBuf,

    pub args: Vec<String>,

    pub env: BTreeMap<String, String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Download {
    pub target: BinaryTarget,

    pub dir: PathBuf,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Resolution {
    Ready(Invocation),
    NeedsDownload(Download),
}

pub fn install_dir(agent: &Agent, cache: &Path) -> Result<PathBuf> {
    let id = relative(&agent.id).filter(|p| p.components().count() == 1);
    let version = relative(&agent.version).filter(|p| p.components().count() == 1);

    match (id, version) {
        (Some(id), Some(version)) => Ok(cache.join(id).join(version)),
        _ => Err(Error::UnsafePath(format!("{}/{}", agent.id, agent.version))),
    }
}

fn relative(path: &str) -> Option<PathBuf> {
    let mut clean = PathBuf::new();

    for component in Path::new(path).components() {
        match component {
            Component::CurDir => {}
            Component::Normal(part) => clean.push(part),
            _ => return None,
        }
    }

    (!clean.as_os_str().is_empty()).then_some(clean)
}

fn command_path(target: &BinaryTarget) -> Result<PathBuf> {
    relative(&target.cmd).ok_or_else(|| Error::UnsafePath(target.cmd.clone()))
}

fn invocation(command: PathBuf, target: &BinaryTarget) -> Invocation {
    Invocation {
        command,
        args: target.args.clone(),
        env: target.env.clone(),
    }
}

fn runner(program: &str, prefix: &[&str], package: &Package) -> Option<Invocation> {
    let command = which::which(program).ok()?;
    let args = prefix
        .iter()
        .map(|a| a.to_string())
        .chain([package.package.clone()])
        .chain(package.args.iter().cloned())
        .collect();

    Some(Invocation {
        command,
        args,
        env: package.env.clone(),
    })
}

fn command_name(cmd: &str) -> Option<&str> {
    Path::new(cmd).file_stem()?.to_str()
}

pub fn installed(agent: &Agent, cache: &Path) -> Option<Invocation> {
    let target = agent.distribution.binary_for(registry::platform()?)?;
    let local = install_dir(agent, cache)
        .ok()?
        .join(command_path(target).ok()?);

    if local.is_file() {
        return Some(invocation(local, target));
    }

    let on_path = which::which(command_name(&target.cmd)?).ok()?;

    Some(invocation(on_path, target))
}

pub fn resolve(agent: &Agent, cache: &Path) -> Result<Resolution> {
    if let Some(ready) = installed(agent, cache) {
        return Ok(Resolution::Ready(ready));
    }

    let distribution = &agent.distribution;
    let npx = distribution
        .npx
        .as_ref()
        .and_then(|p| runner("npx", &["-y", "--prefer-offline"], p));
    let uvx = distribution
        .uvx
        .as_ref()
        .and_then(|p| runner("uvx", &[], p));

    if let Some(ready) = npx.or(uvx) {
        return Ok(Resolution::Ready(ready));
    }

    let platform = registry::platform().unwrap_or("unknown");

    match distribution.binary_for(platform) {
        Some(target) => Ok(Resolution::NeedsDownload(Download {
            target: target.clone(),
            dir: install_dir(agent, cache)?,
        })),
        None => Err(Error::NoDistribution {
            agent: agent.id.clone(),
            platform: platform.to_owned(),
        }),
    }
}

pub fn on_path(command_line: &[&str]) -> Option<Invocation> {
    let (program, args) = command_line.split_first()?;

    Some(Invocation {
        command: which::which(program).ok()?,
        args: args.iter().map(|a| a.to_string()).collect(),
        env: BTreeMap::new(),
    })
}

pub async fn download(client: &reqwest::Client, download: &Download) -> Result<Invocation> {
    let url = &download.target.archive;

    if !url.starts_with("https://") {
        return Err(Error::Insecure(url.clone()));
    }

    let bytes = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;

    if let Some(expected) = &download.target.sha256 {
        let actual = hex::encode(Sha256::digest(&bytes));

        if !actual.eq_ignore_ascii_case(expected) {
            return Err(Error::Checksum(url.clone()));
        }
    }

    let download = download.clone();

    tokio::task::spawn_blocking(move || place(&download, &bytes)).await?
}

fn place(download: &Download, bytes: &[u8]) -> Result<Invocation> {
    let target = &download.target;
    let command = command_path(target)?;
    let mut partial = download.dir.clone().into_os_string();

    partial.push(".partial");

    let partial = PathBuf::from(partial);

    if partial.exists() {
        fs::remove_dir_all(&partial)?;
    }

    fs::create_dir_all(&partial)?;
    unpack(&target.archive, &command, bytes, &partial)?;

    let program = partial.join(&command);

    if !program.is_file() {
        return Err(Error::MissingBinary(program));
    }

    make_executable(&program)?;

    if download.dir.exists() {
        fs::remove_dir_all(&download.dir)?;
    }

    fs::rename(&partial, &download.dir)?;

    Ok(invocation(download.dir.join(command), target))
}

fn unpack(archive: &str, command: &Path, bytes: &[u8], dir: &Path) -> Result<()> {
    let name = archive
        .split(['?', '#'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();

    if name.ends_with(".zip") {
        zip::ZipArchive::new(Cursor::new(bytes))?.extract(dir)?;
    } else if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        tar::Archive::new(flate2::read::GzDecoder::new(bytes)).unpack(dir)?;
    } else if name.ends_with(".tar.bz2") || name.ends_with(".tbz2") {
        tar::Archive::new(bzip2::read::BzDecoder::new(bytes)).unpack(dir)?;
    } else {
        let program = dir.join(command);

        if let Some(parent) = program.parent() {
            fs::create_dir_all(parent)?;
        }

        fs::write(program, bytes)?;
    }

    Ok(())
}

#[cfg(unix)]
fn make_executable(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(path, fs::Permissions::from_mode(0o755))
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> std::io::Result<()> {
    Ok(())
}
