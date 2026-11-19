use std::io::ErrorKind;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::fail;

pub use crate::unix::{running, stop};

pub const NAME: &str = "linux";

const ID: &str = "com.arixlab.atrix";

const ICON: &[u8] = include_bytes!("../../../../src-tauri/icons/128x128.png");

fn data() -> PathBuf {
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::home_dir().map(|home| home.join(".local").join("share")))
        .unwrap_or_default()
}

fn image() -> PathBuf {
    data().join("atrix").join("Atrix.AppImage")
}

fn entry() -> PathBuf {
    data().join("applications").join(format!("{ID}.desktop"))
}

fn icon() -> PathBuf {
    data()
        .join("icons/hicolor/128x128/apps")
        .join(format!("{ID}.png"))
}

pub fn installed() -> bool {
    image().exists()
}

pub fn outdated() -> bool {
    false
}

fn write(path: &Path, bytes: &[u8], mode: u32) -> Result<(), String> {
    let staged = path.with_extension("new");

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(fail)?;
    }

    std::fs::write(&staged, bytes).map_err(fail)?;
    std::fs::set_permissions(&staged, std::fs::Permissions::from_mode(mode)).map_err(fail)?;
    std::fs::rename(&staged, path).map_err(fail)
}

pub fn install(payload: &[u8]) -> Result<(), String> {
    let image = image();
    let desktop = format!(
        "[Desktop Entry]\nType=Application\nName=Atrix\nExec=\"{}\" %U\nIcon={ID}\nCategories=Development;\nTerminal=false\n",
        image.display(),
    );

    write(&image, payload, 0o755)?;
    write(&icon(), ICON, 0o644)?;
    write(&entry(), desktop.as_bytes(), 0o644)
}

pub fn uninstall() -> Result<(), String> {
    for path in [image(), entry(), icon()] {
        if let Err(error) = std::fs::remove_file(&path) {
            if error.kind() != ErrorKind::NotFound {
                return Err(fail(error));
            }
        }
    }

    let _ = std::fs::remove_dir(data().join("atrix"));

    Ok(())
}

pub fn default_app(_enabled: bool) -> Result<(), String> {
    Ok(())
}

pub fn launch() -> Result<(), String> {
    Command::new(image()).spawn().map_err(fail)?;

    Ok(())
}
