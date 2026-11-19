use std::collections::BTreeMap;
use std::path::Path;

use reqwest::StatusCode;
use reqwest::header::{ETAG, HeaderMap, IF_MODIFIED_SINCE, IF_NONE_MATCH, LAST_MODIFIED};
use serde::{Deserialize, Serialize};

use crate::{Error, Result};

pub const REGISTRY_URL: &str =
    "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Registry {
    pub version: String,

    pub agents: Vec<Agent>,

    #[serde(default)]
    pub extensions: Vec<serde_json::Value>,
}

impl Registry {
    pub fn agent(&self, id: &str) -> Option<&Agent> {
        self.agents.iter().find(|a| a.id == id)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,

    pub name: String,

    pub version: String,

    pub description: String,

    pub distribution: Distribution,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repository: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub website: Option<String>,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub authors: Vec<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub license_url: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Distribution {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub npx: Option<Package>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uvx: Option<Package>,

    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub binary: BTreeMap<String, BinaryTarget>,
}

impl Distribution {
    pub fn binary_for(&self, platform: &str) -> Option<&BinaryTarget> {
        self.binary.get(platform)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Package {
    pub package: String,

    #[serde(default)]
    pub args: Vec<String>,

    #[serde(default)]
    pub env: BTreeMap<String, String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BinaryTarget {
    pub archive: String,

    pub cmd: String,

    #[serde(default)]
    pub args: Vec<String>,

    #[serde(default)]
    pub env: BTreeMap<String, String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
}

pub fn platform() -> Option<&'static str> {
    use std::env::consts::{ARCH, OS};

    let musl = cfg!(target_env = "musl");

    let key = match (OS, ARCH, musl) {
        ("macos", "aarch64", _) => "darwin-aarch64",
        ("macos", "x86_64", _) => "darwin-x86_64",
        ("linux", "aarch64", false) => "linux-aarch64",
        ("linux", "aarch64", true) => "linux-aarch64-musl",
        ("linux", "x86_64", false) => "linux-x86_64",
        ("linux", "x86_64", true) => "linux-x86_64-musl",
        ("windows", "aarch64", _) => "windows-aarch64",
        ("windows", "x86_64", _) => "windows-x86_64",
        _ => return None,
    };

    Some(key)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Cached {
    etag: Option<String>,

    last_modified: Option<String>,

    registry: Registry,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Freshness {
    Downloaded,
    NotModified,
}

pub fn load(cache: &Path) -> Option<Registry> {
    read_cache(cache).map(|c| c.registry)
}

pub async fn refresh(client: &reqwest::Client, cache: &Path) -> Result<(Registry, Freshness)> {
    let cached = read_cache(cache);
    let mut request = client.get(REGISTRY_URL);

    if let Some(c) = &cached {
        if let Some(etag) = &c.etag {
            request = request.header(IF_NONE_MATCH, etag);
        }

        if let Some(modified) = &c.last_modified {
            request = request.header(IF_MODIFIED_SINCE, modified);
        }
    }

    let response = request.send().await?;
    let status = response.status();

    if status == StatusCode::NOT_MODIFIED
        && let Some(c) = cached
    {
        return Ok((c.registry, Freshness::NotModified));
    }

    if !status.is_success() {
        return Err(Error::Status(status));
    }

    let headers = response.headers().clone();
    let registry: Registry = serde_json::from_slice(&response.bytes().await?)?;
    let fresh = Cached {
        etag: header(&headers, ETAG),
        last_modified: header(&headers, LAST_MODIFIED),
        registry,
    };

    write_cache(cache, &fresh).await?;

    Ok((fresh.registry, Freshness::Downloaded))
}

fn header(headers: &HeaderMap, name: reqwest::header::HeaderName) -> Option<String> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned)
}

fn read_cache(path: &Path) -> Option<Cached> {
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}

async fn write_cache(path: &Path, cached: &Cached) -> Result<()> {
    if let Some(dir) = path.parent() {
        tokio::fs::create_dir_all(dir).await?;
    }

    let partial = path.with_extension("partial");

    tokio::fs::write(&partial, serde_json::to_vec(cached)?).await?;
    tokio::fs::rename(&partial, path).await?;

    Ok(())
}
