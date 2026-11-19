use n0_future::task::spawn;
use n0_future::time::{Duration, sleep};

use crate::wire::Frame;
use crate::{Event, Link, Member, Node, now};

const UNPAIR_GRACE: Duration = Duration::from_secs(1);

impl Node {
    pub fn peers(&self) -> Vec<Member> {
        let state = self.lock();
        let mut peers: Vec<Member> = state.members.values().cloned().collect();

        for peer in &mut peers {
            peer.online = state.links.contains_key(&peer.id);
        }

        peers.sort_by(|a, b| a.id.cmp(&b.id));
        peers
    }

    pub fn announce(&self) {
        let _ = self.0.events.send(Event::Peers {
            peers: self.peers(),
        });
    }

    fn drop_member(&self, id: &str) -> Option<Link> {
        let mut state = self.lock();

        if let Some(member) = state.members.get_mut(id) {
            member.removed = true;
            member.at = now();
        }

        state.links.remove(id)
    }

    pub(crate) fn forget(&self, id: &str) {
        if let Some(link) = self.drop_member(id) {
            link.conn.close(0u32.into(), b"unpaired");
        }

        self.announce();
    }

    pub fn unpair(&self, id: &str) {
        let link = self.drop_member(id);

        self.broadcast_roster();

        if let Some(link) = link {
            let _ = link.feed.send(Frame::Bye);

            spawn(async move {
                sleep(UNPAIR_GRACE).await;
                link.conn.close(0u32.into(), b"unpaired");
            });
        }

        self.announce();
    }

    pub(crate) fn trusted(&self, id: &str) -> bool {
        self.lock().members.get(id).is_some_and(|m| !m.removed)
    }

    pub(crate) fn roster(&self) -> Vec<Member> {
        self.lock().members.values().cloned().collect()
    }

    pub(crate) fn broadcast_roster(&self) {
        self.broadcast(Frame::Roster {
            members: self.roster(),
        });
    }

    pub(crate) fn merge(&self, incoming: Vec<Member>) {
        let me = self.id();
        let mut dropped = Vec::new();
        let changed = {
            let mut state = self.lock();
            let mut changed = false;

            for member in incoming {
                if member.id == me {
                    continue;
                }

                let known = state.members.get(&member.id);

                if known.is_some_and(|m| member.at <= m.at) {
                    continue;
                }

                let seen = known.map_or(0, |m| m.seen).max(member.seen);

                if member.removed {
                    dropped.extend(state.links.remove(&member.id));
                }

                state.members.insert(
                    member.id.clone(),
                    Member {
                        seen,
                        online: false,
                        ..member
                    },
                );
                changed = true;
            }

            changed
        };

        for link in dropped {
            link.conn.close(0u32.into(), b"unpaired");
        }

        if changed {
            self.broadcast_roster();
            self.announce();
        }
    }
}
