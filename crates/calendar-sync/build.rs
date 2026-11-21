const COMMANDS: &[&str] = &[
    "ensure",
    "rows",
    "apply",
    "request_permissions",
    "check_permissions",
    "register_listener",
    "remove_listener",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
