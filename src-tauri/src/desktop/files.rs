use tauri_plugin_atrix_files::Host;

pub const HOST: Host = Host {
    main_route: "/shell/files",
    viewer_route: "/shell/files/viewer",
    marker: Some("--files"),
    app_name: "Atrix",
    prog_prefix: "Atrix",
    peers: Some(crate::net::paired),
};

#[cfg(windows)]
pub fn open_instead(app: &tauri::AppHandle, reveal: Option<String>) -> bool {
    let select = reveal.is_some();

    tauri_plugin_atrix_files::takes_over() && tauri_plugin_atrix_files::show(app, reveal, select)
}
