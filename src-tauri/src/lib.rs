mod agents;
mod backdrop;
mod bridge;
mod channels;
#[cfg(windows)]
mod console;
mod datasource;
mod desktop;
mod error;
mod fetch;
mod files;
mod float;
mod git;
mod install;
mod kg;
mod launch;
mod net;
mod overlay;
mod pcb;
mod platform;
mod presence;
mod process;
mod secret;
mod stdio;
#[cfg(desktop)]
mod tray;
mod usage;
mod web;

pub use stdio::{FLAG as MCP_STDIO_FLAG, run as mcp_stdio};

use tauri::webview::PageLoadEvent;
use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_log::log::LevelFilter;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

const LOG_BYTES: u128 = 5_000_000;

#[cfg(all(desktop, debug_assertions))]
pub(crate) fn dev_icon() -> tauri::image::Image<'static> {
    tauri::include_image!("icons/dev.png")
}

fn logger(app: &tauri::App) -> tauri::Result<()> {
    #[cfg(desktop)]
    let folder = app.path().home_dir()?.join(".atrix").join("logs");
    #[cfg(mobile)]
    let folder = app.path().app_log_dir()?;

    let builder = tauri_plugin_log::Builder::new().clear_targets();
    #[cfg(debug_assertions)]
    let builder = builder.target(Target::new(TargetKind::Stdout));

    app.handle().plugin(
        builder
            .target(Target::new(TargetKind::Folder {
                path: folder,
                file_name: Some("atrix".into()),
            }))
            .level(LevelFilter::Info)
            .level_for("iroh", LevelFilter::Warn)
            .level_for("iroh_relay", LevelFilter::Warn)
            .level_for("noq", LevelFilter::Warn)
            .level_for("noq_proto", LevelFilter::Warn)
            .level_for("portmapper", LevelFilter::Warn)
            .timezone_strategy(TimezoneStrategy::UseLocal)
            .max_file_size(LOG_BYTES)
            .rotation_strategy(RotationStrategy::KeepSome(5))
            .build(),
    )
}

fn on_close(window: &tauri::Window, event: &WindowEvent) {
    match event {
        #[cfg(desktop)]
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = window.hide();
        }
        WindowEvent::Destroyed => window.app_handle().exit(0),
        _ => {}
    }
}

fn on_page_load(webview: &tauri::Webview, payload: &tauri::webview::PageLoadPayload) {
    if payload.event() != PageLoadEvent::Started || webview.label() != "main" {
        return;
    }

    webview.state::<agents::Agents>().kill_all();

    #[cfg(desktop)]
    tauri_plugin_atrix_terminal::close_window(webview.app_handle(), "main");
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    logger(app)?;
    backdrop::install(app);

    #[cfg(all(desktop, debug_assertions))]
    if let Some(window) = app.get_webview_window("main") {
        window.set_icon(dev_icon())?;
    }

    #[cfg(desktop)]
    {
        app.manage(tray::Tray::<tauri::Wry>::default());

        if app.state::<launch::Launch>().headless {
            if let Some(window) = app.get_webview_window("main") {
                window.hide()?;
            }

            println!("atrix running headless");
        } else {
            tray::install(app.handle())?;
        }
    }

    if let Some(addr) = app.state::<launch::Launch>().web.clone() {
        web::serve(app.handle(), &addr)?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();

    #[cfg(windows)]
    if let Some(code) = launch::one_shot(&args) {
        std::process::exit(code);
    }

    #[cfg(windows)]
    desktop::allow_foreground();

    let launch = launch::Launch::parse(&args);

    #[cfg(desktop)]
    let headless = launch.headless;
    #[cfg(desktop)]
    let components = desktop::Components::at_launch(headless);

    let builder = tauri::Builder::default().manage(launch);

    #[cfg(all(desktop, not(debug_assertions)))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(move |app, args, cwd| {
        if desktop::forward(app, components, &args, &cwd) {
            return;
        }

        tray::show(app);

        if let Some(code) = launch::pair_code(&args) {
            let _ = tauri::Emitter::emit(app, "pair-code", code);
        }
    }));

    #[cfg(desktop)]
    let builder = desktop::plugins(builder, components, headless)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    let builder = builder
        .setup(move |app| {
            setup(app)?;

            #[cfg(desktop)]
            desktop::setup(app.handle(), components);

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                on_close(window, event);
            }
        })
        .on_page_load(on_page_load)
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_oauth::init());

    #[cfg(mobile)]
    let builder = builder
        .plugin(tauri_plugin_barcode_scanner::init())
        .plugin(tauri_plugin_calendar_sync::init());

    builder
        .manage(agents::Agents::default())
        .manage(bridge::Bridge::default())
        .manage(channels::Channels::default())
        .manage(kg::Store::default())
        .manage(net::Net::default())
        .manage(datasource::Datasources::default())
        .invoke_handler(desktop::handler![
            agents::agent_spawn,
            agents::agent_send,
            agents::agent_close,
            agents::installed_commands,
            bridge::bridge_start,
            bridge::bridge_reply,
            channels::channel_start,
            channels::channel_stop,
            channels::channel_send,
            channels::channel_typing,
            channels::channel_bot_name,
            channels::channel_user_name,
            channels::channel_token_set,
            channels::channel_token_clear,
            channels::channel_token_present,
            usage::usage_graph,
            usage::usage_autosubmit,
            usage::usage_autosubmit_status,
            backdrop::window_backdrop,
            datasource::ds_list,
            datasource::ds_create,
            datasource::ds_delete,
            datasource::ds_tables,
            datasource::ds_query,
            datasource::ds_execute,
            datasource::ds_knowledge_get,
            datasource::ds_knowledge_set,
            files::read_text,
            files::write_text,
            files::save_attachment,
            files::append_text,
            files::read_image,
            files::read_view,
            files::list_dirs,
            files::copy_path,
            files::remove_path,
            files::read_lines,
            files::grep_head,
            files::browse_dirs,
            files::git_remote,
            git::git_run,
            install::tool_install,
            install::tool_uninstall,
            install::tool_find,
            install::tool_platform,
            kg::kg_start,
            launch::startup_pair_code,
            launch::headless,
            net::net_start,
            net::net_info,
            net::net_send,
            net::net_request,
            net::net_reply,
            net::net_issue,
            net::net_cancel,
            net::net_join,
            net::net_unpair,
            overlay::overlay_open,
            float::float_open,
            #[cfg(desktop)]
            tray::tray_labels,
            pcb::pcb_project,
            pcb::pcb_read,
            pcb::pcb_files,
            pcb::pcb_derive,
            presence::claude_presence,
            presence::claude_subagents,
            presence::codex_presence,
            presence::codex_rollout,
            #[cfg(desktop)]
            desktop::components::desktop_components_get,
            #[cfg(desktop)]
            desktop::components::desktop_components_set,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            #[cfg(windows)]
            RunEvent::Ready => desktop::shell::ready(app),
            RunEvent::Exit => {
                #[cfg(windows)]
                desktop::shell::exit(app);

                app.state::<agents::Agents>().kill_all();
                app.state::<kg::Store>().kill();
            }
            _ => {}
        });
}
