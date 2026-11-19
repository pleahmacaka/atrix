pub mod adapters;
pub mod compose;
mod error;
mod files;
pub mod global;
pub mod install;
pub mod materialize;
pub mod provider;
pub mod registry;
pub mod session;

pub use error::{Error, Result};
pub use reqwest;

pub fn client(user_agent: &str) -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .user_agent(user_agent)
        .https_only(true)
        .build()?)
}
