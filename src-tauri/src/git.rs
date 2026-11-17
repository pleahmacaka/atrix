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

fn args(op: GitOp) -> (Vec<String>, bool) {
    let owned = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    let with_files = |list: &[&str], files: Vec<String>| {
        let mut all = owned(list);

        all.push("--".into());
        all.extend(files);
        all
    };

    match op {
        GitOp::Status => (
            owned(&[
                "--no-optional-locks",
                "status",
                "--porcelain=v1",
                "--branch",
                "-z",
                "--untracked-files=all",
            ]),
            false,
        ),
        GitOp::Diff { file, staged } => {
            let list: &[&str] = if staged {
                &["diff", "--no-color", "--cached"]
            } else {
                &["diff", "--no-color"]
            };

            (with_files(list, vec![file]), false)
        }
        GitOp::Untracked { file } => (
            with_files(
                &["diff", "--no-color", "--no-index"],
                vec!["/dev/null".into(), file],
            ),
            true,
        ),
        GitOp::Stage { files } => (with_files(&["add", "-A"], files), false),
        GitOp::Unstage { files } => (with_files(&["reset", "-q"], files), false),
        GitOp::Commit { message } => (owned(&["commit", "-m", &message]), false),
        GitOp::Pull => (owned(&["pull", "--no-edit"]), false),
        GitOp::Push => (owned(&["push"]), false),
    }
}

fn git(dir: &str, args: &[String], differs_ok: bool) -> Result<String> {
    let output = process::command("git")?
        .args(["-c", "core.quotePath=false"])
        .args(args)
        .current_dir(dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_LITERAL_PATHSPECS", "1")
        .stdin(Stdio::null())
        .output()?;
    // diff --no-index exits 1 whenever the files differ
    let ok = output.status.success() || (differs_ok && output.status.code() == Some(1));

    if !ok {
        let stderr = String::from_utf8_lossy(&output.stderr);

        return Err(Error::code("git_failed", stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[tauri::command(async)]
pub fn git_run(path: String, op: GitOp) -> Result<String> {
    // status paths are repo-root relative, so every op runs from the root
    let root = git(
        &path,
        &["rev-parse".into(), "--show-toplevel".into()],
        false,
    )?;
    let (args, differs_ok) = args(op);

    git(root.trim(), &args, differs_ok)
}
