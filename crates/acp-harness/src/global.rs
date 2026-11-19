use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::compose::{McpServer, McpTransport};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Roots {
    pub home: PathBuf,

    pub project: Option<PathBuf>,
}

impl Roots {
    pub fn current(project: Option<PathBuf>) -> Option<Self> {
        Some(Self {
            home: std::env::home_dir()?,
            project,
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scope {
    User,
    Project,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Owner {
    Shared,
    Harness(&'static str),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Origin {
    pub owner: Owner,

    pub scope: Scope,

    pub path: PathBuf,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlobalSkill {
    pub name: String,

    pub dir: PathBuf,

    pub origin: Origin,
}

#[derive(Clone, Debug, PartialEq)]
pub struct GlobalTool {
    pub server: McpServer,

    pub origin: Origin,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Unreadable {
    pub path: PathBuf,

    pub error: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Discovered {
    pub skills: Vec<GlobalSkill>,

    pub tools: Vec<GlobalTool>,

    pub unreadable: Vec<Unreadable>,
}

#[derive(Clone, Copy)]
enum Bare {
    Http,
    Sse,
}

#[derive(Clone, Copy)]
enum Dialect {
    McpServers { key: &'static str, bare: Bare },
    Codex,
    OpenCode,
    Goose,
}

const SERVERS: Dialect = Dialect::McpServers {
    key: "mcpServers",
    bare: Bare::Http,
};

const GEMINI_SERVERS: Dialect = Dialect::McpServers {
    key: "mcpServers",
    bare: Bare::Sse,
};

const fn harness(id: &'static str) -> Owner {
    Owner::Harness(id)
}

const USER_SKILLS: &[(Owner, &str)] = &[
    (Owner::Shared, ".agents/skills"),
    (Owner::Shared, ".config/agents/skills"),
    (harness("claude-acp"), ".claude/skills"),
    (harness("codex-acp"), ".codex/skills"),
    (harness("gemini"), ".gemini/skills"),
    (harness("qwen-code"), ".qwen/skills"),
    (harness("opencode"), ".config/opencode/skills"),
    (harness("kilo"), ".config/kilo/skills"),
    (harness("goose"), ".config/goose/skills"),
    (harness("mistral-vibe"), ".vibe/skills"),
    (harness("github-copilot-cli"), ".copilot/skills"),
    (harness("cursor"), ".cursor/skills"),
    (harness("grok-build"), ".grok/skills"),
    (harness("amp-acp"), ".config/amp/skills"),
    (harness("auggie"), ".augment/skills"),
    (harness("kiro"), ".kiro/skills"),
    (harness("cline"), ".cline/skills"),
    (harness("junie"), ".junie/skills"),
    (harness("factory-droid"), ".factory/skills"),
    (harness("hermes-agent"), ".hermes/skills"),
    (harness("pi-acp"), ".pi/agent/skills"),
];

const PROJECT_SKILLS: &[(Owner, &str)] = &[
    (Owner::Shared, ".agents/skills"),
    (harness("claude-acp"), ".claude/skills"),
    (harness("codex-acp"), ".codex/skills"),
    (harness("gemini"), ".gemini/skills"),
    (harness("qwen-code"), ".qwen/skills"),
    (harness("opencode"), ".opencode/skills"),
    (harness("kilo"), ".kilo/skills"),
    (harness("goose"), ".goose/skills"),
    (harness("mistral-vibe"), ".vibe/skills"),
    (harness("kimi-code"), ".kimi-code/skills"),
    (harness("github-copilot-cli"), ".github/skills"),
    (harness("cursor"), ".cursor/skills"),
    (harness("grok-build"), ".grok/skills"),
    (harness("auggie"), ".augment/skills"),
    (harness("kiro"), ".kiro/skills"),
    (harness("cline"), ".cline/skills"),
    (harness("junie"), ".junie/skills"),
    (harness("factory-droid"), ".factory/skills"),
    (harness("pi-acp"), ".pi/skills"),
];

const USER_TOOLS: &[(Owner, &str, Dialect)] = &[
    (harness("claude-acp"), ".claude.json", SERVERS),
    (harness("codex-acp"), ".codex/config.toml", Dialect::Codex),
    (harness("gemini"), ".gemini/settings.json", GEMINI_SERVERS),
    (harness("qwen-code"), ".qwen/settings.json", GEMINI_SERVERS),
    (
        harness("opencode"),
        ".config/opencode/opencode.json",
        Dialect::OpenCode,
    ),
    (
        harness("goose"),
        ".config/goose/config.yaml",
        Dialect::Goose,
    ),
    (
        harness("goose"),
        "AppData/Roaming/Block/goose/config/config.yaml",
        Dialect::Goose,
    ),
    (
        harness("github-copilot-cli"),
        ".copilot/mcp-config.json",
        SERVERS,
    ),
    (harness("cursor"), ".cursor/mcp.json", SERVERS),
    (harness("kiro"), ".kiro/settings/mcp.json", SERVERS),
    (harness("junie"), ".junie/mcp/mcp.json", SERVERS),
    (harness("factory-droid"), ".factory/mcp.json", SERVERS),
    (harness("pi-acp"), ".pi/agent/mcp.json", SERVERS),
    (harness("grok-build"), ".grok/config.toml", Dialect::Codex),
    (
        harness("amp-acp"),
        ".config/amp/settings.json",
        Dialect::McpServers {
            key: "amp.mcpServers",
            bare: Bare::Http,
        },
    ),
];

const PROJECT_TOOLS: &[(Owner, &str, Dialect)] = &[
    (harness("claude-acp"), ".mcp.json", SERVERS),
    (harness("gemini"), ".gemini/settings.json", GEMINI_SERVERS),
    (harness("qwen-code"), ".qwen/settings.json", GEMINI_SERVERS),
    (harness("cursor"), ".cursor/mcp.json", SERVERS),
    (harness("kiro"), ".kiro/settings/mcp.json", SERVERS),
    (harness("junie"), ".junie/mcp/mcp.json", SERVERS),
    (harness("factory-droid"), ".factory/mcp.json", SERVERS),
    (harness("pi-acp"), ".pi/mcp.json", SERVERS),
];

pub fn discover(roots: &Roots) -> Discovered {
    let mut found = Discovered::default();
    let project = roots.project.as_deref();

    for (root, scope, table) in [
        (Some(roots.home.as_path()), Scope::User, USER_SKILLS),
        (project, Scope::Project, PROJECT_SKILLS),
    ] {
        let Some(root) = root else { continue };

        for (owner, rel) in table {
            let origin = Origin {
                owner: *owner,
                scope,
                path: root.join(rel),
            };

            found.skills.extend(skills_in(origin));
        }
    }

    for (root, scope, table) in [
        (Some(roots.home.as_path()), Scope::User, USER_TOOLS),
        (project, Scope::Project, PROJECT_TOOLS),
    ] {
        let Some(root) = root else { continue };

        for (owner, rel, dialect) in table {
            let origin = Origin {
                owner: *owner,
                scope,
                path: root.join(rel),
            };

            match read(&origin.path, *dialect) {
                Ok(Some(doc)) => {
                    found
                        .tools
                        .extend(
                            servers(&doc, *dialect)
                                .into_iter()
                                .map(|server| GlobalTool {
                                    server,
                                    origin: origin.clone(),
                                }),
                        )
                }
                Ok(None) => {}
                Err(error) => found.unreadable.push(Unreadable {
                    path: origin.path,
                    error,
                }),
            }
        }
    }

    found
}

fn skills_in(origin: Origin) -> Vec<GlobalSkill> {
    let Ok(entries) = fs::read_dir(&origin.path) else {
        return Vec::new();
    };

    let mut skills: Vec<GlobalSkill> = entries
        .flatten()
        .filter(|e| e.path().join("SKILL.md").is_file())
        .filter_map(|e| {
            Some(GlobalSkill {
                name: e.file_name().into_string().ok()?,
                dir: e.path(),
                origin: origin.clone(),
            })
        })
        .collect();

    skills.sort_by(|a, b| a.name.cmp(&b.name));

    skills
}

fn read(path: &Path, dialect: Dialect) -> Result<Option<Value>, String> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };

    let doc = match dialect {
        Dialect::Codex => toml::from_str::<Value>(&text).map_err(|e| e.to_string())?,
        Dialect::Goose => serde_saphyr::from_str::<Value>(&text).map_err(|e| e.to_string())?,
        Dialect::McpServers { .. } | Dialect::OpenCode => {
            serde_json::from_str::<Value>(&text).map_err(|e| e.to_string())?
        }
    };

    Ok(Some(doc))
}

fn servers(doc: &Value, dialect: Dialect) -> Vec<McpServer> {
    let entries = match dialect {
        Dialect::McpServers { key, .. } => doc.get(key),
        Dialect::Codex => doc.get("mcp_servers"),
        Dialect::OpenCode => doc.get("mcp").map(|mcp| mcp.get("servers").unwrap_or(mcp)),
        Dialect::Goose => doc.get("extensions"),
    };

    let Some(Value::Object(entries)) = entries else {
        return Vec::new();
    };

    entries
        .iter()
        .filter(|(_, entry)| enabled(entry))
        .filter_map(|(name, entry)| {
            let transport = match dialect {
                Dialect::McpServers { bare, .. } => standard(entry, bare),
                Dialect::Codex => codex(entry),
                Dialect::OpenCode => opencode(entry),
                Dialect::Goose => goose(entry),
            }?;

            Some(McpServer {
                name: name.clone(),
                transport,
            })
        })
        .collect()
}

fn enabled(entry: &Value) -> bool {
    let off = |key: &str, value: bool| entry.get(key).and_then(Value::as_bool) == Some(value);

    !off("disabled", true) && !off("enabled", false)
}

fn text(entry: &Value, key: &str) -> Option<String> {
    entry.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn list(entry: &Value, key: &str) -> Vec<String> {
    entry
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn map(entry: &Value, key: &str) -> BTreeMap<String, String> {
    entry
        .get(key)
        .and_then(Value::as_object)
        .map(|items| {
            items
                .iter()
                .filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_owned())))
                .collect()
        })
        .unwrap_or_default()
}

fn stdio(command: String, args: Vec<String>, env: BTreeMap<String, String>) -> McpTransport {
    McpTransport::Stdio { command, args, env }
}

fn standard(entry: &Value, bare: Bare) -> Option<McpTransport> {
    let headers = map(entry, "headers");
    let url = text(entry, "url");
    let http_url = text(entry, "httpUrl");
    let has_command = entry.get("command").is_some();

    match entry.get("type").and_then(Value::as_str) {
        Some("stdio" | "local") => standard_stdio(entry),
        None if has_command => standard_stdio(entry),
        Some("http" | "streamable-http" | "streamableHttp" | "streamable_http") => {
            Some(McpTransport::Http {
                url: url.or(http_url)?,
                headers,
            })
        }
        Some("sse") => Some(McpTransport::Sse { url: url?, headers }),
        Some(_) => None,
        None => match (http_url, url, bare) {
            (Some(url), _, _) | (None, Some(url), Bare::Http) => {
                Some(McpTransport::Http { url, headers })
            }
            (None, Some(url), Bare::Sse) => Some(McpTransport::Sse { url, headers }),
            (None, None, _) => None,
        },
    }
}

fn standard_stdio(entry: &Value) -> Option<McpTransport> {
    Some(stdio(
        text(entry, "command")?,
        list(entry, "args"),
        map(entry, "env"),
    ))
}

fn codex(entry: &Value) -> Option<McpTransport> {
    if let Some(command) = text(entry, "command") {
        return Some(stdio(command, list(entry, "args"), map(entry, "env")));
    }

    let mut headers = map(entry, "http_headers");
    let token = text(entry, "bearer_token_env_var").and_then(|var| std::env::var(var).ok());

    if let Some(token) = token {
        headers.insert("Authorization".to_owned(), format!("Bearer {token}"));
    }

    Some(McpTransport::Http {
        url: text(entry, "url")?,
        headers,
    })
}

fn opencode(entry: &Value) -> Option<McpTransport> {
    match entry.get("type").and_then(Value::as_str)? {
        "local" => {
            let mut command = list(entry, "command").into_iter();

            Some(stdio(
                command.next()?,
                command.collect(),
                map(entry, "environment"),
            ))
        }
        "remote" => Some(McpTransport::Http {
            url: text(entry, "url")?,
            headers: map(entry, "headers"),
        }),
        _ => None,
    }
}

fn goose(entry: &Value) -> Option<McpTransport> {
    let headers = map(entry, "headers");

    match entry.get("type").and_then(Value::as_str)? {
        "stdio" => Some(stdio(
            text(entry, "cmd")?,
            list(entry, "args"),
            map(entry, "envs"),
        )),
        "streamable_http" => Some(McpTransport::Http {
            url: text(entry, "uri")?,
            headers,
        }),
        "sse" => Some(McpTransport::Sse {
            url: text(entry, "uri")?,
            headers,
        }),
        _ => None,
    }
}
