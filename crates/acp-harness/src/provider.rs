use std::collections::BTreeMap;
use std::fmt;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use crate::{Error, Result};

pub const KEY_ENV: &str = "ACP_HARNESS_API_KEY";

const ID: &str = "custom";

const KEYLESS: &str = "unused";

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Secret(String);

impl Secret {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Secret(..)")
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WireApi {
    OpenAiChat,
    OpenAiResponses,
    AnthropicMessages,
    GoogleGenAi,
}

impl WireApi {
    pub const ALL: [WireApi; 4] = [
        WireApi::OpenAiChat,
        WireApi::OpenAiResponses,
        WireApi::AnthropicMessages,
        WireApi::GoogleGenAi,
    ];
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub wire: WireApi,

    pub base_url: String,

    #[serde(default)]
    pub key: Option<Secret>,

    #[serde(default)]
    pub headers: BTreeMap<String, String>,

    #[serde(default)]
    pub context_window: Option<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProviderSupport {
    Mapped(Mapping),
    VendorLocked,
    GlobalConfigOnly,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mapping {
    Claude,
    Codex,
    Gemini,
    Qwen,
    OpenCode,
    Kilo,
    Goose,
    Vibe,
    KimiCode,
    Copilot,
    Grok,
    Junie,
    OpenHands,
    Hermes,
    Pi,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FileKind {
    Plain,
    OwnerOnlySecret,
}

#[derive(Clone, Debug, PartialEq)]
pub struct HomeFile {
    pub path: PathBuf,

    pub contents: String,

    pub kind: FileKind,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ProviderPlan {
    pub env: BTreeMap<String, String>,

    pub secret_env: BTreeMap<String, Secret>,

    pub args: Vec<String>,

    pub files: Vec<HomeFile>,
}

impl ProviderPlan {
    fn set(&mut self, name: &str, value: impl Into<String>) {
        self.env.insert(name.to_owned(), value.into());
    }

    fn secret(&mut self, name: &str, value: Secret) {
        self.secret_env.insert(name.to_owned(), value);
    }

    fn set_maybe_secret(&mut self, name: &str, value: String, secret: bool) {
        if secret {
            self.secret(name, Secret::new(value));
        } else {
            self.set(name, value);
        }
    }

    fn file(&mut self, path: &str, contents: String, kind: FileKind) {
        self.files.push(HomeFile {
            path: PathBuf::from(path),
            contents,
            kind,
        });
    }
}

impl Mapping {
    pub fn wires(self) -> Vec<WireApi> {
        WireApi::ALL
            .into_iter()
            .filter(|w| self.dialect(*w).is_some())
            .collect()
    }

    pub fn carries_headers(self) -> bool {
        matches!(
            self,
            Mapping::Claude
                | Mapping::Codex
                | Mapping::OpenCode
                | Mapping::Kilo
                | Mapping::Grok
                | Mapping::Junie
                | Mapping::Pi
        )
    }

    fn dialect(self, wire: WireApi) -> Option<&'static str> {
        use Mapping as M;
        use WireApi as W;

        let name = match (self, wire) {
            (M::Claude, W::AnthropicMessages) => "anthropic",
            (M::Codex, W::OpenAiResponses) => "responses",
            (M::Gemini, W::GoogleGenAi) => "gemini-api-key",
            (M::Qwen, W::OpenAiChat) => "openai",
            (M::Qwen, W::OpenAiResponses) => "openai-responses",
            (M::Qwen, W::AnthropicMessages) => "anthropic",
            (M::OpenCode, W::OpenAiChat) => "@opencode/ai/providers/openai-compatible",
            (M::OpenCode, W::OpenAiResponses) => {
                "@opencode/ai/providers/openai-compatible/responses"
            }
            (M::OpenCode, W::AnthropicMessages) => "@opencode/ai/providers/anthropic-compatible",
            (M::Kilo, W::OpenAiChat) => "@ai-sdk/openai-compatible",
            (M::Kilo, W::OpenAiResponses) => "@ai-sdk/openai",
            (M::Kilo, W::AnthropicMessages) => "@ai-sdk/anthropic",
            (M::Goose, W::OpenAiChat) => "openai",
            (M::Vibe, W::OpenAiChat) => "openai",
            (M::Vibe, W::OpenAiResponses) => "openai-responses",
            (M::Vibe, W::AnthropicMessages) => "anthropic",
            (M::KimiCode, W::OpenAiChat) => "openai",
            (M::KimiCode, W::OpenAiResponses) => "openai_responses",
            (M::KimiCode, W::AnthropicMessages) => "anthropic",
            (M::Copilot, W::OpenAiChat) => "openai",
            (M::Copilot, W::AnthropicMessages) => "anthropic",
            (M::Grok, W::OpenAiChat) => "chat_completions",
            (M::Grok, W::OpenAiResponses) => "responses",
            (M::Grok, W::AnthropicMessages) => "messages",
            (M::Junie, W::OpenAiChat) => "OpenAICompletion",
            (M::Junie, W::OpenAiResponses) => "OpenAIResponses",
            (M::OpenHands, W::OpenAiChat) => "openai",
            (M::OpenHands, W::AnthropicMessages) => "anthropic",
            (M::Hermes, W::OpenAiChat) => "custom",
            (M::Pi, W::OpenAiChat) => "openai-completions",
            (M::Pi, W::OpenAiResponses) => "openai-responses",
            (M::Pi, W::AnthropicMessages) => "anthropic-messages",
            (M::Pi, W::GoogleGenAi) => "google-generative-ai",
            _ => return None,
        };

        Some(name)
    }

    pub fn plan(self, provider: &Provider, model: &str) -> Result<ProviderPlan> {
        let wire = provider.wire;
        let dialect = self.dialect(wire).ok_or(Error::Wire {
            mapping: self,
            wire,
        })?;

        if !provider.headers.is_empty() && !self.carries_headers() {
            return Err(Error::Headers(self));
        }

        let mut plan = ProviderPlan::default();
        let target = Target {
            provider,
            model,
            dialect,
        };

        match self {
            Mapping::Claude => claude(&mut plan, &target),
            Mapping::Codex => codex(&mut plan, &target),
            Mapping::Gemini => gemini(&mut plan, &target)?,
            Mapping::Qwen => qwen(&mut plan, &target),
            Mapping::OpenCode => opencode(&mut plan, &target),
            Mapping::Kilo => kilo(&mut plan, &target),
            Mapping::Goose => goose(&mut plan, &target)?,
            Mapping::Vibe => vibe(&mut plan, &target)?,
            Mapping::KimiCode => kimi_code(&mut plan, &target),
            Mapping::Copilot => copilot(&mut plan, &target),
            Mapping::Grok => grok(&mut plan, &target)?,
            Mapping::Junie => junie(&mut plan, &target)?,
            Mapping::OpenHands => openhands(&mut plan, &target),
            Mapping::Hermes => hermes(&mut plan, &target)?,
            Mapping::Pi => pi(&mut plan, &target)?,
        }

        Ok(plan)
    }
}

struct Target<'a> {
    provider: &'a Provider,

    model: &'a str,

    dialect: &'static str,
}

impl Target<'_> {
    fn base(&self) -> &str {
        self.provider.base_url.trim_end_matches('/')
    }

    fn key(&self) -> Secret {
        self.provider
            .key
            .clone()
            .unwrap_or_else(|| Secret::new(KEYLESS))
    }

    fn has_headers(&self) -> bool {
        !self.provider.headers.is_empty()
    }

    fn headers(&self) -> Value {
        json!(self.provider.headers)
    }

    fn file_kind(&self) -> FileKind {
        if self.has_headers() {
            FileKind::OwnerOnlySecret
        } else {
            FileKind::Plain
        }
    }
}

fn keyed(key: &str, value: Value) -> Value {
    Value::Object(Map::from_iter([(key.to_owned(), value)]))
}

fn pretty(value: &Value) -> Result<String> {
    Ok(serde_json::to_string_pretty(value)?)
}

fn claude(plan: &mut ProviderPlan, t: &Target) {
    plan.set("ANTHROPIC_BASE_URL", t.base());
    // an inherited ANTHROPIC_API_KEY would otherwise be sent instead of the gateway token
    plan.set("ANTHROPIC_API_KEY", "");

    for var in [
        "ANTHROPIC_MODEL",
        "ANTHROPIC_DEFAULT_OPUS_MODEL",
        "ANTHROPIC_DEFAULT_SONNET_MODEL",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    ] {
        plan.set(var, t.model);
    }

    plan.secret("ANTHROPIC_AUTH_TOKEN", t.key());

    if t.has_headers() {
        let lines: Vec<String> = t
            .provider
            .headers
            .iter()
            .map(|(name, value)| format!("{name}: {value}"))
            .collect();

        plan.secret("ANTHROPIC_CUSTOM_HEADERS", Secret::new(lines.join("\n")));
    }
}

fn codex(plan: &mut ProviderPlan, t: &Target) {
    let mut provider = json!({
        "name": "Custom",
        "base_url": t.base(),
        "env_key": KEY_ENV,
        "wire_api": t.dialect,
    });

    if t.has_headers() {
        provider["http_headers"] = t.headers();
    }

    let config = json!({
        "model": t.model,
        "model_providers": keyed(ID, provider),
    });

    plan.set("MODEL_PROVIDER", ID);
    plan.set_maybe_secret("CODEX_CONFIG", config.to_string(), t.has_headers());
    plan.secret(KEY_ENV, t.key());
}

fn gemini(plan: &mut ProviderPlan, t: &Target) -> Result<()> {
    let settings = json!({ "security": { "auth": { "selectedType": t.dialect } } });

    plan.set("GOOGLE_GEMINI_BASE_URL", t.base());
    plan.set("GEMINI_MODEL", t.model);
    plan.secret("GEMINI_API_KEY", t.key());
    plan.file("settings.json", pretty(&settings)?, FileKind::Plain);

    Ok(())
}

fn qwen(plan: &mut ProviderPlan, t: &Target) {
    let prefix = match t.provider.wire {
        WireApi::AnthropicMessages => "ANTHROPIC",
        _ => "OPENAI",
    };

    plan.args = vec!["--auth-type".to_owned(), t.dialect.to_owned()];
    plan.set(&format!("{prefix}_BASE_URL"), t.base());
    plan.set(&format!("{prefix}_MODEL"), t.model);
    plan.secret(&format!("{prefix}_API_KEY"), t.key());
}

fn opencode(plan: &mut ProviderPlan, t: &Target) {
    let mut settings = json!({
        "baseURL": t.base(),
        "apiKey": format!("{{env:{KEY_ENV}}}"),
    });

    if t.has_headers() {
        settings["headers"] = t.headers();
    }

    let provider = json!({
        "package": t.dialect,
        "settings": settings,
        "models": keyed(t.model, json!({})),
    });
    let config = json!({
        "model": format!("{ID}/{}", t.model),
        "providers": keyed(ID, provider),
    });

    plan.set_maybe_secret(
        "OPENCODE_CONFIG_CONTENT",
        config.to_string(),
        t.has_headers(),
    );
    plan.secret(KEY_ENV, t.key());
}

fn kilo(plan: &mut ProviderPlan, t: &Target) {
    let mut options = json!({
        "baseURL": t.base(),
        "apiKey": t.key().expose(),
    });

    if t.has_headers() {
        options["headers"] = t.headers();
    }

    let provider = json!({
        "npm": t.dialect,
        "options": options,
        "models": keyed(t.model, json!({})),
    });
    let config = json!({
        "model": format!("{ID}/{}", t.model),
        "provider": keyed(ID, provider),
    });

    // {env:} references resolve only in trusted config, so the key travels inline
    plan.secret("KILO_CONFIG_CONTENT", Secret::new(config.to_string()));
}

fn goose(plan: &mut ProviderPlan, t: &Target) -> Result<()> {
    let mut model = json!({ "name": t.model });

    if let Some(limit) = t.provider.context_window {
        model["context_limit"] = json!(limit);
    }

    let provider = json!({
        "name": ID,
        "engine": t.dialect,
        "display_name": "Custom",
        "base_url": format!("{}/chat/completions", t.base()),
        "api_key_env": KEY_ENV,
        "requires_auth": t.provider.key.is_some(),
        "supports_streaming": true,
        "models": [model],
    });

    plan.set("GOOSE_PROVIDER", ID);
    plan.set("GOOSE_MODEL", t.model);
    plan.secret(KEY_ENV, t.key());
    plan.file(
        "custom_providers/custom.json",
        pretty(&provider)?,
        FileKind::Plain,
    );

    Ok(())
}

fn vibe(plan: &mut ProviderPlan, t: &Target) -> Result<()> {
    let config = json!({
        "active_model": t.model,
        "enable_telemetry": false,
        "experiments": { "enable": false },
        "providers": [{
            "name": ID,
            "api_base": t.base(),
            "api_key_env_var": KEY_ENV,
            "api_style": t.dialect,
            "backend": "generic",
        }],
        "models": [{
            "name": t.model,
            "provider": ID,
            "alias": t.model,
        }],
    });

    plan.secret(KEY_ENV, t.key());
    plan.file("config.toml", toml::to_string(&config)?, FileKind::Plain);

    Ok(())
}

fn kimi_code(plan: &mut ProviderPlan, t: &Target) {
    plan.set("KIMI_MODEL_PROVIDER_TYPE", t.dialect);
    plan.set("KIMI_MODEL_BASE_URL", t.base());
    plan.set("KIMI_MODEL_NAME", t.model);
    plan.secret("KIMI_MODEL_API_KEY", t.key());
}

fn copilot(plan: &mut ProviderPlan, t: &Target) {
    plan.set("COPILOT_PROVIDER_TYPE", t.dialect);
    plan.set("COPILOT_PROVIDER_BASE_URL", t.base());
    plan.set("COPILOT_MODEL", t.model);
    plan.secret("COPILOT_PROVIDER_API_KEY", t.key());
}

fn grok(plan: &mut ProviderPlan, t: &Target) -> Result<()> {
    let mut entry = json!({
        "model": t.model,
        "base_url": t.base(),
        "api_backend": t.dialect,
        "env_key": KEY_ENV,
    });

    if t.has_headers() {
        entry["extra_headers"] = t.headers();
    }

    let config = json!({
        "models": { "default": ID },
        "model": keyed(ID, entry),
    });

    plan.secret(KEY_ENV, t.key());
    plan.file("config.toml", toml::to_string(&config)?, t.file_kind());

    Ok(())
}

fn junie(plan: &mut ProviderPlan, t: &Target) -> Result<()> {
    let endpoint = match t.provider.wire {
        WireApi::OpenAiResponses => "responses",
        _ => "chat/completions",
    };
    let mut model = json!({
        "id": t.model,
        "baseUrl": format!("{}/{endpoint}", t.base()),
        "apiType": t.dialect,
        "apiKey": format!("${{{KEY_ENV}}}"),
    });

    if let Some(limit) = t.provider.context_window {
        model["maxContextLength"] = json!(limit);
    }

    if t.has_headers() {
        model["extraHeaders"] = t.headers();
    }

    plan.args = vec!["--model".to_owned(), format!("custom:{ID}")];
    plan.secret(KEY_ENV, t.key());
    plan.file("models/custom.json", pretty(&model)?, t.file_kind());

    Ok(())
}

fn openhands(plan: &mut ProviderPlan, t: &Target) {
    plan.set("LLM_MODEL", format!("{}/{}", t.dialect, t.model));
    plan.set("LLM_BASE_URL", t.base());
    plan.secret("LLM_API_KEY", t.key());
}

fn hermes(plan: &mut ProviderPlan, t: &Target) -> Result<()> {
    let config = json!({
        "model": {
            "provider": t.dialect,
            "base_url": t.base(),
            "key_env": KEY_ENV,
            "default": t.model,
        },
    });
    let yaml = serde_saphyr::to_string(&config).map_err(|e| Error::Yaml(e.to_string()))?;

    plan.secret(KEY_ENV, t.key());
    plan.file("config.yaml", yaml, FileKind::Plain);

    Ok(())
}

fn pi(plan: &mut ProviderPlan, t: &Target) -> Result<()> {
    let mut model = json!({ "id": t.model });

    if let Some(limit) = t.provider.context_window {
        model["contextWindow"] = json!(limit);
    }

    let mut provider = json!({
        "baseUrl": t.base(),
        "api": t.dialect,
        "apiKey": format!("${KEY_ENV}"),
        "models": [model],
    });

    if t.has_headers() {
        provider["headers"] = t.headers();
    }

    let models = json!({ "providers": keyed(ID, provider) });
    let settings = json!({
        "defaultProvider": ID,
        "defaultModel": t.model,
        "quietStartup": true,
    });

    plan.secret(KEY_ENV, t.key());
    plan.file("models.json", pretty(&models)?, t.file_kind());
    plan.file("settings.json", pretty(&settings)?, FileKind::Plain);

    Ok(())
}
