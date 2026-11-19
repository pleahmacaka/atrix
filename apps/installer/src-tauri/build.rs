use std::env;
use std::fs;
use std::path::PathBuf;

const PACKAGE: &str = "../../../package.json";

fn version() -> String {
    println!("cargo:rerun-if-changed={PACKAGE}");

    let text = fs::read_to_string(PACKAGE).expect("read package.json");
    let json: serde_json::Value = serde_json::from_str(&text).expect("parse package.json");

    json["version"]
        .as_str()
        .expect("version in package.json")
        .to_string()
}

fn main() {
    println!("cargo:rerun-if-env-changed=ATRIX_PAYLOAD");

    let file = match env::var("CARGO_CFG_TARGET_OS").as_deref() {
        Ok("windows") => "atrix.exe",
        Ok("macos") => "atrix.app.tar.gz",
        _ => "atrix.AppImage",
    };
    let strict =
        env::var("PROFILE").as_deref() == Ok("release") || env::var_os("ATRIX_PAYLOAD").is_some();
    let path = env::var("ATRIX_PAYLOAD")
        .map_or_else(|_| PathBuf::from("payload"), PathBuf::from)
        .join(file);

    println!("cargo:rerun-if-changed={}", path.display());

    let payload = match path.canonicalize() {
        Ok(path) => format!("Some(include_bytes!({:?}))", path.display().to_string()),
        Err(_) if strict => panic!("missing installer payload {}", path.display()),
        Err(_) => "None".to_string(),
    };
    let code = format!(
        "pub static PAYLOAD: Option<&[u8]> = {payload};\n\npub const VERSION: &str = {:?};\n",
        version()
    );
    let out = PathBuf::from(env::var("OUT_DIR").unwrap()).join("payload.rs");

    fs::write(out, code).expect("write payload.rs");

    tauri_build::build()
}
