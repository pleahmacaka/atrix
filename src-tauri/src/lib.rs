mod agents;
mod files;
mod pcb;
mod presence;

use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_oauth::init())
        .manage(agents::Agents::default())
        .invoke_handler(tauri::generate_handler![
            agents::agent_spawn,
            agents::agent_send,
            agents::agent_close,
            agents::installed_commands,
            files::read_text,
            files::write_text,
            files::list_dirs,
            files::copy_path,
            files::remove_path,
            files::read_lines,
            presence::claude_presence,
            presence::codex_presence,
            presence::codex_rollout,
            pcb::pcb_project,
            pcb::pcb_read,
            pcb::pcb_files,
            pcb::pcb_derive,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<agents::Agents>().kill_all();
            }
        });
}
