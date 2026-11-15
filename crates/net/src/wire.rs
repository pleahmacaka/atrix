use iroh::endpoint::{RecvStream, SendStream};
use serde::{Deserialize, Serialize};

use crate::{Info, Member};

pub(crate) const HOST_ALPN: &[u8] = b"atrix/host/1";

pub(crate) const PAIR_ALPN: &[u8] = b"atrix/pair/1";

pub(crate) const FRAME_LIMIT: usize = 64 << 20;

pub(crate) const PAIR_LIMIT: usize = 1 << 20;

#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "t", rename_all = "camelCase")]
pub(crate) enum Frame {
    Hello { info: Info },
    Roster { members: Vec<Member> },
    Data { data: String },
    Bye,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct PairAsk {
    pub(crate) token: String,
    pub(crate) info: Info,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase")]
pub(crate) enum PairAnswer {
    Accepted { info: Info, members: Vec<Member> },
    Refused { reason: String },
}

pub(crate) async fn write_frame(send: &mut SendStream, frame: &Frame) -> Result<(), String> {
    let bytes = serde_json::to_vec(frame).map_err(|e| e.to_string())?;

    send.write_all(&(bytes.len() as u32).to_be_bytes())
        .await
        .map_err(|e| e.to_string())?;
    send.write_all(&bytes).await.map_err(|e| e.to_string())
}

pub(crate) async fn read_frame(recv: &mut RecvStream) -> Option<Frame> {
    let mut size = [0u8; 4];

    recv.read_exact(&mut size).await.ok()?;

    let size = u32::from_be_bytes(size) as usize;

    if size > FRAME_LIMIT {
        return None;
    }

    let mut bytes = vec![0u8; size];

    recv.read_exact(&mut bytes).await.ok()?;
    serde_json::from_slice(&bytes).ok()
}
