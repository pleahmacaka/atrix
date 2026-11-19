use tauri::State;

const HEADLESS: &str = "--headless";

const WEB: &str = "--web";

const PAIR: &str = "--pair";

const WEB_DEFAULT: &str = "127.0.0.1:1461";

#[cfg(windows)]
const USAGE_BRIDGE: &str = "--usage-bridge";

#[cfg(windows)]
const CHAIN: &str = "--chain";

pub struct Launch {
    pub headless: bool,
    pub web: Option<String>,
    pub pair: Option<String>,
}

fn value_after<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
    let at = args.iter().position(|arg| arg == flag)?;

    args.get(at + 1)
        .map(String::as_str)
        .filter(|value| !value.starts_with("--"))
}

fn web(args: &[String]) -> Option<String> {
    if !args.iter().any(|arg| arg == WEB) {
        return None;
    }

    Some(match value_after(args, WEB) {
        Some(address) if address.contains(':') => address.to_owned(),
        Some(port) => format!("127.0.0.1:{port}"),
        None => WEB_DEFAULT.to_owned(),
    })
}

pub fn pair_code(args: &[String]) -> Option<String> {
    value_after(args, PAIR).map(str::to_owned)
}

// a statusLine command and the installer hooks run the exe per call, so these exit before single-instance can forward them
#[cfg(windows)]
pub fn one_shot(args: &[String]) -> Option<i32> {
    if args.iter().any(|arg| arg == USAGE_BRIDGE) {
        crate::desktop::usage::bridge(value_after(args, CHAIN).map(str::to_owned));

        return Some(0);
    }

    tauri_plugin_atrix_files::default_app::cli(
        &crate::desktop::files::HOST,
        args.get(1..).unwrap_or_default(),
    )
}

impl Launch {
    pub fn parse(args: &[String]) -> Self {
        Self {
            headless: args.iter().any(|arg| arg == HEADLESS),
            web: web(args),
            pair: pair_code(args),
        }
    }
}

#[tauri::command]
pub fn headless(launch: State<'_, Launch>) -> bool {
    launch.headless
}

#[tauri::command]
pub fn startup_pair_code(launch: State<'_, Launch>) -> Option<String> {
    launch.pair.clone()
}
