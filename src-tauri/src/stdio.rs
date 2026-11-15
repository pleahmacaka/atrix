use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::TcpStream;

use serde_json::Value;

pub const FLAG: &str = "--mcp-stdio";

struct Reply {
    status: u16,
    session: Option<String>,
    body: String,
}

fn post(port: &str, token: &str, session: Option<&str>, body: &str) -> io::Result<Reply> {
    let mut stream = TcpStream::connect(("127.0.0.1", port.parse().unwrap_or(0)))?;
    let mut head = format!(
        "POST /mcp HTTP/1.0\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\nContent-Length: {}\r\n",
        body.len()
    );

    if let Some(session) = session {
        head.push_str(&format!("Mcp-Session-Id: {session}\r\n"));
    }

    head.push_str("\r\n");
    stream.write_all(head.as_bytes())?;
    stream.write_all(body.as_bytes())?;

    let mut reader = BufReader::new(stream);
    let mut line = String::new();

    reader.read_line(&mut line)?;

    let status = line
        .split(' ')
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let mut length = None;
    let mut session = None;

    loop {
        line.clear();

        if reader.read_line(&mut line)? == 0 || line.trim().is_empty() {
            break;
        }

        if let Some((key, value)) = line.split_once(':') {
            let value = value.trim().to_owned();

            if key.eq_ignore_ascii_case("content-length") {
                length = value.parse::<usize>().ok();
            } else if key.eq_ignore_ascii_case("mcp-session-id") {
                session = Some(value);
            }
        }
    }

    let mut bytes = Vec::new();

    match length {
        Some(n) => {
            bytes.resize(n, 0);
            reader.read_exact(&mut bytes)?;
        }
        None => {
            reader.read_to_end(&mut bytes)?;
        }
    }

    Ok(Reply {
        status,
        session,
        body: String::from_utf8_lossy(&bytes).into_owned(),
    })
}

fn failure(id: &Value, message: String) -> String {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": -32603, "message": message },
    })
    .to_string()
}

fn messages(body: &str) -> Vec<String> {
    let events: Vec<&str> = body
        .lines()
        .filter_map(|l| l.strip_prefix("data:"))
        .collect();
    let payloads = if events.is_empty() {
        vec![body]
    } else {
        events
    };

    payloads
        .into_iter()
        .filter_map(|p| serde_json::from_str::<Value>(p.trim()).ok())
        .map(|v| v.to_string())
        .collect()
}

pub fn run() {
    let port = std::env::var("ATRIX_MCP_PORT").unwrap_or_default();
    let token = std::env::var("ATRIX_MCP_TOKEN").unwrap_or_default();
    let mut session: Option<String> = None;
    let mut out = io::stdout();

    for line in io::stdin().lock().lines() {
        let Ok(line) = line else { break };

        if line.trim().is_empty() {
            continue;
        }

        let id = serde_json::from_str::<Value>(&line)
            .ok()
            .and_then(|v| v.get("id").cloned());
        let reply = post(&port, &token, session.as_deref(), &line);
        let messages = match (reply, &id) {
            (Ok(reply), _) if (200..300).contains(&reply.status) => {
                session = reply.session.or(session);

                messages(&reply.body)
            }
            (Ok(reply), Some(id)) => vec![failure(
                id,
                format!("atrix bridge returned {}", reply.status),
            )],
            (Err(e), Some(id)) => vec![failure(id, format!("atrix bridge unreachable: {e}"))],
            _ => Vec::new(),
        };

        for message in messages {
            let _ = writeln!(out, "{message}");
        }

        let _ = out.flush();
    }
}
