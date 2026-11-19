use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use acp_harness::Error;
use acp_harness::compose::{
    Composition, Isolation, McpServer, McpTransport, OwnedSkill, SkillBody, SkillSource, ToolSource,
};
use acp_harness::global::{GlobalSkill, Origin, Owner, Scope};
use acp_harness::install::Invocation;
use acp_harness::materialize::{Prepared, materialize};
use acp_harness::provider::{KEY_ENV, Provider, Secret, WireApi};
use acp_harness::session::{AgentCapabilities, Item, Reason, Skipped};
use serde_json::{Value, json};
use tempfile::TempDir;

fn run() -> Invocation {
    Invocation {
        command: PathBuf::from("agent"),
        args: vec!["acp".to_owned()],
        env: BTreeMap::new(),
    }
}

fn skill(name: &str) -> SkillSource {
    SkillSource::Owned(OwnedSkill {
        name: name.to_owned(),
        body: SkillBody::Markdown(format!("---\nname: {name}\n---\n")),
    })
}

fn stdio(name: &str) -> ToolSource {
    ToolSource::Owned(McpServer {
        name: name.to_owned(),
        transport: McpTransport::Stdio {
            command: "tool".to_owned(),
            args: Vec::new(),
            env: BTreeMap::new(),
        },
    })
}

fn remote(name: &str, sse: bool) -> ToolSource {
    let url = format!("https://{name}.example/mcp");
    let headers = BTreeMap::new();

    ToolSource::Owned(McpServer {
        name: name.to_owned(),
        transport: if sse {
            McpTransport::Sse { url, headers }
        } else {
            McpTransport::Http { url, headers }
        },
    })
}

fn caps(value: Value) -> AgentCapabilities {
    serde_json::from_value(value).unwrap()
}

fn prepare(composition: &Composition, base: &TempDir) -> Prepared {
    materialize(composition, &run(), base.path()).unwrap()
}

fn read(base: &TempDir, rel: &str) -> String {
    fs::read_to_string(base.path().join(rel)).unwrap()
}

fn skipped(item: Item, reason: Reason) -> Skipped {
    Skipped { item, reason }
}

#[test]
fn claude_gets_home_skills_and_session_prompt() {
    let base = tempfile::tempdir().unwrap();
    let mut composition = Composition::new("claude-acp", "/work");

    composition.skills = vec![skill("review")];
    composition.tools = vec![remote("docs", false)];
    composition.instructions = Some("Be brief.".to_owned());

    let prepared = prepare(&composition, &base);
    let params = prepared.session.params(&caps(json!({
        "sessionCapabilities": { "systemPrompt": {} },
    })));
    let request = params.new_session(Path::new("/work"));

    assert_eq!(
        prepared.launch.env["CLAUDE_CONFIG_DIR"],
        base.path().to_string_lossy()
    );
    assert!(read(&base, "skills/review/SKILL.md").contains("name: review"));
    assert_eq!(request["systemPrompt"]["mode"], "append");
    assert_eq!(request["systemPrompt"]["content"][0]["text"], "Be brief.");
    assert_eq!(request["mcpServers"][0]["type"], "http");
    assert!(prepared.skipped.is_empty());
}

#[test]
fn pi_gets_mcp_file_provider_files_and_prompt_file() {
    let base = tempfile::tempdir().unwrap();
    let mut composition = Composition::new("pi-acp", "/work");

    composition.provider = Some(Provider {
        wire: WireApi::OpenAiChat,
        base_url: "http://localhost:11434/v1".to_owned(),
        key: Some(Secret::new("sk-local")),
        headers: BTreeMap::new(),
        context_window: None,
    });
    composition.model = Some("qwen3".to_owned());
    composition.tools = vec![stdio("files"), remote("events", true)];
    composition.instructions = Some("Be brief.".to_owned());

    let prepared = prepare(&composition, &base);
    let mcp: Value = serde_json::from_str(&read(&base, "mcp.json")).unwrap();

    assert_eq!(mcp["mcpServers"]["files"]["command"], "tool");
    assert!(mcp["mcpServers"].get("events").is_none());
    assert!(read(&base, "models.json").contains("$ACP_HARNESS_API_KEY"));
    assert_eq!(read(&base, "APPEND_SYSTEM.md"), "Be brief.");
    assert_eq!(prepared.launch.secret_env[KEY_ENV].expose(), "sk-local");
    assert_eq!(
        prepared.skipped,
        [skipped(
            Item::Tool("events".to_owned()),
            Reason::TransportUnsupported
        )]
    );
}

#[test]
fn opencode_drops_sse_and_isolates_through_xdg() {
    let base = tempfile::tempdir().unwrap();
    let mut composition = Composition::new("opencode", "/work");

    composition.tools = vec![remote("docs", false), remote("events", true)];
    composition.instructions = Some("Be brief.".to_owned());
    composition.model = Some("acme/m1".to_owned());

    let prepared = prepare(&composition, &base);
    let params = prepared.session.params(&AgentCapabilities::default());
    let set_model = params.set_model("s1", &[]).unwrap();

    assert_eq!(
        prepared.launch.env["XDG_CONFIG_HOME"],
        base.path().join("config").to_string_lossy()
    );
    assert_eq!(read(&base, "config/opencode/AGENTS.md"), "Be brief.");
    assert_eq!(params.mcp_servers.len(), 1);
    assert_eq!(set_model["configId"], "model");
    assert_eq!(set_model["value"], "acme/m1");
    assert_eq!(
        prepared.skipped,
        [skipped(
            Item::Tool("events".to_owned()),
            Reason::TransportFailsSession
        )]
    );
}

#[test]
fn cursor_skills_need_os_home_isolation() {
    let base = tempfile::tempdir().unwrap();
    let mut composition = Composition::new("cursor", "/work");

    composition.skills = vec![skill("review")];

    let shared = prepare(&composition, &base);

    assert_eq!(
        shared.skipped,
        [skipped(
            Item::Skill("review".to_owned()),
            Reason::NeedsOsHomeIsolation
        )]
    );

    composition.isolation = Isolation::ConfigAndOsHome;

    let isolated = prepare(&composition, &base);

    assert!(isolated.skipped.is_empty());
    assert!(base.path().join(".cursor/skills/review/SKILL.md").is_file());
    assert_eq!(isolated.launch.env["HOME"], base.path().to_string_lossy());
}

#[test]
fn imported_skills_are_copied_and_dropped_ones_removed() {
    let base = tempfile::tempdir().unwrap();
    let global =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/home/.claude/skills");
    let imported = SkillSource::Imported(GlobalSkill {
        name: "review".to_owned(),
        dir: global.join("review"),
        origin: Origin {
            owner: Owner::Harness("claude-acp"),
            scope: Scope::User,
            path: global.clone(),
        },
    });
    let original = fs::read(global.join("review/SKILL.md")).unwrap();
    let mut composition = Composition::new("codex-acp", "/work");

    composition.skills = vec![imported.clone(), skill("notes")];
    prepare(&composition, &base);

    assert!(base.path().join("skills/review/checklist.md").is_file());
    assert!(base.path().join("skills/notes/SKILL.md").is_file());

    composition.skills = vec![imported];
    prepare(&composition, &base);

    assert!(!base.path().join("skills/notes").exists());
    assert!(base.path().join("skills/review/SKILL.md").is_file());
    assert_eq!(fs::read(global.join("review/SKILL.md")).unwrap(), original);
}

#[test]
fn vendor_locked_harness_refuses_a_provider() {
    let base = tempfile::tempdir().unwrap();
    let mut composition = Composition::new("cursor", "/work");

    composition.provider = Some(Provider {
        wire: WireApi::OpenAiChat,
        base_url: "https://gw.example/v1".to_owned(),
        key: None,
        headers: BTreeMap::new(),
        context_window: None,
    });
    composition.model = Some("m1".to_owned());

    let result = materialize(&composition, &run(), base.path());

    assert!(matches!(result, Err(Error::ProviderUnsupported { .. })));
}

#[test]
fn native_runs_in_real_home_until_an_item_needs_isolation() {
    let base = tempfile::tempdir().unwrap();
    let mut composition = Composition::new("claude-acp", "/work");

    composition.isolation = Isolation::Native;

    let native = prepare(&composition, &base);

    assert!(!native.launch.env.contains_key("CLAUDE_CONFIG_DIR"));

    composition.skills = vec![skill("review")];

    let isolated = prepare(&composition, &base);

    assert!(isolated.launch.env.contains_key("CLAUDE_CONFIG_DIR"));
    assert!(isolated.skipped.is_empty());
}
