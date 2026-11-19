use std::fmt;
use std::path::{Path, PathBuf};

use iroh::endpoint::{RecvStream, SendStream};
use iroh_blobs::Hash;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

pub const ALPN: &[u8] = b"atrix/files/1";
pub const REQUEST_LIMIT: usize = 16 * 1024;
pub const REPLY_LIMIT: usize = 64 * 1024 * 1024;

const RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEntry {
    pub name: String,
    pub path: String,
    pub dir: bool,
    pub size: u64,
    pub modified: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Request {
    Browse {
        path: Option<String>,
    },
    Fetch {
        path: String,
    },
    #[serde(other)]
    Unknown,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Reply {
    Listing {
        path: Option<String>,
        entries: Vec<RemoteEntry>,
    },
    Blob {
        hash: Hash,
        size: u64,
        name: String,
    },
    Pending,
    Denied,
}

pub fn fail(error: impl fmt::Display) -> Error {
    Error::Os(error.to_string())
}

pub fn safe_relative(name: &str) -> Option<PathBuf> {
    let mut path = PathBuf::new();

    for segment in name.split('/') {
        let stem = segment.split('.').next().unwrap_or_default();
        let unsafe_segment = segment.is_empty()
            || segment.ends_with(['.', ' '])
            || segment
                .chars()
                .any(|c| c.is_control() || r#"<>:"\|?*"#.contains(c))
            || RESERVED.contains(&stem.to_ascii_uppercase().as_str());

        if unsafe_segment {
            return None;
        }

        path.push(segment);
    }

    Some(path)
}

pub fn vacant(folder: &Path, name: &str) -> PathBuf {
    let first = folder.join(name);

    if !first.exists() {
        return first;
    }

    let (stem, extension) = match name.rsplit_once('.') {
        Some((stem, extension)) if !stem.is_empty() => (stem, format!(".{extension}")),
        _ => (name, String::new()),
    };

    (1..)
        .map(|n| folder.join(format!("{stem} ({n}){extension}")))
        .find(|path| !path.exists())
        .unwrap_or(first)
}

pub async fn write<T: Serialize>(send: &mut SendStream, frame: &T) -> Result<()> {
    let bytes = serde_json::to_vec(frame).map_err(fail)?;

    send.write_all(&bytes).await.map_err(fail)?;
    send.finish().map_err(fail)
}

pub async fn read<T: DeserializeOwned>(recv: &mut RecvStream, limit: usize) -> Result<T> {
    let bytes = recv.read_to_end(limit).await.map_err(fail)?;

    serde_json::from_slice(&bytes).map_err(fail)
}
