use std::env;
use std::ffi::OsString;
use std::path::PathBuf;
use std::process::Command;

use crate::error::{Error, Result};
use crate::platform;

pub fn home() -> PathBuf {
    env::home_dir().unwrap_or_default()
}

pub fn tools_dir() -> PathBuf {
    env::var_os("ATRIX_TOOLS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| home().join(".atrix").join("tools"))
}

pub fn user_bin() -> PathBuf {
    home().join(".local").join("bin")
}

fn system_path() -> Vec<PathBuf> {
    let list = env::var_os("PATH").unwrap_or_default();

    env::split_paths(&list).collect()
}

pub fn search_path() -> OsString {
    let tools = tools_dir();

    env::join_paths(
        [
            tools.join("bin"),
            tools.join("node_modules").join(".bin"),
            user_bin(),
        ]
        .into_iter()
        .chain(system_path()),
    )
    .unwrap_or_default()
}

pub fn which_in(name: &str, paths: OsString) -> Option<PathBuf> {
    which::which_in(name, Some(paths), env::current_dir().ok()?).ok()
}

pub fn which(name: &str) -> Option<PathBuf> {
    which_in(name, search_path())
}

pub fn command(name: &str) -> Result<Command> {
    let paths = search_path();
    let program =
        which_in(name, paths.clone()).ok_or_else(|| Error::code("command_not_found", name))?;

    let mut command = platform::hidden(program);

    command.env("PATH", paths);

    Ok(command)
}
