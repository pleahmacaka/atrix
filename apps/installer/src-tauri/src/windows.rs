use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
use std::ptr::{null, null_mut};
use std::time::Duration;

use windows_sys::Win32::Foundation::HWND;
use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;
use windows_sys::Win32::UI::Shell::{SHAppBarMessage, ABM_SETSTATE, APPBARDATA};
use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowExW, ShowWindow, SW_SHOW};
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

use crate::{fail, wait, VERSION};

pub const NAME: &str = "windows";

const UNINSTALL: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Atrix";

const IMAGE: &str = "atrix.exe";

fn entry(name: &str) -> Option<String> {
    let value: String = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(UNINSTALL)
        .ok()?
        .get_value(name)
        .ok()?;

    Some(value.trim_matches('"').to_string())
}

fn exe() -> Result<PathBuf, String> {
    entry("InstallLocation")
        .map(|dir| PathBuf::from(dir).join(IMAGE))
        .ok_or_else(|| "Atrix is not installed".to_string())
}

fn hidden(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut command = Command::new(program);

    command.creation_flags(CREATE_NO_WINDOW);

    command
}

fn run(mut command: Command) -> Result<(), String> {
    let status = command.status().map_err(fail)?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "{} exited with {status}",
            command.get_program().to_string_lossy()
        ))
    }
}

fn numbers(version: &str) -> Vec<u64> {
    version
        .split(['.', '-', '+'])
        .map_while(|part| part.parse().ok())
        .collect()
}

pub fn installed() -> bool {
    entry("DisplayVersion").is_some()
}

pub fn outdated() -> bool {
    entry("DisplayVersion").is_some_and(|installed| numbers(&installed) < numbers(VERSION))
}

pub fn running() -> bool {
    hidden("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {IMAGE}"), "/NH"])
        .output()
        .is_ok_and(|out| {
            String::from_utf8_lossy(&out.stdout)
                .to_lowercase()
                .contains(IMAGE)
        })
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain([0]).collect()
}

fn saved_shell_state() -> Option<u64> {
    let store = PathBuf::from(std::env::var_os("APPDATA")?)
        .join("com.arixlab.atrix")
        .join("settings.json");
    let json: serde_json::Value = serde_json::from_slice(&std::fs::read(store).ok()?).ok()?;

    json.get("shellTaskbarState")?.as_u64()
}

// a force-stopped shell never restores explorer's taskbar, which it left hidden and in auto-hide
fn restore_taskbar() {
    let mut primary: HWND = null_mut();

    for class in ["Shell_TrayWnd", "Shell_SecondaryTrayWnd"] {
        let class = wide(class);
        let mut previous = null_mut();

        loop {
            let hwnd = unsafe { FindWindowExW(null_mut(), previous, class.as_ptr(), null()) };

            if hwnd.is_null() {
                break;
            }

            unsafe { ShowWindow(hwnd, SW_SHOW) };

            if primary.is_null() {
                primary = hwnd;
            }

            previous = hwnd;
        }
    }

    let Some(state) = saved_shell_state() else {
        return;
    };

    if primary.is_null() {
        return;
    }

    let mut data: APPBARDATA = unsafe { std::mem::zeroed() };

    data.cbSize = size_of::<APPBARDATA>() as u32;
    data.hWnd = primary;
    data.lParam = state as isize;

    unsafe { SHAppBarMessage(ABM_SETSTATE, &mut data) };
}

pub fn stop(shell: bool) -> Result<(), String> {
    let _ = hidden("taskkill").args(["/IM", IMAGE, "/F"]).status();

    if !wait(|| !running(), Duration::from_secs(10)) {
        return Err("Atrix is still running".to_string());
    }

    if shell {
        restore_taskbar();
    }

    Ok(())
}

pub fn install(payload: &[u8]) -> Result<(), String> {
    let dir = tempfile::Builder::new()
        .prefix("atrix-setup-")
        .tempdir()
        .map_err(fail)?;
    let setup = dir.path().join("atrix-setup.exe");

    std::fs::write(&setup, payload).map_err(fail)?;

    let mut command = Command::new(&setup);

    command.arg("/S");
    run(command)?;

    if outdated() || !installed() {
        return Err("setup finished without installing Atrix".to_string());
    }

    Ok(())
}

// the NSIS uninstaller relaunches itself from a temp copy, so its own exit says nothing about completion
pub fn uninstall() -> Result<(), String> {
    let uninstaller = entry("UninstallString").ok_or("Atrix is not installed")?;
    let mut command = Command::new(uninstaller);

    command.arg("/S");
    run(command)?;

    if !wait(|| !installed(), Duration::from_secs(120)) {
        return Err("uninstall did not finish".to_string());
    }

    Ok(())
}

pub fn default_app(enabled: bool) -> Result<(), String> {
    let mut command = hidden(exe()?);

    command.args(["--default-app", if enabled { "on" } else { "off" }]);

    run(command)
}

pub fn launch() -> Result<(), String> {
    Command::new(exe()?).spawn().map_err(fail)?;

    Ok(())
}
