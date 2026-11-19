use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::adapters::ModelSelect;
use crate::compose::{McpServer, McpTransport};

#[derive(Clone, Debug, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AgentCapabilities {
    pub mcp_capabilities: McpCapabilities,

    pub session_capabilities: SessionCapabilities,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize)]
#[serde(default)]
pub struct McpCapabilities {
    pub http: bool,

    pub sse: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionCapabilities {
    pub additional_directories: Option<Value>,

    pub system_prompt: Option<Value>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Skipped {
    pub item: Item,

    pub reason: Reason,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Item {
    Skill(String),
    Tool(String),
    Instructions,
    AdditionalDirectories,
    Model,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reason {
    Unsupported,
    Unknown,
    NoIsolatedHome,
    NeedsOsHomeIsolation,
    TransportFailsSession,
    TransportUnsupported,
    NotAdvertised,
    CommandNotFound,
    BatchCommand,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Gate {
    Always,
    Advertised,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModelChoice {
    pub select: ModelSelect,

    pub value: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct SessionPlan {
    pub(crate) servers: Vec<(McpServer, Gate)>,

    pub(crate) system_prompt: Option<String>,

    pub(crate) additional_directories: Vec<PathBuf>,

    pub(crate) meta: Map<String, Value>,

    pub(crate) model: Option<ModelChoice>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct SessionParams {
    pub mcp_servers: Vec<McpServer>,

    pub system_prompt: Option<String>,

    pub additional_directories: Vec<PathBuf>,

    pub meta: Map<String, Value>,

    pub model: Option<ModelChoice>,

    pub skipped: Vec<Skipped>,
}

impl SessionPlan {
    pub fn params(&self, caps: &AgentCapabilities) -> SessionParams {
        let mcp = caps.mcp_capabilities;
        let sessions = &caps.session_capabilities;
        let mut params = SessionParams {
            meta: self.meta.clone(),
            model: self.model.clone(),
            ..SessionParams::default()
        };

        for (server, gate) in &self.servers {
            let advertised = match server.transport {
                McpTransport::Stdio { .. } => true,
                McpTransport::Http { .. } => mcp.http,
                McpTransport::Sse { .. } => mcp.sse,
            };

            if *gate == Gate::Always || advertised {
                params.mcp_servers.push(server.clone());
            } else {
                params
                    .skipped
                    .push(not_advertised(Item::Tool(server.name.clone())));
            }
        }

        if let Some(text) = &self.system_prompt {
            if sessions.system_prompt.is_some() {
                params.system_prompt = Some(text.clone());
            } else {
                params.skipped.push(not_advertised(Item::Instructions));
            }
        }

        if !self.additional_directories.is_empty() {
            if sessions.additional_directories.is_some() {
                params.additional_directories = self.additional_directories.clone();
            } else {
                params
                    .skipped
                    .push(not_advertised(Item::AdditionalDirectories));
            }
        }

        params
    }
}

fn not_advertised(item: Item) -> Skipped {
    Skipped {
        item,
        reason: Reason::NotAdvertised,
    }
}

impl SessionParams {
    pub fn new_session(&self, cwd: &Path) -> Value {
        let mut params = json!({
            "cwd": cwd,
            "mcpServers": self.mcp_servers.iter().map(McpServer::acp).collect::<Vec<_>>(),
        });

        if !self.additional_directories.is_empty() {
            params["additionalDirectories"] = json!(self.additional_directories);
        }

        if let Some(text) = &self.system_prompt {
            params["systemPrompt"] = json!({
                "mode": "append",
                "content": [{ "type": "text", "text": text }],
            });
        }

        if !self.meta.is_empty() {
            params["_meta"] = Value::Object(self.meta.clone());
        }

        params
    }

    pub fn set_model(&self, session_id: &str, config_options: &[Value]) -> Option<Value> {
        let choice = self.model.as_ref()?;
        let config_id = match choice.select {
            ModelSelect::ConfigOption(id) => id.to_owned(),
            ModelSelect::ConfigCategory => config_options
                .iter()
                .find(|o| o.get("category").and_then(Value::as_str) == Some("model"))?
                .get("id")?
                .as_str()?
                .to_owned(),
        };

        Some(json!({
            "sessionId": session_id,
            "configId": config_id,
            "value": choice.value,
        }))
    }
}
