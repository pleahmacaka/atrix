use std::rc::Rc;

use atrix_net::{Event, Info, Key, Member, Node};
use js_sys::Promise;
use tokio::sync::Mutex;
use tokio::sync::mpsc::UnboundedReceiver;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;

fn js(e: impl ToString) -> JsValue {
    JsValue::from_str(&e.to_string())
}

#[wasm_bindgen]
pub struct Net {
    node: Node,
    events: Rc<Mutex<UnboundedReceiver<Event>>>,
}

#[wasm_bindgen]
pub async fn start(secret: Option<Vec<u8>>, peers: String, info: String) -> Result<Net, JsValue> {
    let key = secret
        .and_then(|s| <[u8; 32]>::try_from(s.as_slice()).ok())
        .map_or_else(Key::generate, |b| Key::from_bytes(&b));
    let peers: Vec<Member> = serde_json::from_str(&peers).unwrap_or_default();
    let info: Info = serde_json::from_str(&info).map_err(js)?;
    let (node, events) = Node::start(key, peers, info).await.map_err(js)?;

    node.announce();

    Ok(Net {
        node,
        events: Rc::new(Mutex::new(events)),
    })
}

#[wasm_bindgen]
impl Net {
    pub fn id(&self) -> String {
        self.node.id()
    }

    pub fn secret(&self) -> Vec<u8> {
        self.node.secret().to_vec()
    }

    pub fn next_event(&self) -> Promise {
        let events = self.events.clone();

        future_to_promise(async move {
            let event = events
                .lock()
                .await
                .recv()
                .await
                .ok_or_else(|| js("net_stopped:"))?;

            serde_json::to_string(&event)
                .map(|s| JsValue::from_str(&s))
                .map_err(js)
        })
    }

    pub fn set_info(&self, info: String) -> Result<(), JsValue> {
        self.node.set_info(serde_json::from_str(&info).map_err(js)?);

        Ok(())
    }

    pub fn send(&self, to: Option<String>, data: String) -> Result<(), JsValue> {
        self.node.send(to.as_deref(), data).map_err(js)
    }

    pub fn request(&self, to: String, data: String) -> Promise {
        let node = self.node.clone();

        future_to_promise(async move {
            node.request(&to, data)
                .await
                .map(|s| JsValue::from_str(&s))
                .map_err(js)
        })
    }

    pub fn reply(&self, id: f64, data: String) {
        self.node.reply(id as u64, data);
    }

    pub fn issue(&self, minutes: f64) -> Promise {
        let node = self.node.clone();

        future_to_promise(async move {
            serde_json::to_string(&node.issue(minutes as u64).await)
                .map(|s| JsValue::from_str(&s))
                .map_err(js)
        })
    }

    pub fn cancel(&self) {
        self.node.cancel();
    }

    pub fn join(&self, code: String) -> Promise {
        let node = self.node.clone();

        future_to_promise(async move {
            node.join(&code)
                .await
                .map(|s| JsValue::from_str(&s))
                .map_err(js)
        })
    }

    pub fn unpair(&self, id: String) {
        self.node.unpair(&id);
    }
}
