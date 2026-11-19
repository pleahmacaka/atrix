use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::State;
use tauri::async_runtime::{self, JoinHandle};
use tauri::ipc::Channel;
use twilight_gateway::{Event, EventTypeFlags, Intents, Shard, ShardId, StreamExt};
use twilight_http::Client;
use twilight_model::channel::message::AllowedMentions;
use twilight_model::gateway::CloseCode;
use twilight_model::gateway::payload::incoming::GuildCreate;
use twilight_model::id::Id;
use twilight_model::id::marker::{RoleMarker, UserMarker};

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
        parent_id: Option<String>,
        direct: bool,
        author: String,
        author_id: String,
        content: String,
        message_id: String,
    },
    Closed {
        error: Option<String>,
    },
}

type Owner = Id<UserMarker>;

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

type Slot = Arc<Mutex<Option<(Arc<Client>, Owner)>>>;

fn owner_of(raw: &str) -> Result<Owner> {
    let raw = raw.trim();
    let invalid = || Error::code("channel_owner_invalid", raw);

    if !(17..=20).contains(&raw.len()) || !raw.bytes().all(|b| b.is_ascii_digit()) {
        return Err(invalid());
    }

    raw.parse()
        .ok()
        .and_then(Id::new_checked)
        .ok_or_else(invalid)
}

fn without_mentions(content: &str, own: Owner, roles: &HashSet<Id<RoleMarker>>) -> String {
    let tags = [format!("<@{own}>"), format!("<@!{own}>")]
        .into_iter()
        .chain(roles.iter().map(|r| format!("<@&{r}>")));

    tags.fold(content.to_owned(), |text, tag| {
        text.replace(&format!("{tag} "), "").replace(&tag, "")
    })
    .trim()
    .to_owned()
}

async fn run(mut shard: Shard, sink: Channel<Frame>, slot: Slot, client: Arc<Client>) {
    let wanted = EventTypeFlags::READY
        | EventTypeFlags::GUILD_CREATE
        | EventTypeFlags::MESSAGE_CREATE
        | EventTypeFlags::THREAD_CREATE;
    let mut guilds = HashMap::new();
    let mut channels = HashMap::new();
    let mut own = None;
    let mut own_roles = HashSet::new();
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
                    own_roles.extend(
                        guild
                            .roles
                            .iter()
                            .filter(|r| {
                                r.tags
                                    .as_ref()
                                    .and_then(|t| t.bot_id)
                                    .is_some_and(|b| Some(b) == own)
                            })
                            .map(|r| r.id),
                    );

                    for channel in guild.channels.into_iter().chain(guild.threads) {
                        channels.insert(
                            channel.id,
                            (channel.name.unwrap_or_default(), channel.parent_id),
                        );
                    }

                    guilds.insert(guild.id, guild.name);
                }
            }
            Event::ThreadCreate(thread) => {
                channels.insert(
                    thread.id,
                    (thread.name.clone().unwrap_or_default(), thread.parent_id),
                );
            }
            Event::MessageCreate(message) => {
                let Some(me) = own else {
                    continue;
                };
                let direct = message.guild_id.is_none();
                let mentioned = message.mentions.iter().any(|u| u.id == me)
                    || message.mention_roles.iter().any(|r| own_roles.contains(r));

                if message.author.bot || !(mentioned || direct) {
                    continue;
                }

                let known = channels.get(&message.channel_id);

                let _ = sink.send(Frame::Message {
                    guild: message.guild_id.and_then(|g| guilds.get(&g).cloned()),
                    channel_id: message.channel_id.to_string(),
                    channel_name: known.map(|(name, _)| name.clone()),
                    parent_id: known.and_then(|(_, parent)| parent.map(|p| p.to_string())),
                    direct,
                    author: message
                        .member
                        .as_ref()
                        .and_then(|m| m.nick.clone())
                        .or_else(|| message.author.global_name.clone())
                        .unwrap_or_else(|| message.author.name.clone()),
                    author_id: message.author.id.to_string(),
                    content: without_mentions(&message.content, me, &own_roles),
                    message_id: message.id.to_string(),
                });
            }
            Event::GatewayClose(frame) => closed = frame.map(|f| f.code),
            _ => {}
        }
    }

    {
        let mut current = slot.lock().unwrap();

        if current
            .as_ref()
            .is_some_and(|(c, _)| Arc::ptr_eq(c, &client))
        {
            *current = None;
        }
    }

    let _ = sink.send(Frame::Closed {
        error: close_error(closed),
    });
}

#[tauri::command]
pub async fn channel_start(
    channels: State<'_, Channels>,
    channel: Channel<Frame>,
    owner: String,
) -> Result<()> {
    let owner = owner_of(&owner)?;
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

    *channels.http.lock().unwrap() = Some((client.clone(), owner));
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
    mention: Option<String>,
    reply_to: Option<String>,
) -> Result<()> {
    let (http, owner) = channels
        .http
        .lock()
        .unwrap()
        .clone()
        .ok_or("channel_not_connected")?;
    let target = match mention {
        Some(user) => owner_of(&user)?,
        None => owner,
    };
    let mentions = AllowedMentions {
        users: vec![target],
        replied_user: true,
        ..AllowedMentions::default()
    };
    let id = channel_of(&channel_id)?;
    let reference = reply_to
        .as_deref()
        .and_then(|m| m.trim().parse().ok())
        .and_then(Id::new_checked);

    for (i, part) in chunks(&format!("<@{target}> {text}")).iter().enumerate() {
        let request = http
            .create_message(id)
            .content(part)
            .allowed_mentions(Some(&mentions));
        let request = match reference {
            Some(m) if i == 0 => request.reply(m),
            _ => request,
        };

        request
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

fn channel_of(channel_id: &str) -> Result<Id<twilight_model::id::marker::ChannelMarker>> {
    channel_id
        .trim()
        .parse()
        .ok()
        .and_then(Id::new_checked)
        .ok_or_else(|| Error::code("channel_id_invalid", channel_id))
}

#[tauri::command]
pub async fn channel_typing(channels: State<'_, Channels>, channel_id: String) -> Result<()> {
    let (http, _) = channels
        .http
        .lock()
        .unwrap()
        .clone()
        .ok_or("channel_not_connected")?;

    http.create_typing_trigger(channel_of(&channel_id)?)
        .await
        .map_err(|e| Error::code("channel_send_failed", e))?;

    Ok(())
}

fn client() -> Result<Client> {
    Ok(Client::new(stored_token()?.ok_or("channel_token_missing")?))
}

#[tauri::command]
pub async fn channel_bot_name() -> Result<String> {
    let user = client()?
        .current_user()
        .await
        .map_err(|e| Error::code("channel_token_invalid", e))?
        .model()
        .await
        .map_err(|e| Error::code("channel_token_invalid", e))?;

    Ok(user.global_name.unwrap_or(user.name))
}

#[tauri::command]
pub async fn channel_user_name(user_id: String) -> Result<String> {
    let id = owner_of(&user_id)?;
    let user = client()?
        .user(id)
        .await
        .map_err(|e| Error::code("channel_owner_invalid", e))?
        .model()
        .await
        .map_err(|e| Error::code("channel_owner_invalid", e))?;

    Ok(user.global_name.unwrap_or(user.name))
}
