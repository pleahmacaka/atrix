mod links;
mod pairing;
mod roster;
mod wire;

use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

use iroh::endpoint::{Connection, presets};
use iroh::{Endpoint, EndpointId};
use n0_future::task::spawn;
use n0_future::time::{Duration, SystemTime};
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, oneshot};

pub use iroh::SecretKey as Key;

use wire::{Frame, HOST_ALPN, PAIR_ALPN};

const DIAL_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Info {
    pub name: String,
    pub platform: String,
    pub host: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Member {
    pub id: String,
    #[serde(flatten)]
    pub info: Info,
    pub at: u64,
    #[serde(default)]
    pub removed: bool,
    #[serde(default)]
    pub seen: u64,
    #[serde(default)]
    pub online: bool,
}

impl Member {
    fn fresh(id: &str, info: Info) -> Self {
        Member {
            id: id.to_string(),
            info,
            at: now(),
            removed: false,
            seen: now(),
            online: false,
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Event {
    Peers { peers: Vec<Member> },
    Data { from: String, data: String },
    Request { id: u64, from: String, data: String },
    Paired { id: String },
}

#[derive(Serialize, Clone, Debug)]
pub struct Pairing {
    pub code: String,
    pub expires: u64,
}

struct Link {
    conn: Connection,
    feed: mpsc::UnboundedSender<Frame>,
}

struct Pending {
    token: String,
    expires: u64,
}

struct Retry {
    next: u64,
    delay: u64,
}

#[derive(Default)]
struct State {
    info: Info,
    members: HashMap<String, Member>,
    links: HashMap<String, Link>,
    dialing: Vec<String>,
    retry: HashMap<String, Retry>,
    pairing: Option<Pending>,
    replies: HashMap<u64, oneshot::Sender<String>>,
    next: u64,
}

struct Inner {
    endpoint: Endpoint,
    state: Mutex<State>,
    events: mpsc::UnboundedSender<Event>,
}

#[derive(Clone)]
pub struct Node(Arc<Inner>);

fn now() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn fail(code: &str) -> impl Fn(String) -> String + '_ {
    move |detail| format!("{code}:{detail}")
}

fn parse_id(id: &str) -> Result<EndpointId, String> {
    id.parse().map_err(|_| format!("peer_invalid:{id}"))
}

impl Node {
    pub async fn start(
        secret: Key,
        members: Vec<Member>,
        info: Info,
    ) -> Result<(Node, mpsc::UnboundedReceiver<Event>), String> {
        let endpoint = Endpoint::builder(presets::N0)
            .secret_key(secret)
            .alpns(vec![HOST_ALPN.to_vec(), PAIR_ALPN.to_vec()])
            .bind()
            .await
            .map_err(|e| format!("net_bind:{e}"))?;
        let me = endpoint.id().to_string();
        let members = members
            .into_iter()
            .filter(|m| m.id != me)
            .map(|m| (m.id.clone(), Member { online: false, ..m }))
            .collect();
        let (events, receiver) = mpsc::unbounded_channel();
        let node = Node(Arc::new(Inner {
            endpoint,
            state: Mutex::new(State {
                info,
                members,
                ..State::default()
            }),
            events,
        }));

        spawn(node.clone().accept_loop());
        spawn(node.clone().sweep_loop());

        Ok((node, receiver))
    }

    pub fn id(&self) -> String {
        self.0.endpoint.id().to_string()
    }

    pub fn secret(&self) -> [u8; 32] {
        self.0.endpoint.secret_key().to_bytes()
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        self.0.state.lock().unwrap_or_else(|e| e.into_inner())
    }
}
