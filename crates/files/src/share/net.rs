use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;
use std::time::Duration;

use iroh::endpoint::Connection;
use iroh::protocol::{AcceptError, ProtocolHandler, RouterBuilder};
use iroh::{Endpoint, EndpointId};
use iroh_blobs::api::downloader::Downloader;
use iroh_blobs::protocol::GetRequest;
use iroh_blobs::provider::events::{
    AbortReason, ConnectMode, EventMask, EventSender, ProviderMessage, RequestMode,
};
use iroh_blobs::store::fs::options::Options;
use iroh_blobs::store::fs::FsStore;
use iroh_blobs::store::GcConfig;
use iroh_blobs::BlobsProtocol;
use tauri::{AppHandle, Manager};
use tokio::time::timeout;

use super::wire::{self, fail, Reply, Request, REPLY_LIMIT, REQUEST_LIMIT};
use super::{node, Node};
use crate::error::{Error, Result};

const DIAL_TIMEOUT: Duration = Duration::from_secs(20);
const SERVE_TIMEOUT: Duration = Duration::from_secs(30);
const GC_INTERVAL: Duration = Duration::from_secs(3_600);

pub(super) struct Net {
    pub(super) endpoint: Endpoint,
    pub(super) store: FsStore,
    pub(super) downloader: Downloader,
}

struct Control(Arc<Node>);

impl fmt::Debug for Control {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Control")
    }
}

impl ProtocolHandler for Control {
    async fn accept(&self, connection: Connection) -> std::result::Result<(), AcceptError> {
        match timeout(SERVE_TIMEOUT, self.0.serve(&connection)).await {
            Ok(Ok(())) => {
                // returning drops the connection, which can discard our unacked final frame
                let _ = timeout(SERVE_TIMEOUT, connection.closed()).await;
            }
            _ => connection.close(1u32.into(), b"rejected"),
        }

        Ok(())
    }
}

fn verdict(allowed: bool) -> std::result::Result<(), AbortReason> {
    if allowed {
        Ok(())
    } else {
        Err(AbortReason::Permission)
    }
}

fn guard(node: Arc<Node>) -> EventSender {
    let mask = EventMask {
        connected: ConnectMode::Intercept,
        get: RequestMode::Intercept,
        get_many: RequestMode::Disabled,
        ..EventMask::DEFAULT
    };

    let (sender, mut events) = EventSender::channel(32, mask);

    tauri::async_runtime::spawn(async move {
        let mut peers: HashMap<u64, EndpointId> = HashMap::new();

        while let Some(event) = events.recv().await {
            match event {
                ProviderMessage::ClientConnected(message) => {
                    if let Some(peer) = message.endpoint_id {
                        peers.insert(message.connection_id, peer);
                    }

                    message.tx.send(Ok(())).await.ok();
                }
                ProviderMessage::ConnectionClosed(message) => {
                    peers.remove(&message.connection_id);
                }
                ProviderMessage::GetRequestReceived(message) => {
                    let allowed = peers
                        .get(&message.connection_id)
                        .is_some_and(|peer| node.may_serve(peer, &message.request));

                    message.tx.send(verdict(allowed)).await.ok();

                    if allowed {
                        let transfer = node.transfer();
                        let mut updates = message.rx;

                        tauri::async_runtime::spawn(async move {
                            while let Ok(Some(_)) = updates.recv().await {}

                            drop(transfer);
                        });
                    }
                }
                _ => {}
            }
        }
    });

    sender
}

pub async fn mount(app: &AppHandle, router: RouterBuilder) -> RouterBuilder {
    if app.try_state::<crate::Host>().is_none() {
        return router;
    }

    match attach(app, router.endpoint()).await {
        Ok((node, blobs)) => router
            .accept(wire::ALPN, Control(node))
            .accept(iroh_blobs::ALPN, blobs),
        Err(error) => {
            log::warn!("file sharing unavailable: {error}");

            router
        }
    }
}

async fn attach(app: &AppHandle, endpoint: &Endpoint) -> Result<(Arc<Node>, BlobsProtocol)> {
    let node = node(app)?;
    let blobs = node.dir.join("blobs");
    let mut options = Options::new(&blobs);

    options.gc = Some(GcConfig {
        interval: GC_INTERVAL,
        add_protected: None,
    });

    let store = FsStore::load_with_opts(blobs.join("blobs.db"), options)
        .await
        .map_err(fail)?;

    let provider = BlobsProtocol::new(&store, Some(guard(node.clone())));

    let net = Net {
        endpoint: endpoint.clone(),
        downloader: store.downloader(endpoint),
        store,
    };

    node.net.set(net).map_err(|_| Error::Busy)?;

    Ok((node, provider))
}

impl Node {
    pub(super) fn net(&self) -> Result<&Net> {
        self.net.get().ok_or(Error::Unreachable)
    }

    pub(super) async fn call(&self, to: EndpointId, request: Request) -> Result<Reply> {
        let net = self.net()?;

        let exchange = async {
            let connection = net
                .endpoint
                .connect(to, wire::ALPN)
                .await
                .map_err(|_| Error::Unreachable)?;
            let (mut send, mut recv) = connection.open_bi().await.map_err(fail)?;

            wire::write(&mut send, &request).await?;

            let reply = wire::read(&mut recv, REPLY_LIMIT).await?;

            connection.close(0u32.into(), b"done");

            Ok(reply)
        };

        timeout(DIAL_TIMEOUT, exchange)
            .await
            .unwrap_or(Err(Error::Unreachable))
    }

    async fn serve(self: &Arc<Self>, connection: &Connection) -> Result<()> {
        let remote = connection.remote_id();
        let (mut send, mut recv) = connection.accept_bi().await.map_err(fail)?;
        let request = wire::read(&mut recv, REQUEST_LIMIT).await?;

        let reply = match request {
            Request::Browse { path } => self.browsed(remote, path).await,
            Request::Fetch { path } => self.fetched(remote, path).await,
            Request::Unknown => Reply::Denied,
        };

        wire::write(&mut send, &reply).await
    }

    fn may_serve(&self, peer: &EndpointId, request: &GetRequest) -> bool {
        request.ranges.is_blob()
            && self.member_name(peer).is_some()
            && self.gate.lock().unwrap().holds(peer, &request.hash)
    }
}
