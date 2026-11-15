use sha2::{Digest, Sha256};
use tauri_plugin_http::reqwest::{self, Client};

use crate::error::{Error, Result};

pub fn client() -> Result<Client> {
    Ok(Client::builder().user_agent("atrix").build()?)
}

pub async fn get(client: &Client, url: &str, code: &str) -> Result<Vec<u8>> {
    let response = client
        .get(url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| Error::code(code, e))?;
    let bytes = response.bytes().await.map_err(|e| Error::code(code, e))?;

    Ok(bytes.to_vec())
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
