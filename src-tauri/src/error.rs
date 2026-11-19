use std::fmt::{self, Display};
use std::sync::PoisonError;

use serde::{Serialize, Serializer};

#[derive(Debug)]
pub struct Error(String);

pub type Result<T, E = Error> = std::result::Result<T, E>;

impl Error {
    pub fn code(code: &str, detail: impl Display) -> Self {
        Self(format!("{code}:{detail}"))
    }
}

impl Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Error {}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0)
    }
}

macro_rules! plain {
    ($($source:ty),* $(,)?) => {
        $(
            impl From<$source> for Error {
                fn from(e: $source) -> Self {
                    Self(e.to_string())
                }
            }
        )*
    };
}

plain!(
    String,
    &str,
    std::io::Error,
    serde_json::Error,
    tauri::Error,
    tauri_plugin_http::reqwest::Error,
    zip::result::ZipError,
    acp_harness::Error,
    Box<dyn std::error::Error + Send + Sync>,
);

#[cfg(windows)]
plain!(windows::core::Error);

impl<T> From<PoisonError<T>> for Error {
    fn from(e: PoisonError<T>) -> Self {
        Self(e.to_string())
    }
}
