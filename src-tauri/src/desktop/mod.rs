mod commands;
#[cfg(desktop)]
pub(crate) mod components;
#[cfg(desktop)]
pub(crate) mod files;

#[cfg(windows)]
pub(crate) mod apps;
#[cfg(windows)]
pub(crate) mod clipboard;
#[cfg(windows)]
pub(crate) mod data;
#[cfg(windows)]
pub(crate) mod notifications;
#[cfg(windows)]
pub(crate) mod shell;
#[cfg(windows)]
pub(crate) mod system;
#[cfg(windows)]
pub(crate) mod usage;

#[cfg(desktop)]
use tauri::Manager;

pub(crate) use commands::handler;
#[cfg(desktop)]
pub use components::Components;

// a second launch forwards to the running instance, which may only raise its window with this grant
#[cfg(windows)]
pub fn allow_foreground() {
    use windows::Win32::UI::WindowsAndMessaging::{ASFW_ANY, AllowSetForegroundWindow};

    let _ = unsafe { AllowSetForegroundWindow(ASFW_ANY) };
}

#[cfg(desktop)]
pub fn plugins(
    builder: tauri::Builder<tauri::Wry>,
    components: Components,
    headless: bool,
) -> tauri::Builder<tauri::Wry> {
    let builder = builder
        .plugin(atrix_window_kit::init(headless))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_atrix_terminal::init("/shell/terminal"));

    #[cfg(windows)]
    let builder = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));

    if components.files {
        tauri_plugin_atrix_files::log_panics();

        builder.plugin(tauri_plugin_atrix_files::init(files::HOST))
    } else {
        builder
    }
}

#[cfg(desktop)]
pub fn setup(app: &tauri::AppHandle, components: Components) {
    let args: Vec<String> = std::env::args().skip(1).collect();

    if components.files && tauri_plugin_atrix_files::claims(&files::HOST, &args) {
        let cwd = std::env::current_dir().unwrap_or_default();

        if let Some(main) = app.get_webview_window("main") {
            let _ = main.hide();
        }

        tauri_plugin_atrix_files::start(app, args, &cwd);
    }

    #[cfg(windows)]
    if components.shell {
        shell::start(app);
    }
}

#[cfg(all(desktop, not(debug_assertions)))]
pub fn forward(app: &tauri::AppHandle, components: Components, args: &[String], cwd: &str) -> bool {
    if !components.files || !tauri_plugin_atrix_files::claims(&files::HOST, args) {
        return false;
    }

    tauri_plugin_atrix_files::forward(app, args.to_vec(), cwd.to_string());

    true
}
