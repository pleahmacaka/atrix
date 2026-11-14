use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::State;
use tauri::async_runtime::{self, JoinHandle};
use tauri::ipc::Channel;
use twilight_gateway::{Event, EventTypeFlags, Intents, Shard, ShardId, StreamExt};
use twilight_http::Client;
use twilight_model::gateway::CloseCode;
use twilight_model::gateway::payload::incoming::GuildCreate;
use twilight_model::id::Id;

use crate::error::{Error, Result};
use crate::secret;

const SERVICE: &str = "atrix";

const ACCOUNT: &str = "discord-bot";

const MESSAGE_LIMIT: usize = 2000;

#[derive(Clone, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Frame {
    Ready {
        user: String,
    },
    Message {
        guild: Option<String>,
        channel_id: String,
        channel_name: Option<String>,
        author: String,
        author_id: String,
        content: String,
        message_id: String,
        mentioned: bool,
    },
    Closed {
        error: Option<String>,
    },
}

#[derive(Default)]
pub struct Channels {
    http: Slot,
    task: Mutex<Option<JoinHandle<()>>>,
}

impl Channels {
    fn abort(&self) {
        if let Some(task) = self.task.lock().unwrap().take() {
            task.abort();
        }
    }
}

fn keyring(e: keyring::Error) -> Error {
    Error::code("channel_keyring", e)
}

fn stored_token() -> Result<Option<String>> {
    secret::read(SERVICE, ACCOUNT).map_err(keyring)
}

fn close_error(code: Option<u16>) -> Option<String> {
    match code.map(CloseCode::try_from) {
        None => None,
        Some(Ok(CloseCode::DisallowedIntents)) => Some("channel_intents".into()),
        Some(Ok(CloseCode::AuthenticationFailed)) => Some("channel_token_invalid".into()),
        Some(_) => Some(format!("channel_closed:{}", code.unwrap_or_default())),
    }
}

fn chunks(text: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut rest = text.trim();

    while !rest.is_empty() {
        let end = rest
            .char_indices()
            .nth(MESSAGE_LIMIT)
            .map_or(rest.len(), |(i, _)| i);
        let cut = if end == rest.len() {
            end
        } else {
            rest[..end].rfind('\n').filter(|&i| i > 0).unwrap_or(end)
        };

        parts.push(rest[..cut].to_owned());
        rest = rest[cut..].trim_start();
    }

    parts
}

type Slot = Arc<Mutex<Option<Arc<Client>>>>;

async fn run(mut shard: Shard, sink: Channel<Frame>, slot: Slot, client: Arc<Client>) {
    let wanted =
        EventTypeFlags::READY | EventTypeFlags::GUILD_CREATE | EventTypeFlags::MESSAGE_CREATE;
    let mut guilds = HashMap::new();
    let mut channels = HashMap::new();
    let mut own = None;
    let mut closed = None;

    while let Some(item) = shard.next_event(wanted).await {
        let Ok(event) = item else {
            continue;
        };

        match event {
            Event::Ready(ready) => {
                own = Some(ready.user.id);
                closed = None;
                let _ = sink.send(Frame::Ready {
                    user: ready.user.name,
                });
            }
            Event::GuildCreate(created) => {
                if let GuildCreate::Available(guild) = *created {
                    for channel in guild.channels.into_iter().chain(guild.threads) {
                        channels.insert(channel.id, channel.name.unwrap_or_default());
                    }

                    guilds.insert(guild.id, guild.name);
                }
            }
            Event::MessageCreate(message) => {
                if message.author.bot || Some(message.author.id) == own {
                    continue;
                }

                let _ = sink.send(Frame::Message {
                    guild: message.guild_id.and_then(|g| guilds.get(&g).cloned()),
                    channel_id: message.channel_id.to_string(),
                    channel_name: channels.get(&message.channel_id).cloned(),
                    author: message
                        .member
                        .as_ref()
                        .and_then(|m| m.nick.clone())
                        .or_else(|| message.author.global_name.clone())
                        .unwrap_or_else(|| message.author.name.clone()),
                    author_id: message.author.id.to_string(),
                    mentioned: message.mentions.iter().any(|u| Some(u.id) == own),
                    content: message.content.clone(),
                    message_id: message.id.to_string(),
                });
            }
            Event::GatewayClose(frame) => closed = frame.map(|f| f.code),
            _ => {}
        }
    }

    {
        let mut current = slot.lock().unwrap();

        if current.as_ref().is_some_and(|c| Arc::ptr_eq(c, &client)) {
            *current = None;
        }
    }

    let _ = sink.send(Frame::Closed {
        error: close_error(closed),
    });
}

#[tauri::command]
pub async fn channel_start(channels: State<'_, Channels>, channel: Channel<Frame>) -> Result<()> {
    let token = stored_token()?.ok_or("channel_token_missing")?;
    // ring and aws-lc-rs are both linked, so rustls panics on ClientConfig::builder() without a default
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    let intents = Intents::GUILDS
        | Intents::GUILD_MESSAGES
        | Intents::DIRECT_MESSAGES
        | Intents::MESSAGE_CONTENT;
    let shard = Shard::new(ShardId::ONE, token.clone(), intents);

    channels.abort();

    let client = Arc::new(Client::new(token));

    *channels.http.lock().unwrap() = Some(client.clone());
    *channels.task.lock().unwrap() = Some(async_runtime::spawn(run(
        shard,
        channel,
        channels.http.clone(),
        client,
    )));

    Ok(())
}

#[tauri::command]
pub fn channel_stop(channels: State<'_, Channels>) {
    channels.abort();
    *channels.http.lock().unwrap() = None;
}

#[tauri::command]
pub async fn channel_send(
    channels: State<'_, Channels>,
    channel_id: String,
    text: String,
) -> Result<()> {
    let http = channels
        .http
        .lock()
        .unwrap()
        .clone()
        .ok_or("channel_not_connected")?;
    let id = channel_id
        .trim()
        .parse()
        .ok()
        .and_then(Id::new_checked)
        .ok_or_else(|| Error::code("channel_id_invalid", &channel_id))?;

    for part in chunks(&text) {
        http.create_message(id)
            .content(&part)
            .await
            .map_err(|e| Error::code("channel_send_failed", e))?;
    }

    Ok(())
}

#[tauri::command(async)]
pub fn channel_token_set(token: String) -> Result<()> {
    let token = token.trim();
    let token = token.strip_prefix("Bot ").unwrap_or(token).trim();

    if token.is_empty() {
        return Err("channel_token_missing".into());
    }

    secret::write(SERVICE, ACCOUNT, token).map_err(keyring)
}

#[tauri::command(async)]
pub fn channel_token_clear() -> Result<()> {
    secret::write(SERVICE, ACCOUNT, "").map_err(keyring)
}

#[tauri::command(async)]
pub fn channel_token_present() -> Result<bool> {
    Ok(stored_token()?.is_some())
}
