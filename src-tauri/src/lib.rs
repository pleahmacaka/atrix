mod agents;
mod backdrop;
mod bridge;
mod channels;
mod console;
mod datasource;
mod error;
mod fetch;
mod files;
mod float;
mod git;
mod install;
mod kg;
mod net;
mod overlay;
mod pcb;
mod platform;
mod presence;
mod process;
#[cfg(desktop)]
mod pty;
mod secret;
mod stdio;
#[cfg(desktop)]
mod tray;
mod usage;

pub use stdio::{FLAG as MCP_STDIO_FLAG, run as mcp_stdio};
use tauri::webview::PageLoadEvent;
use tauri::{Manager, RunEvent};
use tauri_plugin_log::log::LevelFilter;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

#[cfg(debug_assertions)]
pub(crate) fn dev_icon() -> tauri::image::Image<'static> {
    tauri::include_image!("icons/dev.png")
}

const LOG_BYTES: u128 = 5_000_000;

fn logger(app: &tauri::App) -> tauri::Result<()> {
    #[cfg(desktop)]
    let folder = app.path().home_dir()?.join(".atrix").join("logs");
    #[cfg(mobile)]
    let folder = app.path().app_log_dir()?;

    let builder = tauri_plugin_log::Builder::new().clear_targets();
    // stdout follows AttachConsole in console.rs and would print into the user's terminal
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(all(desktop, not(debug_assertions)))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _| {
        tray::show(app);

        if let Some(code) = net::pair_code_in(&args) {
            let _ = tauri::Emitter::emit(app, "pair-code", code);
        }
    }));

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(pty::Ptys::default());

    let builder = builder
        .setup(|app| {
            logger(app)?;
            backdrop::install(app);

            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.set_icon(dev_icon())?;
            }

            #[cfg(desktop)]
            {
                app.manage(tray::Tray::<tauri::Wry>::default());
                tray::install(app.handle())?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            match event {
                #[cfg(desktop)]
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                tauri::WindowEvent::Destroyed => window.app_handle().exit(0),
                _ => {}
            }
        })
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Started && webview.label() == "main" {
                webview.state::<agents::Agents>().kill_all();

                #[cfg(desktop)]
                webview.state::<pty::Ptys>().kill_all();
            }
        })
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_oauth::init());

    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());

    builder
        .manage(agents::Agents::default())
        .manage(bridge::Bridge::default())
        .manage(channels::Channels::default())
        .manage(kg::Store::default())
        .manage(net::Net::default())
        .manage(datasource::Datasources::default())
        .invoke_handler(tauri::generate_handler![
            agents::agent_spawn,
            agents::agent_send,
            agents::agent_close,
            agents::installed_commands,
            bridge::bridge_start,
            bridge::bridge_reply,
            channels::channel_start,
            channels::channel_stop,
            channels::channel_send,
            channels::channel_token_set,
            channels::channel_token_clear,
            channels::channel_token_present,
            console::terminal_type,
            console::terminal_interrupt,
            console::terminal_keys,
            console::terminal_screen,
            usage::usage_graph,
            usage::usage_autosubmit,
            usage::usage_autosubmit_status,
            backdrop::window_backdrop,
            console::terminal_paste_image,
            console::clipboard_image,
            datasource::ds_list,
            datasource::ds_create,
            datasource::ds_delete,
            datasource::ds_tables,
            datasource::ds_query,
            datasource::ds_execute,
            datasource::ds_sync_get,
            datasource::ds_sync_set,
            datasource::ds_sync,
            datasource::ds_knowledge_get,
            datasource::ds_knowledge_set,
            files::read_text,
            files::write_text,
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
            net::startup_pair_code,
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
            #[cfg(desktop)]
            pty::pty_open,
            #[cfg(desktop)]
            pty::pty_write,
            #[cfg(desktop)]
            pty::pty_resize,
            #[cfg(desktop)]
            pty::pty_close,
            pcb::pcb_project,
            pcb::pcb_read,
            pcb::pcb_files,
            pcb::pcb_derive,
            presence::claude_presence,
            presence::claude_subagents,
            presence::codex_presence,
            presence::codex_rollout,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<agents::Agents>().kill_all();
                app.state::<kg::Store>().kill();

                #[cfg(desktop)]
                app.state::<pty::Ptys>().kill_all();
            }
        });
}
