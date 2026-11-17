use tauri::{Manager, Runtime, WebviewWindow};

use crate::error::Result;

#[cfg(windows)]
unsafe extern "system" fn hold_active(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
    _id: usize,
    _data: usize,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Foundation::WPARAM;
    use windows::Win32::UI::Shell::DefSubclassProc;
    use windows::Win32::UI::WindowsAndMessaging::WM_NCACTIVATE;

    // DWM swaps acrylic for an opaque fill once the frame reports inactive
    let wparam = if msg == WM_NCACTIVATE {
        WPARAM(1)
    } else {
        wparam
    };

    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}

#[cfg(windows)]
fn keep_active<R: Runtime>(window: &WebviewWindow<R>) -> Result<()> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::SetWindowSubclass;

    let hwnd = HWND(window.hwnd()?.0);

    if unsafe { SetWindowSubclass(hwnd, Some(hold_active), 1, 0) }.as_bool() {
        Ok(())
    } else {
        Err("set_window_subclass_failed".into())
    }
}

#[cfg(not(windows))]
fn keep_active<R: Runtime>(_window: &WebviewWindow<R>) -> Result<()> {
    Ok(())
}

pub fn install<R: Runtime, M: Manager<R>>(app: &M) {
    if let Some(window) = app.get_webview_window("main")
        && let Err(e) = keep_active(&window)
    {
        tauri_plugin_log::log::warn!("backdrop: {e}");
    }
}

#[cfg(windows)]
#[tauri::command]
pub fn window_backdrop(window: WebviewWindow, glass: bool) -> Result<()> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DWMSBT_NONE, DWMSBT_TRANSIENTWINDOW, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE,
        DWMWA_SYSTEMBACKDROP_TYPE, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
        DwmSetWindowAttribute,
    };

    let hwnd = HWND(window.hwnd()?.0);
    let corner = DWMWCP_ROUND;
    let border = DWMWA_COLOR_NONE;
    let backdrop = if glass {
        DWMSBT_TRANSIENTWINDOW
    } else {
        DWMSBT_NONE
    };

    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            (&raw const backdrop).cast(),
            size_of_val(&backdrop) as u32,
        )?;
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            (&raw const corner).cast(),
            size_of_val(&corner) as u32,
        )?;
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            (&raw const border).cast(),
            size_of_val(&border) as u32,
        )?;
    }

    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn window_backdrop(_glass: bool) -> Result<()> {
    Ok(())
}
