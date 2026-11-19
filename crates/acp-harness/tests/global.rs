use std::path::PathBuf;

use acp_harness::compose::McpTransport;
use acp_harness::global::{Discovered, Owner, Roots, Scope, discover};
use serde_json::json;

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn found() -> Discovered {
    discover(&Roots {
        home: fixtures().join("home"),
        project: Some(fixtures().join("project")),
    })
}

fn transport<'a>(found: &'a Discovered, name: &str) -> Option<&'a McpTransport> {
    found
        .tools
        .iter()
        .find(|t| t.server.name == name)
        .map(|t| &t.server.transport)
}

#[test]
fn skills_carry_owner_and_scope() {
    let found = found();
    let skills: Vec<(&str, Owner, Scope)> = found
        .skills
        .iter()
        .map(|s| (s.name.as_str(), s.origin.owner, s.origin.scope))
        .collect();

    assert_eq!(
        skills,
        [
            ("shared-notes", Owner::Shared, Scope::User),
            ("review", Owner::Harness("claude-acp"), Scope::User),
            ("project-skill", Owner::Shared, Scope::Project),
        ]
    );
}

#[test]
fn tools_are_read_from_every_dialect() {
    let found = found();

    assert!(matches!(
        transport(&found, "files"),
        Some(McpTransport::Stdio { command, env, .. }) if command == "npx" && env["ROOT"] == "/tmp"
    ));
    assert!(matches!(
        transport(&found, "docs"),
        Some(McpTransport::Http { headers, .. }) if headers["X-Team"] == "core"
    ));
    assert!(matches!(
        transport(&found, "search"),
        Some(McpTransport::Stdio { args, .. }) if args == &["--stdio"]
    ));
    assert!(matches!(
        transport(&found, "remote"),
        Some(McpTransport::Http { .. })
    ));
    assert!(matches!(
        transport(&found, "events"),
        Some(McpTransport::Sse { .. })
    ));
    assert!(matches!(
        transport(&found, "api"),
        Some(McpTransport::Http { .. })
    ));
    assert!(matches!(
        transport(&found, "fetch"),
        Some(McpTransport::Stdio { command, .. }) if command == "uvx"
    ));
    assert!(matches!(
        transport(&found, "local-tool"),
        Some(McpTransport::Stdio { command, args, .. }) if command == "bun" && args == &["x", "tool"]
    ));
    assert!(matches!(
        transport(&found, "project-tool"),
        Some(McpTransport::Stdio { .. })
    ));
}

#[test]
fn codex_bearer_token_stays_a_reference_until_the_session() {
    let found = found();
    let tool = found
        .tools
        .iter()
        .find(|t| t.server.name == "tokened")
        .unwrap();

    assert!(matches!(
        &tool.server.transport,
        McpTransport::Http { headers, .. } if headers["Authorization"] == "Bearer ${PATH}"
    ));

    let path = std::env::var("PATH").unwrap();

    assert_eq!(
        tool.server.acp()["headers"],
        json!([{ "name": "Authorization", "value": format!("Bearer {path}") }])
    );
}

#[test]
fn disabled_and_builtin_entries_are_left_out() {
    let found = found();

    for name in ["off", "developer", "stream"] {
        assert!(transport(&found, name).is_none(), "{name} should be absent");
    }
}

#[test]
fn broken_files_are_reported() {
    let found = found();

    assert_eq!(found.unreadable.len(), 1);
    assert!(found.unreadable[0].path.ends_with(".cursor/mcp.json"));
}
