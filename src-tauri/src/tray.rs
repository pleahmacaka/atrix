use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime, State};

use crate::error::Result;

const OPEN: &str = "tray-open";

const QUIT: &str = "tray-quit";

pub struct Tray<R: Runtime>(Mutex<Option<(MenuItem<R>, MenuItem<R>)>>);

impl<R: Runtime> Default for Tray<R> {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

pub fn show<R: Runtime>(app: &AppHandle<R>) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
}

pub fn install<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    let open = MenuItem::with_id(app, OPEN, "Atrix", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT, "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Atrix")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            OPEN => show(app),
            QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show(tray.app_handle());
            }
        });

    #[cfg(debug_assertions)]
    {
        builder = builder.icon(crate::dev_icon());
    }

    #[cfg(not(debug_assertions))]
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    *app.state::<Tray<R>>().0.lock()? = Some((open, quit));

    Ok(())
}

#[tauri::command]
pub fn tray_labels(tray: State<'_, Tray<tauri::Wry>>, open: String, quit: String) -> Result<()> {
    if let Some((open_item, quit_item)) = tray.0.lock()?.as_ref() {
        open_item.set_text(open)?;
        quit_item.set_text(quit)?;
    }

    Ok(())
}
