mod agents;
mod backdrop;
mod bridge;
mod channels;
mod console;
mod datasource;
mod error;
mod fetch;
mod files;
mod install;
mod kg;
mod net;
mod overlay;
mod pcb;
mod platform;
mod presence;
mod process;
mod secret;
mod stdio;

pub use stdio::{FLAG as MCP_STDIO_FLAG, run as mcp_stdio};
use tauri::webview::PageLoadEvent;
use tauri::{Manager, RunEvent};
use tauri_plugin_log::log::LevelFilter;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

const LOG_BYTES: u128 = 5_000_000;

fn logger(app: &tauri::App) -> tauri::Result<()> {
    #[cfg(desktop)]
    let folder = app.path().home_dir()?.join(".atrix").join("logs");
    #[cfg(mobile)]
    let folder = app.path().app_log_dir()?;

    app.handle().plugin(
        tauri_plugin_log::Builder::new()
            .clear_targets()
            .target(Target::new(TargetKind::Stdout))
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
    let builder = tauri::Builder::default()
        .setup(|app| {
            logger(app)?;
            backdrop::install(app);

            Ok(())
        })
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Started && webview.label() == "main" {
                webview.state::<agents::Agents>().kill_all();
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
            files::list_dirs,
            files::copy_path,
            files::remove_path,
            files::read_lines,
            files::grep_head,
            files::browse_dirs,
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
            }
        });
}
