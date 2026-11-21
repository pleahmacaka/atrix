use tauri::State;

const HEADLESS_FLAG: &str = "--headless";

const WEB_FLAG: &str = "--web";

const PAIR_FLAG: &str = "--pair";

const WEB_DEFAULT: &str = "127.0.0.1:1461";

pub struct Launch {
    pub headless: bool,
    pub web: Option<String>,
    pub pair: Option<String>,
}

impl Launch {
    pub fn parse(args: &[String]) -> Self {
        Self {
            headless: args.iter().any(|a| a == HEADLESS_FLAG),
            web: web_address(args),
            pair: pair_code(args),
        }
    }
}

fn after<'a>(args: &'a [String], flag: &str) -> Option<Option<&'a String>> {
    let at = args.iter().position(|a| a == flag)?;

    Some(args.get(at + 1).filter(|v| !v.starts_with("--")))
}

fn web_address(args: &[String]) -> Option<String> {
    Some(match after(args, WEB_FLAG)? {
        Some(v) if v.contains(':') => v.clone(),
        Some(port) => format!("127.0.0.1:{port}"),
        None => WEB_DEFAULT.to_string(),
    })
}

pub fn pair_code(args: &[String]) -> Option<String> {
    after(args, PAIR_FLAG).flatten().cloned()
}

#[tauri::command]
pub fn headless(launch: State<'_, Launch>) -> bool {
    launch.headless
}

#[tauri::command]
pub fn startup_pair_code(launch: State<'_, Launch>) -> Option<String> {
    launch.pair.clone()
}
