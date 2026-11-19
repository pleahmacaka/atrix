use std::sync::Mutex;

use tauri::menu::{IsMenuItem, Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime, State};

use crate::desktop::Components;
use crate::desktop::components::open_settings;
use crate::error::Result;

const OPEN: &str = "tray-open";

const SETTINGS: &str = "tray-settings";

const QUIT: &str = "tray-quit";

struct Items<R: Runtime> {
    open: Option<MenuItem<R>>,
    settings: MenuItem<R>,
    quit: MenuItem<R>,
}

pub struct Tray<R: Runtime>(Mutex<Option<Items<R>>>);

impl<R: Runtime> Default for Tray<R> {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

fn agent<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.state::<Components>().agent
}

pub fn show<R: Runtime>(app: &AppHandle<R>) {
    if !agent(app) {
        return;
    }

    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
}

pub fn activate<R: Runtime>(app: &AppHandle<R>) {
    if agent(app) {
        show(app);
    } else {
        open_settings(app, None);
    }
}

pub fn install<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    let open = if agent(app) {
        Some(MenuItem::with_id(app, OPEN, "Atrix", true, None::<&str>)?)
    } else {
        None
    };
    let settings = MenuItem::with_id(app, SETTINGS, "Desktop settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT, "Quit", true, None::<&str>)?;
    let entries: Vec<&dyn IsMenuItem<R>> = open
        .iter()
        .map(|item| item as &dyn IsMenuItem<R>)
        .chain([&settings as &dyn IsMenuItem<R>, &quit])
        .collect();
    let menu = Menu::with_items(app, &entries)?;
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Atrix")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            OPEN => show(app),
            SETTINGS => open_settings(app, None),
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
                activate(tray.app_handle());
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
    *app.state::<Tray<R>>().0.lock()? = Some(Items {
        open,
        settings,
        quit,
    });

    Ok(())
}

#[tauri::command]
pub fn tray_labels(
    tray: State<'_, Tray<tauri::Wry>>,
    open: Option<String>,
    settings: Option<String>,
    quit: Option<String>,
) -> Result<()> {
    let items = tray.0.lock()?;

    let Some(items) = items.as_ref() else {
        return Ok(());
    };

    let labels = [
        (items.open.as_ref(), open),
        (Some(&items.settings), settings),
        (Some(&items.quit), quit),
    ];

    for (item, label) in labels {
        if let (Some(item), Some(label)) = (item, label) {
            item.set_text(label)?;
        }
    }

    Ok(())
}
