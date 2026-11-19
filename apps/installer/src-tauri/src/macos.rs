use std::path::{Path, PathBuf};
use std::process::Command;

use flate2::read::GzDecoder;

use crate::fail;

pub use crate::unix::{running, stop};

pub const NAME: &str = "macos";

const BUNDLE: &str = "Atrix.app";

fn roots() -> Vec<PathBuf> {
    let mut roots = vec![PathBuf::from("/Applications")];

    roots.extend(std::env::home_dir().map(|home| home.join("Applications")));

    roots
}

fn bundles() -> impl Iterator<Item = PathBuf> {
    roots()
        .into_iter()
        .map(|root| root.join(BUNDLE))
        .filter(|bundle| bundle.exists())
}

pub fn installed() -> bool {
    bundles().next().is_some()
}

pub fn outdated() -> bool {
    false
}

fn writable(root: &Path) -> bool {
    let probe = root.join(".atrix-installer-probe");

    std::fs::create_dir_all(root).is_ok()
        && std::fs::write(&probe, b"").is_ok()
        && std::fs::remove_file(&probe).is_ok()
}

pub fn install(payload: &[u8]) -> Result<(), String> {
    let root = roots()
        .into_iter()
        .find(|root| writable(root))
        .ok_or("no writable Applications folder")?;
    let staging = tempfile::Builder::new()
        .prefix(".atrix-installer-")
        .tempdir_in(&root)
        .map_err(fail)?;

    tar::Archive::new(GzDecoder::new(payload))
        .unpack(staging.path())
        .map_err(fail)?;

    std::fs::rename(staging.path().join(BUNDLE), root.join(BUNDLE)).map_err(fail)
}

pub fn uninstall() -> Result<(), String> {
    for bundle in bundles() {
        std::fs::remove_dir_all(bundle).map_err(fail)?;
    }

    Ok(())
}

pub fn default_app(_enabled: bool) -> Result<(), String> {
    Ok(())
}

pub fn launch() -> Result<(), String> {
    let bundle = bundles().next().ok_or("Atrix is not installed")?;

    Command::new("open").arg(bundle).spawn().map_err(fail)?;

    Ok(())
}
