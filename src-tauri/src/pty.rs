use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;

use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Manager, State};

use crate::error::Result;
#[cfg(windows)]
use crate::process;

struct Pty {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct Ptys(Mutex<HashMap<String, Arc<Mutex<Pty>>>>);

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn shell() -> CommandBuilder {
    #[cfg(windows)]
    if let Some(program) = process::which("pwsh").or_else(|| process::which("powershell")) {
        return CommandBuilder::new(program);
    }

    CommandBuilder::new_default_prog()
}

fn relay(mut reader: Box<dyn Read + Send>, channel: Channel<InvokeResponseBody>) {
    let mut buffer = [0u8; 16 * 1024];

    while let Ok(read) = reader.read(&mut buffer) {
        if read == 0
            || channel
                .send(InvokeResponseBody::Raw(buffer[..read].to_vec()))
                .is_err()
        {
            break;
        }
    }

    let _ = channel.send(InvokeResponseBody::Raw(Vec::new()));
}

impl Ptys {
    fn get(&self, id: &str) -> Result<Arc<Mutex<Pty>>> {
        self.0.lock()?.get(id).cloned().ok_or("pty_closed".into())
    }

    fn remove(&self, id: &str) -> Result<Option<Arc<Mutex<Pty>>>> {
        Ok(self.0.lock()?.remove(id))
    }

    pub fn kill_all(&self) {
        let Ok(mut map) = self.0.lock() else {
            return;
        };

        for (_, pty) in map.drain() {
            if let Ok(mut pty) = pty.lock() {
                let _ = pty.killer.kill();
            }
        }
    }
}

#[tauri::command]
pub fn pty_open(
    app: AppHandle,
    ptys: State<'_, Ptys>,
    id: String,
    cwd: String,
    cols: u16,
    rows: u16,
    channel: Channel<InvokeResponseBody>,
) -> Result<()> {
    let pair = native_pty_system()
        .openpty(size(cols, rows))
        .map_err(|e| e.to_string())?;
    let mut command = shell();

    if !cwd.is_empty() {
        command.cwd(cwd);
    }

    command.env("TERM", "xterm-256color");

    let mut child = pair
        .slave
        .spawn_command(command)
        .map_err(|e| e.to_string())?;
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let pty = Pty {
        master: pair.master,
        writer,
        killer: child.clone_killer(),
    };

    drop(pair.slave);

    if let Some(old) = ptys.0.lock()?.insert(id.clone(), Arc::new(Mutex::new(pty))) {
        let _ = old.lock()?.killer.kill();
    }

    thread::spawn(move || relay(reader, channel));
    thread::spawn(move || {
        let _ = child.wait();
        let _ = app.state::<Ptys>().remove(&id);
    });

    Ok(())
}

#[tauri::command]
pub fn pty_write(ptys: State<'_, Ptys>, id: String, data: String) -> Result<()> {
    let pty = ptys.get(&id)?;
    let mut pty = pty.lock()?;

    pty.writer.write_all(data.as_bytes())?;
    pty.writer.flush()?;

    Ok(())
}

#[tauri::command]
pub fn pty_resize(ptys: State<'_, Ptys>, id: String, cols: u16, rows: u16) -> Result<()> {
    ptys.get(&id)?
        .lock()?
        .master
        .resize(size(cols, rows))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn pty_close(ptys: State<'_, Ptys>, id: String) -> Result<()> {
    if let Some(pty) = ptys.remove(&id)? {
        pty.lock()?.killer.kill()?;
    }

    Ok(())
}
