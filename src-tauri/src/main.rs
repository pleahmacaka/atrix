// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().nth(1).as_deref() == Some(atrix_lib::MCP_STDIO_FLAG) {
        return atrix_lib::mcp_stdio();
    }

    atrix_lib::run();
}
