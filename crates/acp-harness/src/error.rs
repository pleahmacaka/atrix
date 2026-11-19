use std::path::PathBuf;

use crate::provider::{Mapping, ProviderSupport, WireApi};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Json(#[from] serde_json::Error),

    #[error(transparent)]
    Toml(#[from] toml::ser::Error),

    #[error("yaml: {0}")]
    Yaml(String),

    #[error(transparent)]
    Http(#[from] reqwest::Error),

    #[error(transparent)]
    Zip(#[from] zip::result::ZipError),

    #[error(transparent)]
    Join(#[from] tokio::task::JoinError),

    #[error("registry answered {0}")]
    Status(reqwest::StatusCode),

    #[error("unknown harness {0}")]
    UnknownHarness(String),

    #[error("{0} has no ACP mode")]
    NoAcp(&'static str),

    #[error("the {mapping:?} mapping cannot speak {wire:?}")]
    Wire { mapping: Mapping, wire: WireApi },

    #[error("the {0:?} mapping cannot carry custom headers")]
    Headers(Mapping),

    #[error("{harness} cannot take a provider: {support:?}")]
    ProviderUnsupported {
        harness: &'static str,
        support: ProviderSupport,
    },

    #[error("a provider needs a model")]
    MissingModel,

    #[error("{0} has no isolated home for provider files")]
    NoHome(&'static str),

    #[error("invalid skill name {0:?}")]
    InvalidName(String),

    #[error("{0} is not an https url")]
    Insecure(String),

    #[error("sha256 mismatch for {0}")]
    Checksum(String),

    #[error("{agent} has no distribution for {platform}")]
    NoDistribution { agent: String, platform: String },

    #[error("{0} is missing after unpacking")]
    MissingBinary(PathBuf),

    #[error("{0:?} leaves the install directory")]
    UnsafePath(String),
}

pub type Result<T, E = Error> = std::result::Result<T, E>;
