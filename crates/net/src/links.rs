use std::fmt;

use iroh::endpoint::{Connection, Side};
use iroh::protocol::{AcceptError, ProtocolHandler};
use n0_future::task::spawn;
use n0_future::time::{Duration, sleep, timeout};
use tokio::sync::{mpsc, oneshot};

use crate::wire::{FRAME_LIMIT, Frame, HOST_ALPN, PAIR_ALPN, read_frame, write_frame};
use crate::{DIAL_TIMEOUT, Event, Info, Link, Node, Retry, State, fail, now, parse_id};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

const SWEEP: Duration = Duration::from_secs(5);

const RETRY_MIN_MS: u64 = 5_000;

const RETRY_MAX_MS: u64 = 300_000;

pub(crate) struct Accept(pub(crate) Node);

impl fmt::Debug for Accept {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Accept")
    }
}

impl ProtocolHandler for Accept {
    async fn accept(&self, conn: Connection) -> Result<(), AcceptError> {
        if conn.alpn() == PAIR_ALPN {
            self.0.answer_pair(conn).await;
        } else {
            self.0.adopt(conn);
        }

        Ok(())
    }
}

impl Node {
    pub fn set_info(&self, info: Info) {
        self.lock().info = info.clone();
        self.broadcast(Frame::Hello { info });
    }

    pub fn send(&self, to: Option<&str>, data: String) -> Result<(), String> {
        let Some(id) = to else {
            self.broadcast(Frame::Data { data });

            return Ok(());
        };
        let state = self.lock();
        let link = state
            .links
            .get(id)
            .ok_or_else(|| format!("peer_offline:{id}"))?;
        let _ = link.feed.send(Frame::Data { data });

        Ok(())
    }

    pub async fn request(&self, to: &str, data: String) -> Result<String, String> {
        let conn = self
            .lock()
            .links
            .get(to)
            .map(|l| l.conn.clone())
            .ok_or_else(|| format!("peer_offline:{to}"))?;
        let exchange = async {
            let (mut send, mut recv) = conn.open_bi().await.map_err(|e| e.to_string())?;

            send.write_all(data.as_bytes())
                .await
                .map_err(|e| e.to_string())?;
            send.finish().map_err(|e| e.to_string())?;

            let bytes = recv
                .read_to_end(FRAME_LIMIT)
                .await
                .map_err(|e| e.to_string())?;

            String::from_utf8(bytes).map_err(|e| e.to_string())
        };

        timeout(REQUEST_TIMEOUT, exchange)
            .await
            .map_err(|_| format!("peer_timeout:{to}"))?
            .map_err(fail("peer_failed"))
    }

    pub fn reply(&self, id: u64, data: String) {
        if let Some(sender) = self.lock().replies.remove(&id) {
            let _ = sender.send(data);
        }
    }

    pub(crate) fn broadcast(&self, frame: Frame) {
        let feeds: Vec<_> = self.lock().links.values().map(|l| l.feed.clone()).collect();

        for feed in feeds {
            let _ = feed.send(frame.clone());
        }
    }

    pub(crate) async fn sweep_loop(self) {
        loop {
            let due = {
                let mut state = self.lock();
                let time = now();
                let State {
                    members,
                    links,
                    dialing,
                    retry,
                    ..
                } = &mut *state;
                let mut due = Vec::new();

                for member in members.values().filter(|m| !m.removed) {
                    let waiting = retry.get(&member.id).is_some_and(|r| r.next > time);

                    if !links.contains_key(&member.id) && !dialing.contains(&member.id) && !waiting
                    {
                        dialing.push(member.id.clone());
                        due.push(member.id.clone());
                    }
                }

                due
            };

            for id in due {
                spawn(self.clone().dial_once(id));
            }

            sleep(SWEEP).await;
        }
    }

    pub(crate) async fn dial(self, id: String) {
        {
            let mut state = self.lock();

            if state.links.contains_key(&id) || state.dialing.contains(&id) {
                return;
            }

            state.dialing.push(id.clone());
        }

        self.dial_once(id).await;
    }

    async fn dial_once(self, id: String) {
        let connected = match parse_id(&id) {
            Ok(target) => timeout(DIAL_TIMEOUT, self.0.endpoint.connect(target, HOST_ALPN))
                .await
                .ok()
                .and_then(Result::ok),
            Err(_) => None,
        };

        let mut state = self.lock();

        state.dialing.retain(|d| d != &id);

        match connected {
            Some(conn) => {
                state.retry.remove(&id);
                drop(state);
                self.adopt(conn);
            }
            None => {
                let delay = state
                    .retry
                    .get(&id)
                    .map_or(RETRY_MIN_MS, |r| (r.delay * 2).min(RETRY_MAX_MS));

                state.retry.insert(
                    id,
                    Retry {
                        next: now() + delay,
                        delay,
                    },
                );
            }
        }
    }

    fn keeper(&self, conn: &Connection) -> bool {
        let me = self.id();
        let peer = conn.remote_id().to_string();
        let dialer = if conn.side() == Side::Client {
            me.clone()
        } else {
            peer.clone()
        };

        dialer == me.min(peer)
    }

    fn adopt(&self, conn: Connection) {
        let peer = conn.remote_id().to_string();

        if !self.trusted(&peer) {
            conn.close(1u32.into(), b"unknown");

            return;
        }

        let (feed, frames) = mpsc::unbounded_channel();
        let replaced = {
            let mut state = self.lock();
            let yields = state
                .links
                .get(&peer)
                .is_some_and(|l| self.keeper(&l.conn) && !self.keeper(&conn));

            if yields {
                drop(state);
                conn.close(0u32.into(), b"duplicate");

                return;
            }

            state.retry.remove(&peer);

            if let Some(member) = state.members.get_mut(&peer) {
                member.seen = now();
            }

            state.links.insert(
                peer.clone(),
                Link {
                    conn: conn.clone(),
                    feed: feed.clone(),
                },
            )
        };

        if let Some(old) = replaced {
            old.conn.close(0u32.into(), b"duplicate");
        }

        let info = self.lock().info.clone();

        let _ = feed.send(Frame::Hello { info });
        let _ = feed.send(Frame::Roster {
            members: self.roster(),
        });

        spawn(write_loop(conn.clone(), frames));
        spawn(self.clone().read_loop(conn.clone(), peer.clone()));
        spawn(self.clone().serve_loop(conn.clone(), peer.clone()));
        spawn(self.clone().watch(conn, peer));
        self.announce();
    }

    async fn watch(self, conn: Connection, peer: String) {
        conn.closed().await;

        let removed = {
            let mut state = self.lock();
            let current = state
                .links
                .get(&peer)
                .is_some_and(|l| l.conn.stable_id() == conn.stable_id());

            if current {
                state.links.remove(&peer);
            }

            if let Some(member) = state.members.get_mut(&peer) {
                member.seen = now();
            }

            current
        };

        if removed {
            self.announce();
        }
    }

    async fn read_loop(self, conn: Connection, peer: String) {
        let Ok(mut recv) = conn.accept_uni().await else {
            return;
        };

        while let Some(frame) = read_frame(&mut recv).await {
            match frame {
                Frame::Hello { info } => {
                    if let Some(member) = self.lock().members.get_mut(&peer) {
                        member.info = info;
                    }

                    self.announce();
                }
                Frame::Roster { members } => self.merge(members),
                Frame::Bye => self.forget(&peer),
                Frame::Data { data } => {
                    let _ = self.0.events.send(Event::Data {
                        from: peer.clone(),
                        data,
                    });
                }
            }
        }
    }

    async fn serve_loop(self, conn: Connection, peer: String) {
        while let Ok((mut send, mut recv)) = conn.accept_bi().await {
            let node = self.clone();
            let from = peer.clone();

            spawn(async move {
                let Ok(bytes) = recv.read_to_end(FRAME_LIMIT).await else {
                    return;
                };
                let (reply, answer) = oneshot::channel();
                let id = {
                    let mut state = node.lock();

                    state.next += 1;

                    let id = state.next;

                    state.replies.insert(id, reply);
                    id
                };

                let _ = node.0.events.send(Event::Request {
                    id,
                    from,
                    data: String::from_utf8_lossy(&bytes).into_owned(),
                });

                let reply = timeout(REQUEST_TIMEOUT, answer).await;

                node.lock().replies.remove(&id);

                if let Ok(Ok(reply)) = reply {
                    let _ = send.write_all(reply.as_bytes()).await;
                    let _ = send.finish();
                }
            });
        }
    }
}

async fn write_loop(conn: Connection, mut frames: mpsc::UnboundedReceiver<Frame>) {
    let Ok(mut send) = conn.open_uni().await else {
        return;
    };

    while let Some(frame) = frames.recv().await {
        if write_frame(&mut send, &frame).await.is_err() {
            return;
        }
    }
}
