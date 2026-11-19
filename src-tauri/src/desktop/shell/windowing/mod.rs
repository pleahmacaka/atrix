use std::collections::{HashMap, HashSet};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, Webview, WebviewWindow, WindowEvent};

use crate::desktop::shell::desktop;

mod geometry;
pub(crate) mod region;

const RESIDENT: [&str; 3] = ["launcher", "taskbar", "preview"];

const BLUR_TOGGLE_GUARD: Duration = Duration::from_millis(250);
const SHOW_SETTLE: Duration = Duration::from_millis(400);
const FADE_OUT: Duration = Duration::from_millis(140);
const READY_FALLBACK: Duration = Duration::from_millis(1500);
const LAZY_KEEP: Duration = Duration::from_secs(120);
const BUILD_RETRY: Duration = Duration::from_millis(120);

static BLUR_HIDDEN_AT: Mutex<Option<Instant>> = Mutex::new(None);
static HIDDEN_AT: LazyLock<Mutex<HashMap<String, Instant>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static FADES: LazyLock<Mutex<HashMap<String, u64>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
static RETIRING: LazyLock<Mutex<HashMap<String, u64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

// a freshly built transparent window shows nothing until its page mounts, so it waits for the page's ready call
static UNPAINTED: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));
static AWAITING: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

// an emit can land before a lazy window's page exists, so open requests carry a pull-based intent instead
static PENDING_INTENT: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub fn show_window(app: AppHandle, label: String) {
    show(&app, &label);
}

#[tauri::command]
pub fn open_with_intent(app: AppHandle, label: String, intent: String) {
    PENDING_INTENT.lock().unwrap().insert(label.clone(), intent);
    show(&app, &label);
}

#[tauri::command]
pub fn take_intent(label: String) -> Option<String> {
    PENDING_INTENT.lock().unwrap().remove(&label)
}

#[tauri::command]
pub fn set_window_region(
    window: WebviewWindow,
    rects: Option<Vec<[f64; 4]>>,
) -> Result<(), String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    let physical = rects.map(|rects| {
        rects
            .into_iter()
            .map(|rect| region::physical(rect, scale))
            .collect::<Vec<_>>()
    });

    region::set(hwnd, physical.as_deref(), true);

    Ok(())
}

#[tauri::command]
pub fn hide_window(app: AppHandle, label: String) {
    hide(&app, &label);
}

#[tauri::command]
pub fn toggle_window(app: AppHandle, label: String) {
    toggle(&app, &label);
}

// building a webview inside a main-thread callback deadlocks the event loop, so lazy windows are built from a helper thread
pub fn show(app: &AppHandle, label: &str) {
    if label == "main" && !app.state::<crate::desktop::Components>().agent {
        return;
    }

    let app = app.clone();
    let label = label.to_string();

    std::thread::spawn(move || {
        for _ in 0..3 {
            if window_for(&app, &label).is_some() {
                if !atrix_window_kit::headless() {
                    on_main(&app, &label, show_now);
                }

                return;
            }

            std::thread::sleep(BUILD_RETRY);
        }
    });
}

#[tauri::command]
pub fn window_ready(window: WebviewWindow) {
    let label = window.label().to_string();

    UNPAINTED.lock().unwrap().remove(&label);
    on_main(window.app_handle(), &label, present_awaited);
}

pub fn hide(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        if window.is_visible().unwrap_or(false) {
            HIDDEN_AT
                .lock()
                .unwrap()
                .insert(label.to_string(), Instant::now());
        }

        conceal(&window);
    }
}

// a click on the opener blurs the open window first, so the click that follows must not reopen it
pub fn just_hidden(label: &str) -> bool {
    HIDDEN_AT
        .lock()
        .unwrap()
        .remove(label)
        .is_some_and(|at| at.elapsed() < BLUR_TOGGLE_GUARD)
}

pub fn hide_on_blur(window: &WebviewWindow) {
    if !window.is_visible().unwrap_or(false) {
        return;
    }

    let window = window.clone();
    let app = window.app_handle().clone();

    std::thread::spawn(move || {
        // the shell steals focus back for a beat after show, so judge focus only after the settle window
        std::thread::sleep(SHOW_SETTLE);

        let _ = app.run_on_main_thread(move || {
            if crate::desktop::shell::edit::editing()
                || window.is_focused().unwrap_or(true)
                || !window.is_visible().unwrap_or(false)
            {
                return;
            }

            conceal(&window);
            *BLUR_HIDDEN_AT.lock().unwrap() = Some(Instant::now());
        });
    });
}

// tauri hides only the HWND, so the WebView2 controller keeps rendering until it is hidden as well
pub(crate) fn set_webview_visible(window: &WebviewWindow, visible: bool) {
    let webview: &Webview = window.as_ref();

    let _ = if visible {
        webview.show()
    } else {
        webview.hide()
    };
}

pub fn webview_visible(app: &AppHandle, label: &str, visible: bool) {
    if let Some(window) = app.get_webview_window(label) {
        set_webview_visible(&window, visible);
    }
}

// shell code reaches these by label at any time, so they are built with the shell and never retire
pub(crate) fn build_resident(app: &AppHandle) {
    for label in RESIDENT {
        let Some(window) = window_for(app, label) else {
            continue;
        };

        if !window.is_visible().unwrap_or(true) {
            set_webview_visible(&window, false);
        }
    }
}

fn conceal(window: &WebviewWindow) {
    let label = window.label().to_string();
    let app = window.app_handle().clone();

    let _ = app.emit("window-hiding", label.clone());

    let generation = {
        let mut fades = FADES.lock().unwrap();
        let generation = fades.get(&label).copied().unwrap_or(0) + 1;
        fades.insert(label.clone(), generation);
        generation
    };
    let window = window.clone();

    std::thread::spawn(move || {
        std::thread::sleep(FADE_OUT);

        let proceed = {
            let mut fades = FADES.lock().unwrap();

            if fades.get(&label) == Some(&generation) {
                fades.remove(&label);
                true
            } else {
                false
            }
        };

        if !proceed {
            return;
        }

        let _ = app.run_on_main_thread(move || {
            let _ = window.hide();
            set_webview_visible(&window, false);
            let _ = window.app_handle().emit("window-hidden", label.clone());

            if lazy(window.app_handle(), &label) {
                retire(window);
            }
        });
    });
}

// lazy windows stay warm for a while after hiding, then close to free their renderer
fn retire(window: WebviewWindow) {
    let label = window.label().to_string();
    let generation = {
        let mut retiring = RETIRING.lock().unwrap();
        let generation = retiring.get(&label).copied().unwrap_or(0) + 1;
        retiring.insert(label.clone(), generation);
        generation
    };

    std::thread::spawn(move || {
        std::thread::sleep(LAZY_KEEP);

        let app = window.app_handle().clone();

        let _ = app.run_on_main_thread(move || {
            let mut retiring = RETIRING.lock().unwrap();

            if retiring.get(&label) == Some(&generation) && !window.is_visible().unwrap_or(true) {
                retiring.remove(&label);
                let _ = window.destroy();
            }
        });
    });
}

fn lazy_config(app: &AppHandle, label: &str) -> Option<tauri::utils::config::WindowConfig> {
    app.config()
        .app
        .windows
        .iter()
        .find(|window| window.label == label && !window.create)
        .cloned()
}

fn lazy(app: &AppHandle, label: &str) -> bool {
    !RESIDENT.contains(&label) && lazy_config(app, label).is_some()
}

pub(crate) fn window_for(app: &AppHandle, label: &str) -> Option<WebviewWindow> {
    if let Some(window) = app.get_webview_window(label) {
        return Some(window);
    }

    let config = lazy_config(app, label)?;
    let builder = tauri::WebviewWindowBuilder::from_config(app, &config).ok()?;
    let window = atrix_window_kit::build(builder).ok()?;

    if config.skip_taskbar {
        hide_from_switcher(&window);
    }

    UNPAINTED.lock().unwrap().insert(label.to_string());

    if label == "launcher" {
        let launcher = window.clone();

        window.on_window_event(move |event| {
            if matches!(event, WindowEvent::Focused(false)) {
                hide_on_blur(&launcher);
            }
        });
    }

    Some(window)
}

// skipTaskbar only drops the taskbar button, and tao rewrites GWL_EXSTYLE on every state change, so the tool bit is enforced here
fn hide_from_switcher(window: &WebviewWindow) {
    use windows::Win32::UI::Shell::SetWindowSubclass;
    use windows::Win32::UI::WindowsAndMessaging::{
        GWL_EXSTYLE, GetWindowLongPtrW, SetWindowLongPtrW,
    };

    let target = window.clone();

    let _ = window.run_on_main_thread(move || {
        let Ok(hwnd) = target.hwnd() else {
            return;
        };

        unsafe {
            let _ = SetWindowSubclass(hwnd, Some(keep_tool_window), TOOL_SUBCLASS, 0);
            let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;

            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, tool_style(style) as isize);
        }
    });
}

const TOOL_SUBCLASS: usize = 2;

fn tool_style(style: u32) -> u32 {
    use windows::Win32::UI::WindowsAndMessaging::{WS_EX_APPWINDOW, WS_EX_TOOLWINDOW};

    (style | WS_EX_TOOLWINDOW.0) & !WS_EX_APPWINDOW.0
}

unsafe extern "system" fn keep_tool_window(
    hwnd: windows::Win32::Foundation::HWND,
    message: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
    _: usize,
    _: usize,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::UI::Shell::DefSubclassProc;
    use windows::Win32::UI::WindowsAndMessaging::{GWL_EXSTYLE, STYLESTRUCT, WM_STYLECHANGING};

    if message == WM_STYLECHANGING && wparam.0 as i32 == GWL_EXSTYLE.0 {
        let change = unsafe { &mut *(lparam.0 as *mut STYLESTRUCT) };

        change.styleNew = tool_style(change.styleNew);
    }

    unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
}

fn reveal(window: &WebviewWindow) {
    if atrix_window_kit::headless()
        || crate::desktop::shell::features::dock_deferred(window.label())
    {
        return;
    }

    cancel_fade(window.label());
    RETIRING.lock().unwrap().remove(window.label());
    set_webview_visible(window, true);
    let _ = window.show();
}

fn cancel_fade(label: &str) {
    FADES.lock().unwrap().remove(label);
}

fn fading(label: &str) -> bool {
    FADES.lock().unwrap().contains_key(label)
}

pub fn toggle(app: &AppHandle, label: &str) {
    on_main(app, label, |app, label| {
        let visible = app
            .get_webview_window(label)
            .and_then(|window| window.is_visible().ok())
            .unwrap_or(false);

        if visible && !fading(label) {
            hide(app, label);
        } else if !(label == "launcher" && just_hidden_by_blur()) {
            show(app, label);
        }
    });
}

fn just_hidden_by_blur() -> bool {
    BLUR_HIDDEN_AT
        .lock()
        .unwrap()
        .take()
        .is_some_and(|at| at.elapsed() < BLUR_TOGGLE_GUARD)
}

fn on_main(app: &AppHandle, label: &str, action: fn(&AppHandle, &str)) {
    let handle = app.clone();
    let label = label.to_string();

    let _ = app.run_on_main_thread(move || action(&handle, &label));
}

fn show_now(app: &AppHandle, label: &str) {
    let Some(window) = app.get_webview_window(label) else {
        show(app, label);

        return;
    };

    let _ = match label {
        "launcher" | "onboarding" => geometry::center_on_cursor_monitor(&window),
        "panel" | "notices" => geometry::dock_panel(app, &window),
        _ => Ok(()),
    };

    if UNPAINTED.lock().unwrap().contains(label) {
        AWAITING.lock().unwrap().insert(label.to_string());

        let app = app.clone();
        let label = label.to_string();

        std::thread::spawn(move || {
            std::thread::sleep(READY_FALLBACK);
            UNPAINTED.lock().unwrap().remove(&label);
            on_main(&app, &label, present_awaited);
        });

        return;
    }

    present(app, &window, label);
}

fn present_awaited(app: &AppHandle, label: &str) {
    if UNPAINTED.lock().unwrap().contains(label) || !AWAITING.lock().unwrap().remove(label) {
        return;
    }

    if let Some(window) = app.get_webview_window(label) {
        present(app, &window, label);
    }
}

fn present(app: &AppHandle, window: &WebviewWindow, label: &str) {
    reveal(window);

    if !matches!(label, "taskbar" | "topbar") {
        let _ = window.set_focus();
        desktop::force_foreground(window);
    }

    // transient panels must not linger when the focus grab silently failed
    if matches!(label, "panel" | "notices") {
        hide_on_blur(window);
    }

    let _ = app.emit("window-shown", label);
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use super::{BLUR_HIDDEN_AT, BLUR_TOGGLE_GUARD, just_hidden_by_blur};

    #[test]
    fn a_toggle_right_after_a_blur_hide_is_swallowed_once() {
        *BLUR_HIDDEN_AT.lock().unwrap() = Some(Instant::now());

        assert!(just_hidden_by_blur());
        assert!(!just_hidden_by_blur());

        *BLUR_HIDDEN_AT.lock().unwrap() =
            Some(Instant::now() - BLUR_TOGGLE_GUARD - Duration::from_millis(1));

        assert!(!just_hidden_by_blur());
    }
}
