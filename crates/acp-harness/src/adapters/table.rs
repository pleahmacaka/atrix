use super::{
    Adapter, Auth, AuthMethod, Carry, Home, Mcp, ModelSelect, Prompt, Skills, Source, Status,
    Stdio, Transport,
};
use crate::provider::{Mapping, ProviderSupport};

const XDG: &[(&str, &str)] = &[
    ("XDG_CONFIG_HOME", "config"),
    ("XDG_DATA_HOME", "data"),
    ("XDG_STATE_HOME", "state"),
    ("XDG_CACHE_HOME", "cache"),
];

const KILO_VARS: &[(&str, &str)] = &[
    ("XDG_CONFIG_HOME", "config"),
    ("XDG_DATA_HOME", "data"),
    ("XDG_STATE_HOME", "state"),
    ("XDG_CACHE_HOME", "cache"),
    ("KILO_CONFIG_DIR", "config/kilo"),
];

const fn session(http: Transport, sse: Transport) -> Mcp {
    Mcp::Session {
        http,
        sse,
        stdio: Stdio::AnyCommand,
    }
}

const ALL_TRANSPORTS: Mcp = session(Transport::Works, Transport::Works);

const NO_SSE: Mcp = session(Transport::Works, Transport::FailsSession);

const BASE: Adapter = Adapter {
    id: "",
    name: "",
    source: Source::Registry,
    status: Status::Ready,
    home: Home::Unknown,
    provider: ProviderSupport::Unknown,
    skills: Skills::Unknown,
    mcp: Mcp::PROTOCOL,
    prompt: Prompt::Unknown,
    model: ModelSelect::ConfigCategory,
    auth: Auth::Unknown,
    carry: &[],
    meta: "",
    vendor: None,
    transcript: None,
    args: &[],
    env: &[],
};

const OPENCODE: Adapter = Adapter {
    id: "opencode",
    name: "OpenCode",
    home: Home::Redirect {
        vars: XDG,
        config: "config/opencode",
    },
    provider: ProviderSupport::Mapped(Mapping::OpenCode),
    skills: Skills::Config("skills"),
    mcp: NO_SSE,
    prompt: Prompt::File("AGENTS.md"),
    model: ModelSelect::ConfigOption("model"),
    auth: Auth::Known(&[
        AuthMethod::Agent("opencode-login"),
        AuthMethod::Terminal(&["--login"]),
    ]),
    ..BASE
};

pub(super) const ADAPTERS: &[Adapter] = &[
    Adapter {
        id: "agoragentic-acp",
        name: "Agoragentic",
        status: Status::Quarantined,
        ..BASE
    },
    Adapter {
        id: "amp-acp",
        name: "Amp",
        home: Home::Unavailable,
        provider: ProviderSupport::VendorLocked,
        skills: Skills::OsHome(".agents/skills"),
        mcp: ALL_TRANSPORTS,
        auth: Auth::Known(&[
            AuthMethod::Terminal(&["--setup"]),
            AuthMethod::Env("AMP_API_KEY"),
        ]),
        ..BASE
    },
    Adapter {
        id: "antigravity-acp",
        name: "Google Antigravity",
        home: Home::Unavailable,
        provider: ProviderSupport::VendorLocked,
        skills: Skills::OsHome(".gemini/config/skills"),
        ..BASE
    },
    Adapter {
        id: "auggie",
        name: "Auggie CLI",
        home: Home::Redirect {
            vars: &[("AUGMENT_CACHE_DIR", "")],
            config: "",
        },
        provider: ProviderSupport::VendorLocked,
        skills: Skills::OsHome(".augment/skills"),
        prompt: Prompt::Flag("--append-system-prompt"),
        auth: Auth::Known(&[
            AuthMethod::Login(&["auggie", "login"]),
            AuthMethod::Env("AUGMENT_SESSION_AUTH"),
        ]),
        ..BASE
    },
    Adapter {
        id: "autohand",
        name: "Autohand Code",
        home: Home::Redirect {
            vars: &[("AUTOHAND_HOME", "")],
            config: "",
        },
        skills: Skills::Config("skills"),
        ..BASE
    },
    Adapter {
        id: "bob",
        name: "Bob",
        home: Home::Unavailable,
        provider: ProviderSupport::VendorLocked,
        skills: Skills::OsHome(".bob/skills"),
        ..BASE
    },
    Adapter {
        id: "claude-acp",
        name: "Claude Agent",
        home: Home::Redirect {
            vars: &[("CLAUDE_CONFIG_DIR", "")],
            config: "",
        },
        provider: ProviderSupport::Mapped(Mapping::Claude),
        skills: Skills::Config("skills"),
        mcp: ALL_TRANSPORTS,
        prompt: Prompt::Session { replace: true },
        auth: Auth::Known(&[
            AuthMethod::Terminal(&["--cli", "auth", "login", "--claudeai"]),
            AuthMethod::Terminal(&["--cli", "auth", "login", "--console"]),
        ]),
        carry: &[
            Carry::Seed {
                from: ".claude/.credentials.json",
                to: ".credentials.json",
            },
            Carry::Link {
                from: ".claude/projects",
                to: "projects",
            },
        ],
        meta: r#"{"claudeCode":{"options":{"extraArgs":{"chrome":null}}}}"#,
        vendor: Some("anthropic"),
        transcript: Some("claude"),
        ..BASE
    },
    Adapter {
        id: "cline",
        name: "Cline",
        home: Home::Redirect {
            vars: &[("CLINE_DIR", ""), ("CLINE_DATA_DIR", "data")],
            config: "",
        },
        skills: Skills::Config("skills"),
        mcp: Mcp::Ignored,
        auth: Auth::Known(&[
            AuthMethod::Agent("cline"),
            AuthMethod::Agent("cline-pass"),
            AuthMethod::Agent("openai-codex"),
        ]),
        ..BASE
    },
    Adapter {
        id: "codebuddy-code",
        name: "Codebuddy Code",
        home: Home::Redirect {
            vars: &[("CODEBUDDY_CONFIG_DIR", "")],
            config: "",
        },
        skills: Skills::Config("skills"),
        ..BASE
    },
    Adapter {
        id: "codex-acp",
        name: "Codex",
        home: Home::Redirect {
            vars: &[("CODEX_HOME", "")],
            config: "",
        },
        provider: ProviderSupport::Mapped(Mapping::Codex),
        skills: Skills::Config("skills"),
        mcp: session(Transport::Works, Transport::Unsupported),
        prompt: Prompt::Session { replace: false },
        auth: Auth::Known(&[
            AuthMethod::Login(&["codex", "login"]),
            AuthMethod::Env("CODEX_API_KEY"),
            AuthMethod::Env("OPENAI_API_KEY"),
        ]),
        carry: &[
            Carry::Seed {
                from: ".codex/auth.json",
                to: "auth.json",
            },
            Carry::Link {
                from: ".codex/sessions",
                to: "sessions",
            },
        ],
        vendor: Some("openai"),
        transcript: Some("codex"),
        ..BASE
    },
    Adapter {
        id: "cortex-code",
        name: "Cortex Code",
        home: Home::Unavailable,
        provider: ProviderSupport::VendorLocked,
        skills: Skills::OsHome(".snowflake/cortex/skills"),
        ..BASE
    },
    Adapter {
        id: "corust-agent",
        name: "Corust Agent",
        ..BASE
    },
    Adapter {
        id: "crow-cli",
        name: "crow-cli",
        skills: Skills::OsHome(".agents/skills"),
        ..BASE
    },
    Adapter {
        id: "cursor",
        name: "Cursor",
        home: Home::Redirect {
            vars: &[("CURSOR_CONFIG_DIR", ""), ("CURSOR_DATA_DIR", "data")],
            config: "",
        },
        provider: ProviderSupport::VendorLocked,
        skills: Skills::OsHome(".cursor/skills"),
        mcp: ALL_TRANSPORTS,
        auth: Auth::Known(&[
            AuthMethod::Agent("cursor_login"),
            AuthMethod::Env("CURSOR_API_KEY"),
            AuthMethod::Env("CURSOR_AUTH_TOKEN"),
        ]),
        ..BASE
    },
    Adapter {
        id: "deepagents",
        name: "DeepAgents",
        status: Status::Quarantined,
        ..BASE
    },
    Adapter {
        id: "devin",
        name: "Devin",
        home: Home::Unavailable,
        provider: ProviderSupport::VendorLocked,
        skills: Skills::OsHome(".agents/skills"),
        auth: Auth::Known(&[AuthMethod::Env("WINDSURF_API_KEY")]),
        ..BASE
    },
    Adapter {
        id: "dimcode",
        name: "DimCode",
        home: Home::Redirect {
            vars: &[("DIMCODE_HOME", "")],
            config: "",
        },
        ..BASE
    },
    Adapter {
        id: "dirac",
        name: "Dirac",
        home: Home::Redirect {
            vars: &[("DIRAC_DIR", "")],
            config: "",
        },
        skills: Skills::Config("skills"),
        ..BASE
    },
    Adapter {
        id: "factory-droid",
        name: "Factory Droid",
        home: Home::Unavailable,
        provider: ProviderSupport::GlobalConfigOnly,
        skills: Skills::OsHome(".factory/skills"),
        mcp: ALL_TRANSPORTS,
        prompt: Prompt::Flag("--append-system-prompt"),
        auth: Auth::Known(&[
            AuthMethod::Agent("device-pairing"),
            AuthMethod::Agent("factory-api-key"),
            AuthMethod::Env("FACTORY_API_KEY"),
        ]),
        ..BASE
    },
    Adapter {
        id: "fast-agent",
        name: "fast-agent",
        home: Home::Redirect {
            vars: &[("FAST_AGENT_HOME", "")],
            config: "",
        },
        ..BASE
    },
    Adapter {
        id: "gemini",
        name: "Gemini CLI",
        home: Home::Redirect {
            vars: &[("GEMINI_CLI_HOME", "")],
            config: ".gemini",
        },
        provider: ProviderSupport::Mapped(Mapping::Gemini),
        skills: Skills::Config("skills"),
        mcp: ALL_TRANSPORTS,
        prompt: Prompt::File("GEMINI.md"),
        auth: Auth::Known(&[
            AuthMethod::Agent("oauth-personal"),
            AuthMethod::Agent("gemini-api-key"),
            AuthMethod::Agent("vertex-ai"),
            AuthMethod::Agent("gateway"),
            AuthMethod::Env("GEMINI_API_KEY"),
        ]),
        ..BASE
    },
    Adapter {
        id: "github-copilot-cli",
        name: "GitHub Copilot",
        home: Home::Redirect {
            vars: &[("COPILOT_HOME", "")],
            config: "",
        },
        provider: ProviderSupport::Mapped(Mapping::Copilot),
        skills: Skills::Config("skills"),
        auth: Auth::Known(&[
            AuthMethod::Login(&["copilot", "login"]),
            AuthMethod::Env("COPILOT_GITHUB_TOKEN"),
            AuthMethod::Env("GH_TOKEN"),
            AuthMethod::Env("GITHUB_TOKEN"),
        ]),
        env: &[("COPILOT_AUTO_UPDATE", "false")],
        ..BASE
    },
    Adapter {
        id: "glm-acp-agent",
        name: "GLM Agent",
        home: Home::Redirect {
            vars: &[("ACP_GLM_SESSION_DIR", "")],
            config: "",
        },
        provider: ProviderSupport::VendorLocked,
        skills: Skills::OsHome(".claude/skills"),
        mcp: session(Transport::Works, Transport::Unsupported),
        ..BASE
    },
    Adapter {
        id: "goose",
        name: "goose",
        home: Home::Redirect {
            vars: &[("GOOSE_PATH_ROOT", "")],
            config: "config",
        },
        provider: ProviderSupport::Mapped(Mapping::Goose),
        skills: Skills::Config("skills"),
        mcp: NO_SSE,
        prompt: Prompt::File(".goosehints"),
        auth: Auth::Known(&[AuthMethod::Agent("goose-provider")]),
        env: &[("GOOSE_DISABLE_KEYRING", "1")],
        ..BASE
    },
    Adapter {
        id: "grok-build",
        name: "Grok Build",
        home: Home::Redirect {
            vars: &[("GROK_HOME", "")],
            config: "",
        },
        provider: ProviderSupport::Mapped(Mapping::Grok),
        skills: Skills::OsHome(".agents/skills"),
        mcp: ALL_TRANSPORTS,
        prompt: Prompt::Meta { append: "rules" },
        auth: Auth::Known(&[
            AuthMethod::Agent("xai.api_key"),
            AuthMethod::Agent("cached_token"),
            AuthMethod::Agent("grok.com"),
            AuthMethod::Agent("oidc"),
            AuthMethod::Env("XAI_API_KEY"),
        ]),
        ..BASE
    },
    Adapter {
        id: "harn",
        name: "Harn",
        home: Home::Redirect {
            vars: &[("HARN_STATE_DIR", "")],
            config: "",
        },
        skills: Skills::Unsupported,
        ..BASE
    },
    Adapter {
        id: "junie",
        name: "Junie",
        home: Home::Redirect {
            vars: &[("JUNIE_HOME", "")],
            config: "",
        },
        provider: ProviderSupport::Mapped(Mapping::Junie),
        skills: Skills::Config("skills"),
        auth: Auth::Known(&[
            AuthMethod::Agent("jetbrains-account"),
            AuthMethod::Agent("provider-github-copilot"),
            AuthMethod::Agent("gateway"),
        ]),
        ..BASE
    },
    Adapter {
        id: "kilo",
        name: "Kilo",
        home: Home::Redirect {
            vars: KILO_VARS,
            config: "config/kilo",
        },
        provider: ProviderSupport::Mapped(Mapping::Kilo),
        skills: Skills::Config("skills"),
        mcp: ALL_TRANSPORTS,
        prompt: Prompt::File("AGENTS.md"),
        auth: Auth::Known(&[
            AuthMethod::Agent("kilo-login"),
            AuthMethod::Login(&["kilo", "auth", "login"]),
        ]),
        ..BASE
    },
    Adapter {
        id: "kimchi",
        name: "Kimchi",
        provider: ProviderSupport::VendorLocked,
        skills: Skills::OsHome(".config/kimchi/harness/skills"),
        ..BASE
    },
    Adapter {
        id: "kimi",
        name: "Kimi CLI (Legacy)",
        status: Status::Superseded("kimi-code"),
        home: Home::Redirect {
            vars: &[("KIMI_SHARE_DIR", "")],
            config: "",
        },
        mcp: ALL_TRANSPORTS,
        ..BASE
    },
    Adapter {
        id: "kimi-code",
        name: "Kimi Code",
        home: Home::Redirect {
            vars: &[("KIMI_CODE_HOME", "")],
            config: "",
        },
        provider: ProviderSupport::Mapped(Mapping::KimiCode),
        skills: Skills::Config("skills"),
        mcp: ALL_TRANSPORTS,
        prompt: Prompt::File("AGENTS.md"),
        auth: Auth::Known(&[AuthMethod::Terminal(&["--login"])]),
        ..BASE
    },
    Adapter {
        id: "kiro",
        name: "Kiro CLI",
        home: Home::Redirect {
            vars: &[("KIRO_HOME", "")],
            config: "",
        },
        provider: ProviderSupport::VendorLocked,
        skills: Skills::Config("skills"),
        prompt: Prompt::File("steering/composition.md"),
        model: ModelSelect::ConfigOption("model"),
        auth: Auth::Known(&[AuthMethod::Login(&["kiro-cli", "login"])]),
        ..BASE
    },
    Adapter {
        id: "minimax-code",
        name: "MiniMax Code",
        home: Home::Redirect {
            vars: &[("MINIMAX_DATA_DIR", "")],
            config: "",
        },
        ..BASE
    },
    Adapter {
        id: "minion-code",
        name: "Minion Code",
        status: Status::Quarantined,
        ..BASE
    },
    Adapter {
        id: "mistral-vibe",
        name: "Mistral Vibe",
        home: Home::Redirect {
            vars: &[("VIBE_HOME", "")],
            config: "",
        },
        provider: ProviderSupport::Mapped(Mapping::Vibe),
        skills: Skills::Config("skills"),
        mcp: NO_SSE,
        prompt: Prompt::File("AGENTS.md"),
        auth: Auth::Known(&[
            AuthMethod::Agent("browser-auth"),
            AuthMethod::Terminal(&["--setup"]),
            AuthMethod::Env("MISTRAL_API_KEY"),
        ]),
        ..BASE
    },
    Adapter {
        id: "muse-code",
        name: "Muse Code",
        provider: ProviderSupport::VendorLocked,
        skills: Skills::OsHome(".agents/skills"),
        ..BASE
    },
    Adapter {
        id: "nova",
        name: "Nova",
        ..BASE
    },
    OPENCODE,
    Adapter {
        id: "opencode-v2",
        name: "OpenCode V2",
        ..OPENCODE
    },
    Adapter {
        id: "pi-acp",
        name: "Pi",
        home: Home::Redirect {
            vars: &[("PI_CODING_AGENT_DIR", "")],
            config: "",
        },
        provider: ProviderSupport::Mapped(Mapping::Pi),
        skills: Skills::Config("skills"),
        mcp: Mcp::ServersJson("mcp.json"),
        prompt: Prompt::File("APPEND_SYSTEM.md"),
        auth: Auth::Known(&[AuthMethod::Terminal(&["--terminal-login"])]),
        carry: &[
            Carry::Seed {
                from: ".pi/agent/auth.json",
                to: "auth.json",
            },
            Carry::Link {
                from: ".pi/agent/sessions",
                to: "sessions",
            },
        ],
        ..BASE
    },
    Adapter {
        id: "poolside",
        name: "Poolside",
        home: Home::Unavailable,
        ..BASE
    },
    Adapter {
        id: "qoder",
        name: "Qoder CLI",
        home: Home::Redirect {
            vars: &[("QODER_CONFIG_DIR", "")],
            config: "",
        },
        provider: ProviderSupport::VendorLocked,
        skills: Skills::Config("skills"),
        auth: Auth::Known(&[AuthMethod::Env("QODER_PERSONAL_ACCESS_TOKEN")]),
        ..BASE
    },
    Adapter {
        id: "qwen-code",
        name: "Qwen Code",
        home: Home::Redirect {
            vars: &[("QWEN_HOME", "")],
            config: "",
        },
        provider: ProviderSupport::Mapped(Mapping::Qwen),
        skills: Skills::Config("skills"),
        mcp: ALL_TRANSPORTS,
        prompt: Prompt::Flag("--append-system-prompt"),
        ..BASE
    },
    Adapter {
        id: "sigit",
        name: "siGit Code",
        args: &["--acp"],
        ..BASE
    },
    Adapter {
        id: "stakpak",
        name: "Stakpak",
        skills: Skills::Unsupported,
        ..BASE
    },
    Adapter {
        id: "vtcode",
        name: "VT Code",
        status: Status::Quarantined,
        skills: Skills::OsHome(".agents/skills"),
        ..BASE
    },
    Adapter {
        id: "crush",
        name: "Crush",
        source: Source::NoAcp,
        ..BASE
    },
    Adapter {
        id: "deepseek-acp",
        name: "DeepSeek Harness",
        source: Source::OnPath(&["deepseek-acp"]),
        home: Home::Redirect {
            vars: &[("DSH_HOME", "")],
            config: "",
        },
        provider: ProviderSupport::VendorLocked,
        auth: Auth::Known(&[AuthMethod::Env("DEEPSEEK_API_KEY")]),
        ..BASE
    },
    Adapter {
        id: "docker-agent",
        name: "Docker Agent",
        source: Source::OnPath(&["docker", "agent", "serve", "acp"]),
        home: Home::Redirect {
            vars: &[
                ("DOCKER_AGENT_CONFIG_DIR", "config"),
                ("DOCKER_AGENT_DATA_DIR", "data"),
            ],
            config: "config",
        },
        skills: Skills::OsHome(".agents/skills"),
        mcp: Mcp::Session {
            http: Transport::Works,
            sse: Transport::Works,
            stdio: Stdio::AbsoluteCommand,
        },
        auth: Auth::Known(&[AuthMethod::Agent("host-credentials")]),
        ..BASE
    },
    Adapter {
        id: "hermes-agent",
        name: "Hermes Agent",
        source: Source::OnPath(&["hermes-acp"]),
        home: Home::Redirect {
            vars: &[("HERMES_HOME", "")],
            config: "",
        },
        provider: ProviderSupport::Mapped(Mapping::Hermes),
        skills: Skills::Config("skills"),
        mcp: ALL_TRANSPORTS,
        ..BASE
    },
    Adapter {
        id: "oh-my-pi",
        name: "Oh My Pi",
        source: Source::OnPath(&["omp", "acp"]),
        home: Home::Redirect {
            vars: &[("PI_CODING_AGENT_DIR", "")],
            config: "",
        },
        skills: Skills::Config("skills"),
        ..BASE
    },
    Adapter {
        id: "openhands",
        name: "OpenHands",
        source: Source::OnPath(&["openhands", "acp", "--override-with-envs"]),
        status: Status::Unmaintained,
        home: Home::Redirect {
            vars: &[("OPENHANDS_PERSISTENCE_DIR", "")],
            config: "",
        },
        provider: ProviderSupport::Mapped(Mapping::OpenHands),
        skills: Skills::OsHome(".agents/skills"),
        auth: Auth::Known(&[AuthMethod::Agent("oauth")]),
        ..BASE
    },
];
