use tauri::AppHandle;
use tauri_plugin_atrix_files::Host;

pub const HOST: Host = Host {
    main_route: "/files",
    viewer_route: "/files/viewer",
    menu_route: "/files/menu",
    marker: Some("--files"),
    app_name: "Atrix",
    prog_prefix: "Atrix",
    peers: Some(atrix_p2p::members),
};

pub fn open_instead(app: &AppHandle, reveal: Option<String>) -> bool {
    let select = reveal.is_some();

    tauri_plugin_atrix_files::takes_over() && tauri_plugin_atrix_files::show(app, reveal, select)
}
