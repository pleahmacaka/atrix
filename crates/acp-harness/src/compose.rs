use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::global::{GlobalSkill, GlobalTool};
use crate::provider::Provider;

#[derive(Clone, Debug, Default)]
pub struct Composition {
    pub harness: String,

    pub cwd: PathBuf,

    pub isolation: Isolation,

    pub carry: bool,

    pub provider: Option<Provider>,

    pub model: Option<String>,

    pub skills: Vec<SkillSource>,

    pub tools: Vec<ToolSource>,

    pub instructions: Option<String>,

    pub additional_dirs: Vec<PathBuf>,
}

impl Composition {
    pub fn new(harness: impl Into<String>, cwd: impl Into<PathBuf>) -> Self {
        Self {
            harness: harness.into(),
            cwd: cwd.into(),
            ..Self::default()
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Isolation {
    #[default]
    ConfigHome,
    ConfigAndOsHome,
    Native,
}

#[derive(Clone, Debug)]
pub enum SkillSource {
    Owned(OwnedSkill),
    Imported(GlobalSkill),
}

impl SkillSource {
    pub fn name(&self) -> &str {
        match self {
            SkillSource::Owned(s) => &s.name,
            SkillSource::Imported(s) => &s.name,
        }
    }
}

#[derive(Clone, Debug)]
pub struct OwnedSkill {
    pub name: String,

    pub body: SkillBody,
}

#[derive(Clone, Debug)]
pub enum SkillBody {
    Markdown(String),
    Dir(PathBuf),
}

#[derive(Clone, Debug)]
pub enum ToolSource {
    Owned(McpServer),
    Imported(GlobalTool),
}

impl ToolSource {
    pub fn server(&self) -> &McpServer {
        match self {
            ToolSource::Owned(s) => s,
            ToolSource::Imported(t) => &t.server,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct McpServer {
    pub name: String,

    pub transport: McpTransport,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum McpTransport {
    Stdio {
        command: String,
        args: Vec<String>,
        env: BTreeMap<String, String>,
    },
    Http {
        url: String,
        headers: BTreeMap<String, String>,
    },
    Sse {
        url: String,
        headers: BTreeMap<String, String>,
    },
}

impl McpServer {
    pub fn acp(&self) -> Value {
        let pairs = |map: &BTreeMap<String, String>| -> Vec<Value> {
            map.iter()
                .map(|(name, value)| json!({ "name": name, "value": expand(value) }))
                .collect()
        };

        match &self.transport {
            McpTransport::Stdio { command, args, env } => json!({
                "name": self.name,
                "command": command,
                "args": args,
                "env": pairs(env),
            }),
            McpTransport::Http { url, headers } => json!({
                "type": "http",
                "name": self.name,
                "url": url,
                "headers": pairs(headers),
            }),
            McpTransport::Sse { url, headers } => json!({
                "type": "sse",
                "name": self.name,
                "url": url,
                "headers": pairs(headers),
            }),
        }
    }
}

fn expand(value: &str) -> String {
    let mut out = String::new();
    let mut rest = value;

    while let Some((before, after)) = rest.split_once("${") {
        out.push_str(before);

        match after.split_once('}').filter(|(name, _)| env_name(name)) {
            Some((name, tail)) => {
                out.push_str(&std::env::var(name).unwrap_or_default());
                rest = tail;
            }
            None => {
                out.push_str("${");
                rest = after;
            }
        }
    }

    out.push_str(rest);

    out
}

fn env_name(name: &str) -> bool {
    !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}
