mod table;

use crate::provider::ProviderSupport;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Adapter {
    pub id: &'static str,

    pub name: &'static str,

    pub source: Source,

    pub status: Status,

    pub home: Home,

    pub provider: ProviderSupport,

    pub skills: Skills,

    pub mcp: Mcp,

    pub prompt: Prompt,

    pub model: ModelSelect,

    pub auth: Auth,

    pub args: &'static [&'static str],

    pub env: &'static [(&'static str, &'static str)],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Source {
    Registry,
    OnPath(&'static [&'static str]),
    NoAcp,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Ready,
    Quarantined,
    Superseded(&'static str),
    Unmaintained,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Home {
    Redirect {
        vars: &'static [(&'static str, &'static str)],
        config: &'static str,
    },
    Unavailable,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Skills {
    Config(&'static str),
    OsHome(&'static str),
    Unsupported,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mcp {
    Session {
        http: Transport,
        sse: Transport,
        stdio: Stdio,
    },
    ServersJson(&'static str),
    Ignored,
}

impl Mcp {
    pub const PROTOCOL: Mcp = Mcp::Session {
        http: Transport::Advertised,
        sse: Transport::Advertised,
        stdio: Stdio::AnyCommand,
    };
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Transport {
    Works,
    Advertised,
    Unsupported,
    FailsSession,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Stdio {
    AnyCommand,
    AbsoluteCommand,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Prompt {
    Session { replace: bool },
    Meta { append: &'static str },
    File(&'static str),
    Flag(&'static str),
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ModelSelect {
    ConfigCategory,
    ConfigOption(&'static str),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Auth {
    Known(&'static [AuthMethod]),
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthMethod {
    Agent(&'static str),
    Terminal(&'static [&'static str]),
    Env(&'static str),
    Login(&'static [&'static str]),
}

pub fn all() -> &'static [Adapter] {
    table::ADAPTERS
}

pub fn find(id: &str) -> Option<&'static Adapter> {
    table::ADAPTERS.iter().find(|a| a.id == id)
}
