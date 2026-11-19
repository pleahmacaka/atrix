use std::collections::BTreeMap;

use acp_harness::Error;
use acp_harness::adapters;
use acp_harness::provider::{KEY_ENV, Mapping, Provider, ProviderSupport, Secret, WireApi};
use serde_json::Value;

const KEY: &str = "sk-test-key";

fn gateway(wire: WireApi) -> Provider {
    Provider {
        wire,
        base_url: "https://gw.example/v1/".to_owned(),
        key: Some(Secret::new(KEY)),
        headers: BTreeMap::new(),
        context_window: Some(128_000),
    }
}

fn mappings() -> Vec<Mapping> {
    let mut found: Vec<Mapping> = adapters::all()
        .iter()
        .filter_map(|a| match a.provider {
            ProviderSupport::Mapped(m) => Some(m),
            _ => None,
        })
        .collect();

    found.dedup();

    found
}

#[test]
fn claude_maps_to_env_only() {
    let plan = Mapping::Claude
        .plan(&gateway(WireApi::AnthropicMessages), "m1")
        .unwrap();

    assert_eq!(plan.env["ANTHROPIC_BASE_URL"], "https://gw.example/v1");
    assert_eq!(plan.env["ANTHROPIC_API_KEY"], "");
    assert_eq!(plan.env["ANTHROPIC_DEFAULT_HAIKU_MODEL"], "m1");
    assert_eq!(plan.secret_env["ANTHROPIC_AUTH_TOKEN"].expose(), KEY);
    assert!(plan.files.is_empty());
}

#[test]
fn codex_config_points_at_the_key_variable() {
    let plan = Mapping::Codex
        .plan(&gateway(WireApi::OpenAiResponses), "m1")
        .unwrap();
    let config: Value = serde_json::from_str(&plan.env["CODEX_CONFIG"]).unwrap();
    let provider = &config["model_providers"]["custom"];

    assert_eq!(plan.env["MODEL_PROVIDER"], "custom");
    assert_eq!(provider["wire_api"], "responses");
    assert_eq!(provider["env_key"], KEY_ENV);
    assert_eq!(plan.secret_env[KEY_ENV].expose(), KEY);
}

#[test]
fn qwen_selects_auth_type_by_wire() {
    let plan = Mapping::Qwen
        .plan(&gateway(WireApi::AnthropicMessages), "m1")
        .unwrap();

    assert_eq!(plan.args, ["--auth-type", "anthropic"]);
    assert_eq!(plan.env["ANTHROPIC_MODEL"], "m1");
}

#[test]
fn vibe_writes_parseable_toml() {
    let plan = Mapping::Vibe
        .plan(&gateway(WireApi::OpenAiResponses), "m1")
        .unwrap();
    let config: toml::Table = toml::from_str(&plan.files[0].contents).unwrap();

    assert_eq!(plan.files[0].path.to_str(), Some("config.toml"));
    assert_eq!(
        config["providers"][0]["api_style"].as_str(),
        Some("openai-responses")
    );
    assert_eq!(config["active_model"].as_str(), Some("m1"));
}

#[test]
fn unsupported_wire_is_rejected() {
    let result = Mapping::Codex.plan(&gateway(WireApi::OpenAiChat), "m1");

    assert!(matches!(result, Err(Error::Wire { .. })));
}

#[test]
fn headers_are_rejected_where_the_harness_has_no_field() {
    let mut provider = gateway(WireApi::OpenAiChat);

    provider
        .headers
        .insert("X-Team".to_owned(), "core".to_owned());

    let result = Mapping::Copilot.plan(&provider, "m1");

    assert!(matches!(result, Err(Error::Headers(Mapping::Copilot))));
}

#[test]
fn keys_never_reach_files() {
    for mapping in mappings() {
        for wire in mapping.wires() {
            let plan = mapping.plan(&gateway(wire), "m1").unwrap();

            for file in &plan.files {
                assert!(
                    !file.contents.contains(KEY),
                    "{mapping:?} {wire:?} wrote the key into {:?}",
                    file.path
                );
            }

            for value in plan.env.values() {
                assert!(
                    !value.contains(KEY),
                    "{mapping:?} {wire:?} put the key in plain env"
                );
            }
        }
    }
}
