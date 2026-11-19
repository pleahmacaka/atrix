use std::process::Command;
use std::time::Duration;

use crate::wait;

const PROCESS: &str = "atrix";

pub fn running() -> bool {
    Command::new("pgrep")
        .args(["-x", PROCESS])
        .output()
        .is_ok_and(|out| out.status.success())
}

pub fn stop(_shell: bool) -> Result<(), String> {
    let _ = Command::new("pkill").args(["-x", PROCESS]).status();

    if !wait(|| !running(), Duration::from_secs(10)) {
        return Err("Atrix is still running".to_string());
    }

    Ok(())
}
