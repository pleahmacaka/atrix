use std::process::Stdio;

use serde::Deserialize;

use crate::error::{Error, Result};
use crate::process;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GitOp {
    Status,
    Diff { file: String, staged: bool },
    Untracked { file: String },
    Stage { files: Vec<String> },
    Unstage { files: Vec<String> },
    Commit { message: String },
    Pull,
    Push,
}

impl GitOp {
    fn invocation(self) -> (Vec<String>, bool) {
        match self {
            Self::Status => (status(), false),
            Self::Diff { file, staged } => {
                let diff = if staged {
                    vec!["diff".into(), "--no-color".into(), "--cached".into()]
                } else {
                    vec!["diff".into(), "--no-color".into()]
                };

                (paths(diff, [file]), false)
            }
            Self::Untracked { file } => (
                paths(
                    vec!["diff".into(), "--no-color".into(), "--no-index".into()],
                    ["/dev/null".into(), file],
                ),
                true,
            ),
            Self::Stage { files } => (paths(vec!["add".into(), "-A".into()], files), false),
            Self::Unstage { files } => (paths(vec!["reset".into(), "-q".into()], files), false),
            Self::Commit { message } => (vec!["commit".into(), "-m".into(), message], false),
            Self::Pull => (vec!["pull".into(), "--no-edit".into()], false),
            Self::Push => (vec!["push".into()], false),
        }
    }
}

fn status() -> Vec<String> {
    [
        "--no-optional-locks",
        "status",
        "--porcelain=v1",
        "--branch",
        "-z",
        "--untracked-files=all",
    ]
    .into_iter()
    .map(String::from)
    .collect()
}

fn paths(command: Vec<String>, files: impl IntoIterator<Item = String>) -> Vec<String> {
    command
        .into_iter()
        .chain(["--".into()])
        .chain(files)
        .collect()
}

fn run(dir: &str, args: &[String], differs_ok: bool) -> Result<String> {
    let output = process::command("git")?
        .args(["-c", "core.quotePath=false"])
        .args(args)
        .current_dir(dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_LITERAL_PATHSPECS", "1")
        .stdin(Stdio::null())
        .output()?;
    let differs = differs_ok && output.status.code() == Some(1);

    if !output.status.success() && !differs {
        return Err(Error::code(
            "git_failed",
            String::from_utf8_lossy(&output.stderr).trim(),
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[tauri::command(async)]
pub fn git_run(path: String, op: GitOp) -> Result<String> {
    let top = run(
        &path,
        &["rev-parse".into(), "--show-toplevel".into()],
        false,
    )?;
    let (args, differs_ok) = op.invocation();

    run(top.trim(), &args, differs_ok)
}
