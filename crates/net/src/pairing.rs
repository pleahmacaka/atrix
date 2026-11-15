use iroh::EndpointAddr;
use iroh::endpoint::Connection;
use n0_future::task::spawn;
use n0_future::time::{Duration, timeout};

use crate::wire::{PAIR_ALPN, PAIR_LIMIT, PairAnswer, PairAsk};
use crate::{DIAL_TIMEOUT, Event, Member, Node, Pairing, Pending, fail, now, parse_id};

const ONLINE_TIMEOUT: Duration = Duration::from_secs(10);

fn token() -> String {
    let mut bytes = [0u8; 16];

    getrandom::fill(&mut bytes).expect("os randomness");

    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn same(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.bytes()
            .zip(b.bytes())
            .fold(0, |acc, (x, y)| acc | (x ^ y))
            == 0
}

fn refused(reason: &str) -> PairAnswer {
    PairAnswer::Refused {
        reason: reason.into(),
    }
}

impl Node {
    pub async fn issue(&self, minutes: u64) -> Pairing {
        let _ = timeout(ONLINE_TIMEOUT, self.0.endpoint.online()).await;

        let token = token();
        let expires = now() + minutes * 60_000;

        self.lock().pairing = Some(Pending {
            token: token.clone(),
            expires,
        });

        Pairing {
            code: match self.0.endpoint.addr().relay_urls().next() {
                Some(relay) => format!("{}.{token}.{relay}", self.id()),
                None => format!("{}.{token}", self.id()),
            },
            expires,
        }
    }

    pub fn cancel(&self) {
        self.lock().pairing = None;
    }

    pub async fn join(&self, code: &str) -> Result<String, String> {
        let mut parts = code.trim().splitn(3, '.');
        let (Some(id), Some(token)) = (parts.next(), parts.next()) else {
            return Err("pair_code_invalid:".into());
        };
        let mut issuer =
            EndpointAddr::new(parse_id(id).map_err(|_| "pair_code_invalid:".to_string())?);

        if let Some(relay) = parts.next().and_then(|r| r.parse().ok()) {
            issuer = issuer.with_relay_url(relay);
        }

        if id == self.id() {
            return Err("pair_self:".into());
        }

        let info = self.lock().info.clone();
        let ask = serde_json::to_vec(&PairAsk {
            token: token.into(),
            info,
        })
        .map_err(|e| e.to_string())?;
        let exchange = async {
            let conn = self
                .0
                .endpoint
                .connect(issuer.clone(), PAIR_ALPN)
                .await
                .map_err(|e| e.to_string())?;
            let (mut send, mut recv) = conn.open_bi().await.map_err(|e| e.to_string())?;

            send.write_all(&ask).await.map_err(|e| e.to_string())?;
            send.finish().map_err(|e| e.to_string())?;

            let bytes = recv
                .read_to_end(PAIR_LIMIT)
                .await
                .map_err(|e| e.to_string())?;

            conn.close(0u32.into(), b"paired");
            serde_json::from_slice::<PairAnswer>(&bytes).map_err(|e| e.to_string())
        };
        let answer = timeout(DIAL_TIMEOUT, exchange)
            .await
            .map_err(|_| "pair_unreachable:".to_string())?
            .map_err(fail("pair_unreachable"))?;

        match answer {
            PairAnswer::Refused { reason } => Err(reason),
            PairAnswer::Accepted { info, mut members } => {
                members.push(Member::fresh(id, info));
                self.merge(members);
                self.lock().retry.remove(id);
                spawn(self.clone().dial(id.to_string()));

                Ok(id.to_string())
            }
        }
    }

    pub(crate) async fn answer_pair(&self, conn: Connection) {
        let Ok((mut send, mut recv)) = conn.accept_bi().await else {
            return;
        };
        let Ok(bytes) = recv.read_to_end(PAIR_LIMIT).await else {
            return;
        };
        let peer = conn.remote_id().to_string();
        let answer = match serde_json::from_slice::<PairAsk>(&bytes) {
            Ok(ask) => self.consume(&peer, ask),
            Err(_) => refused("pair_code_invalid:"),
        };
        let Ok(bytes) = serde_json::to_vec(&answer) else {
            return;
        };

        let _ = send.write_all(&bytes).await;
        let _ = send.finish();
        let _ = conn.closed().await;
    }

    fn consume(&self, peer: &str, ask: PairAsk) -> PairAnswer {
        let (info, members) = {
            let mut state = self.lock();
            let Some(pending) = state.pairing.take_if(|p| same(&p.token, &ask.token)) else {
                return refused("pair_code_invalid:");
            };

            if pending.expires < now() {
                return refused("pair_expired:");
            }

            state
                .members
                .insert(peer.to_string(), Member::fresh(peer, ask.info));
            state.retry.remove(peer);

            (
                state.info.clone(),
                state.members.values().cloned().collect::<Vec<_>>(),
            )
        };

        let _ = self.0.events.send(Event::Paired {
            id: peer.to_string(),
        });
        self.broadcast_roster();
        self.announce();

        PairAnswer::Accepted { info, members }
    }
}
