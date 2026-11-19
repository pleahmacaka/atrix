use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use acp_harness::session::SessionPlan;
use process_wrap::std::ChildWrapper;
use serde::Serialize;
use serde_json::Value;
use tauri::State;
use tauri::ipc::Channel;

use crate::error::Result;
use crate::platform;

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Frame {
    Message { message: Value },
    Exit,
}

struct Agent {
    child: Mutex<Box<dyn ChildWrapper>>,
    stdin: Mutex<ChildStdin>,
    plan: SessionPlan,
}

impl Agent {
    fn kill(&self) {
        let _ = self.child.lock().unwrap().kill();
    }
}

#[derive(Default)]
pub struct Agents(Mutex<HashMap<String, Arc<Agent>>>);

impl Agents {
    fn get(&self, key: &str) -> Option<Arc<Agent>> {
        self.0.lock().unwrap().get(key).cloned()
    }

    fn remove(&self, key: &str) {
        if let Some(agent) = self.0.lock().unwrap().remove(key) {
            agent.kill();
        }
    }

    pub fn kill_all(&self) {
        for (_, agent) in self.0.lock().unwrap().drain() {
            agent.kill();
        }
    }

    pub fn plan(&self, key: &str) -> Option<SessionPlan> {
        self.get(key).map(|agent| agent.plan.clone())
    }

    pub fn spawn(
        &self,
        key: String,
        mut command: Command,
        plan: SessionPlan,
        channel: Channel<Frame>,
    ) -> Result<()> {
        self.remove(&key);

        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        let mut child = platform::tree(command).spawn()?;
        let stdin = child.stdin().take().ok_or("stdin unavailable")?;
        let stdout = child.stdout().take().ok_or("stdout unavailable")?;

        self.0.lock().unwrap().insert(
            key,
            Arc::new(Agent {
                child: Mutex::new(child),
                stdin: Mutex::new(stdin),
                plan,
            }),
        );

        thread::spawn(move || relay(BufReader::new(stdout), channel));

        Ok(())
    }
}

fn relay(stdout: impl BufRead, channel: Channel<Frame>) {
    for line in stdout.split(b'\n').map_while(std::io::Result::ok) {
        if let Ok(message) = serde_json::from_slice(&line) {
            let _ = channel.send(Frame::Message { message });
        }
    }

    let _ = channel.send(Frame::Exit);
}

#[tauri::command]
pub fn agent_send(agents: State<'_, Agents>, key: String, message: Value) -> Result<()> {
    let agent = agents.get(&key).ok_or("agent_closed")?;
    let mut line = serde_json::to_vec(&message)?;

    line.push(b'\n');

    let mut stdin = agent.stdin.lock().unwrap();

    stdin.write_all(&line)?;
    stdin.flush()?;

    Ok(())
}

#[tauri::command]
pub fn agent_close(agents: State<'_, Agents>, key: String) {
    agents.remove(&key);
}
