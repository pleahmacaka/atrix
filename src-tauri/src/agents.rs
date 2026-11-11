use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use tauri::ipc::Channel;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Deserialize)]
pub struct Launch {
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Frame {
    Message { message: Value },
    Exit,
}

struct Agent {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
}

#[derive(Default)]
pub struct Agents(Mutex<HashMap<String, Arc<Agent>>>);

impl Agents {
    fn get(&self, key: &str) -> Option<Arc<Agent>> {
        self.0.lock().unwrap().get(key).cloned()
    }

    fn remove(&self, key: &str) {
        if let Some(agent) = self.0.lock().unwrap().remove(key) {
            let _ = agent.child.lock().unwrap().kill();
        }
    }

    pub fn kill_all(&self) {
        for (_, agent) in self.0.lock().unwrap().drain() {
            let _ = agent.child.lock().unwrap().kill();
        }
    }
}

fn command(launch: &Launch) -> Result<Command, String> {
    let program = which::which(&launch.command)
        .map_err(|_| format!("command_not_found:{}", launch.command))?;
    let mut command = Command::new(program);

    command
        .args(&launch.args)
        .envs(&launch.env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        command.creation_flags(CREATE_NO_WINDOW);
    }

    Ok(command)
}

#[tauri::command]
pub fn agent_spawn(
    agents: State<'_, Agents>,
    key: String,
    launch: Launch,
    channel: Channel<Frame>,
) -> Result<(), String> {
    agents.remove(&key);

    let mut child = command(&launch)?.spawn().map_err(|e| e.to_string())?;
    let stdin = child.stdin.take().ok_or("stdin unavailable")?;
    let stdout = child.stdout.take().ok_or("stdout unavailable")?;

    agents.0.lock().unwrap().insert(
        key,
        Arc::new(Agent {
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
        }),
    );

    thread::spawn(move || {
        let mut lines = BufReader::new(stdout);
        let mut line = Vec::new();

        while lines.read_until(b'\n', &mut line).is_ok_and(|n| n > 0) {
            if let Ok(message) = serde_json::from_slice(&line) {
                let _ = channel.send(Frame::Message { message });
            }

            line.clear();
        }

        let _ = channel.send(Frame::Exit);
    });

    Ok(())
}

#[tauri::command]
pub fn agent_send(agents: State<'_, Agents>, key: String, message: Value) -> Result<(), String> {
    let agent = agents.get(&key).ok_or("agent_closed")?;
    let mut line = serde_json::to_vec(&message).map_err(|e| e.to_string())?;

    line.push(b'\n');

    let mut stdin = agent.stdin.lock().unwrap();

    stdin.write_all(&line).map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn agent_close(agents: State<'_, Agents>, key: String) {
    agents.remove(&key);
}

#[tauri::command]
pub fn installed_commands(names: Vec<String>) -> Vec<String> {
    names
        .into_iter()
        .filter(|n| which::which(n).is_ok())
        .collect()
}
