mod agents;
mod bridge;
mod datasource;
mod files;
mod kg;
mod pcb;
mod presence;
mod tailnet;

use tauri::{Manager, RunEvent};
use tauri_plugin_log::log::LevelFilter;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

const LOG_BYTES: u128 = 5_000_000;

fn logger(app: &tauri::App) -> tauri::Result<()> {
    let folder = app.path().home_dir()?.join(".atrix").join("logs");

    app.handle().plugin(
        tauri_plugin_log::Builder::new()
            .clear_targets()
            .target(Target::new(TargetKind::Stdout))
            .target(Target::new(TargetKind::Folder {
                path: folder,
                file_name: Some("atrix".into()),
            }))
            .level(LevelFilter::Info)
            .timezone_strategy(TimezoneStrategy::UseLocal)
            .max_file_size(LOG_BYTES)
            .rotation_strategy(RotationStrategy::KeepSome(5))
            .build(),
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| Ok(logger(app)?))
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_oauth::init())
        .manage(agents::Agents::default())
        .manage(bridge::Bridge::default())
        .manage(kg::Store::default())
        .manage(tailnet::Tailnet::default())
        .manage(datasource::Datasources::default())
        .invoke_handler(tauri::generate_handler![
            agents::agent_spawn,
            agents::agent_send,
            agents::agent_close,
            agents::installed_commands,
            bridge::bridge_start,
            bridge::bridge_reply,
            files::read_text,
            files::write_text,
            files::list_dirs,
            files::copy_path,
            files::remove_path,
            files::read_lines,
            files::grep_head,
            files::browse_dirs,
            kg::kg_start,
            datasource::ds_list,
            datasource::ds_create,
            datasource::ds_delete,
            datasource::ds_tables,
            datasource::ds_query,
            datasource::ds_execute,
            datasource::ds_sync_get,
            datasource::ds_sync_set,
            datasource::ds_sync,
            presence::claude_presence,
            presence::codex_presence,
            presence::codex_rollout,
            pcb::pcb_project,
            pcb::pcb_read,
            pcb::pcb_files,
            pcb::pcb_derive,
            tailnet::tailnet_addresses,
            tailnet::tailnet_start,
            tailnet::tailnet_reply,
            tailnet::tailnet_emit,
            tailnet::tailnet_valid,
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
