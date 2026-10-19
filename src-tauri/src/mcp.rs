//! MCP addon: a small Model Context Protocol server, so AI tools (Claude, Codex, …) can read and
//! plan with your day.
//!
//! - Streamable HTTP on 127.0.0.1 only, behind a bearer token, refusing requests that come from
//!   web pages (an Origin that isn't local), as the MCP spec asks.
//! - The tools themselves live in the planner (src/lib/addons/mcp/tools.ts): each request is
//!   passed to the main window and answered there, so changes go through the same code as the
//!   app and show up at once.
//! - `daybloom --mcp` is a stdio relay for tools that launch a command (Codex, Claude Desktop):
//!   it reads JSON-RPC lines from stdin and forwards them to the running app.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

const IDENTIFIER: &str = "app.daybloom.desktop";
const PREFERRED_PORT: u16 = 7451;
const VERSIONS: [&str; 3] = ["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_BODY: usize = 1 << 20;

type Pending = Arc<Mutex<HashMap<u64, mpsc::Sender<Value>>>>;

#[derive(Default)]
pub struct Mcp {
    running: Mutex<Option<Running>>,
    pending: Pending,
    seq: Arc<AtomicU64>,
}

struct Running {
    port: u16,
    token: String,
    stop: Arc<AtomicBool>,
}

#[derive(Serialize)]
pub struct McpStatus {
    on: bool,
    port: u16,
    url: String,
    token: String,
    /// This app's executable and its arguments, for stdio setups (`daybloom --mcp`).
    exe: String,
    args: Vec<String>,
}

fn config_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("mcp.json"))
}

/// The same folder `app_data_dir` gives, without a running app (for the stdio relay).
fn config_path_standalone(identifier: &str) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    let base = std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library").join("Application Support"));
    #[cfg(windows)]
    let base = std::env::var_os("APPDATA").map(PathBuf::from);
    #[cfg(all(unix, not(target_os = "macos")))]
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share")));
    base.map(|b| b.join(identifier).join("mcp.json"))
}

fn new_token() -> String {
    let mut b = [0u8; 24];
    if getrandom::fill(&mut b).is_err() {
        // Practically never; still better than an empty token.
        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos();
        b[..16].copy_from_slice(&t.to_le_bytes());
    }
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn read_saved(path: &PathBuf) -> Option<(u16, String)> {
    let v: Value = serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()?;
    Some((v["port"].as_u64()? as u16, v["token"].as_str()?.to_string()))
}

fn write_saved(path: &PathBuf, port: u16, token: &str) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(path, json!({ "port": port, "token": token }).to_string());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
}

fn status(app: &AppHandle, r: Option<&Running>) -> McpStatus {
    let exe = std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_default();
    // A build with another identifier (a test build) tells the relay where to look.
    let id = &app.config().identifier;
    let args = if id == IDENTIFIER { vec!["--mcp".to_string()] } else { vec!["--mcp".to_string(), format!("--mcp-app={id}")] };
    match r {
        Some(r) => McpStatus { on: true, port: r.port, url: format!("http://127.0.0.1:{}/mcp", r.port), token: r.token.clone(), exe, args },
        None => {
            let saved = config_path(app).and_then(|p| read_saved(&p));
            McpStatus { on: false, port: saved.as_ref().map(|s| s.0).unwrap_or(0), url: String::new(), token: saved.map(|s| s.1).unwrap_or_default(), exe, args }
        }
    }
}

/// Start or stop the server. `rotate` makes a new token (old setups stop working).
fn set(app: &AppHandle, on: bool, rotate: bool) -> Result<McpStatus, String> {
    let state = app.state::<Mcp>();
    let mut guard = state.running.lock().unwrap();
    if let Some(r) = guard.take() {
        r.stop.store(true, Ordering::SeqCst);
        // Wake the accept loop so it sees the flag.
        let _ = TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], r.port)), Duration::from_millis(200));
    }
    if !on {
        return Ok(status(app, None));
    }
    let path = config_path(app).ok_or("no app data folder")?;
    let saved = read_saved(&path);
    let token = match (&saved, rotate) {
        (Some((_, t)), false) if t.len() >= 32 => t.clone(),
        _ => new_token(),
    };
    // Keep the same port when possible, so setups keep working across restarts.
    let wanted = saved.map(|s| s.0).filter(|p| *p > 0).unwrap_or(PREFERRED_PORT);
    let listener = TcpListener::bind(("127.0.0.1", wanted)).or_else(|_| TcpListener::bind(("127.0.0.1", 0))).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    write_saved(&path, port, &token);
    let stop = Arc::new(AtomicBool::new(false));
    let ctx = Ctx { app: app.clone(), token: token.clone(), pending: state.pending.clone(), seq: state.seq.clone(), sessions: Arc::default() };
    let flag = stop.clone();
    std::thread::Builder::new()
        .name("daybloom-mcp".into())
        .spawn(move || {
            for conn in listener.incoming() {
                if flag.load(Ordering::SeqCst) {
                    break;
                }
                let Ok(stream) = conn else { continue };
                let ctx = ctx.clone();
                std::thread::spawn(move || {
                    let _ = handle(stream, &ctx);
                });
            }
        })
        .map_err(|e| e.to_string())?;
    let r = Running { port, token, stop };
    let st = status(app, Some(&r));
    *guard = Some(r);
    Ok(st)
}

#[tauri::command]
pub async fn mcp_set(app: AppHandle, on: bool, rotate: Option<bool>) -> Result<McpStatus, String> {
    set(&app, on, rotate.unwrap_or(false))
}

#[tauri::command]
pub async fn mcp_status(app: AppHandle) -> McpStatus {
    let state = app.state::<Mcp>();
    let guard = state.running.lock().unwrap();
    status(&app, guard.as_ref())
}

/// The planner's answer to a request it was handed: `{ result }` or `{ error }`.
#[tauri::command]
pub fn mcp_reply(app: AppHandle, id: u64, answer: Value) {
    if let Some(tx) = app.state::<Mcp>().pending.lock().unwrap().remove(&id) {
        let _ = tx.send(answer);
    }
}

#[derive(Clone)]
struct Ctx {
    app: AppHandle,
    token: String,
    pending: Pending,
    seq: Arc<AtomicU64>,
    /// Session id → the AI app's name (from `initialize`), newest last; kept short.
    sessions: Arc<Mutex<Vec<(String, String)>>>,
}

impl Ctx {
    fn client_of(&self, session: Option<&str>) -> String {
        let Some(id) = session else { return String::new() };
        self.sessions.lock().unwrap().iter().find(|(s, _)| s == id).map(|(_, n)| n.clone()).unwrap_or_default()
    }
}

struct Request {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

fn read_request(stream: &mut TcpStream) -> Option<Request> {
    stream.set_read_timeout(Some(Duration::from_secs(15))).ok()?;
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    let mut parts = line.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();
    let mut headers = HashMap::new();
    loop {
        let mut h = String::new();
        if reader.read_line(&mut h).ok()? == 0 {
            break;
        }
        let h = h.trim_end();
        if h.is_empty() {
            break;
        }
        if let Some((k, v)) = h.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }
    let len: usize = headers.get("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
    if len > MAX_BODY {
        return None;
    }
    let mut body = vec![0; len];
    reader.read_exact(&mut body).ok()?;
    Some(Request { method, path, headers, body })
}

fn respond(stream: &mut TcpStream, code: u16, reason: &str, body: Option<&str>) -> std::io::Result<()> {
    respond_with(stream, code, reason, body, None)
}

fn respond_with(stream: &mut TcpStream, code: u16, reason: &str, body: Option<&str>, session: Option<&str>) -> std::io::Result<()> {
    let b = body.unwrap_or("");
    let ct = if body.is_some() { "Content-Type: application/json\r\n" } else { "" };
    let sid = session.map(|s| format!("Mcp-Session-Id: {s}\r\n")).unwrap_or_default();
    write!(stream, "HTTP/1.1 {code} {reason}\r\n{ct}{sid}Content-Length: {}\r\nConnection: close\r\n\r\n{b}", b.len())?;
    stream.flush()
}

/// Requests from a web page carry its Origin; only local origins (or none) are let in.
fn origin_ok(o: Option<&String>) -> bool {
    match o {
        None => true,
        Some(o) => {
            let host = o.split("://").nth(1).unwrap_or("").split(['/', ':']).next().unwrap_or("");
            host == "127.0.0.1" || host == "localhost" || host == "[::1]"
        }
    }
}

fn handle(mut stream: TcpStream, ctx: &Ctx) -> std::io::Result<()> {
    let Some(req) = read_request(&mut stream) else { return respond(&mut stream, 400, "Bad Request", None) };
    if req.path.split('?').next() != Some("/mcp") {
        return respond(&mut stream, 404, "Not Found", None);
    }
    if !origin_ok(req.headers.get("origin")) {
        return respond(&mut stream, 403, "Forbidden", None);
    }
    let auth = req.headers.get("authorization").map(|s| s.as_str()).unwrap_or("");
    if auth.strip_prefix("Bearer ").map(str::trim) != Some(ctx.token.as_str()) {
        return respond(&mut stream, 401, "Unauthorized", Some(r#"{"error":"Daybloom: missing or wrong token. Copy a fresh setup from the MCP addon."}"#));
    }
    if req.method != "POST" {
        return respond(&mut stream, 405, "Method Not Allowed", None);
    }
    let Ok(msg) = serde_json::from_slice::<Value>(&req.body) else {
        return respond(&mut stream, 400, "Bad Request", Some(&rpc_error(Value::Null, -32700, "Parse error").to_string()));
    };
    let mut session = req.headers.get("mcp-session-id").cloned();
    match answer(ctx, &msg, &mut session) {
        Some(v) => respond_with(&mut stream, 200, "OK", Some(&v.to_string()), session.as_deref()),
        None => respond(&mut stream, 202, "Accepted", None),
    }
}

fn rpc_error(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

/// One JSON-RPC message (or a batch) → its response; None for notifications. `initialize`
/// starts a session (its id goes back in the Mcp-Session-Id header).
fn answer(ctx: &Ctx, msg: &Value, session: &mut Option<String>) -> Option<Value> {
    if let Some(batch) = msg.as_array() {
        let out: Vec<Value> = batch.iter().filter_map(|m| answer(ctx, m, session)).collect();
        return (!out.is_empty()).then_some(Value::Array(out));
    }
    let id = msg.get("id").cloned();
    let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
    let id = id?; // notifications (initialized, cancelled, …) need no answer
    let params = msg.get("params").cloned().unwrap_or(json!({}));
    let ok = |result: Value| json!({ "jsonrpc": "2.0", "id": id.clone(), "result": result });
    match method {
        "initialize" => {
            let asked = params["protocolVersion"].as_str().unwrap_or("");
            let version = if VERSIONS.contains(&asked) { asked } else { VERSIONS[0] };
            let client: String = params["clientInfo"]["name"].as_str().unwrap_or("").chars().take(60).collect();
            let id = new_token()[..32].to_string();
            {
                let mut list = ctx.sessions.lock().unwrap();
                list.push((id.clone(), client.clone()));
                let extra = list.len().saturating_sub(64);
                list.drain(..extra);
            }
            *session = Some(id);
            let _ = ctx.app.emit_to("main", "daybloom://mcp-client", json!({ "name": client }));
            Some(ok(json!({
                "protocolVersion": version,
                "capabilities": { "tools": { "listChanged": false } },
                "serverInfo": { "name": "daybloom", "title": "Daybloom", "version": ctx.app.package_info().version.to_string() },
                "instructions": "Daybloom is a visual day planner. Blocks are tasks with a day, a start (HH:MM) and a length in minutes; the backlog holds tasks without a day. Read the day before planning, prefer free time, and keep changes small and clear.",
            })))
        }
        "ping" => Some(ok(json!({}))),
        "tools/list" | "tools/call" => Some(match ask_planner(ctx, method, &params, &ctx.client_of(session.as_deref())) {
            Ok(v) => ok(v),
            Err(e) => rpc_error(id, -32603, &e),
        }),
        "resources/list" => Some(ok(json!({ "resources": [] }))),
        "prompts/list" => Some(ok(json!({ "prompts": [] }))),
        _ => Some(rpc_error(id, -32601, "Method not found")),
    }
}

fn ask_planner(ctx: &Ctx, method: &str, params: &Value, client: &str) -> Result<Value, String> {
    let n = ctx.seq.fetch_add(1, Ordering::SeqCst) + 1;
    let (tx, rx) = mpsc::channel();
    ctx.pending.lock().unwrap().insert(n, tx);
    let sent = ctx.app.emit_to("main", "daybloom://mcp", json!({ "id": n, "method": method, "params": params, "client": client }));
    if let Err(e) = sent {
        ctx.pending.lock().unwrap().remove(&n);
        return Err(e.to_string());
    }
    let res = rx.recv_timeout(Duration::from_secs(20));
    ctx.pending.lock().unwrap().remove(&n);
    let v = res.map_err(|_| "Daybloom didn't answer in time. Is the planner open?".to_string())?;
    match v.get("error").and_then(Value::as_str) {
        Some(e) => Err(e.to_string()),
        None => Ok(v.get("result").cloned().unwrap_or(Value::Null)),
    }
}

// ---- stdio relay: `daybloom --mcp` ---------------------------------------------------------

fn post(port: u16, token: &str, body: &str, session: &mut Option<String>) -> Result<Option<String>, String> {
    let mut s = TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], port)), Duration::from_secs(3)).map_err(|_| "Daybloom isn't running. Open it, and switch on the MCP addon.".to_string())?;
    s.set_read_timeout(Some(Duration::from_secs(30))).ok();
    let sid = session.as_ref().map(|s| format!("Mcp-Session-Id: {s}\r\n")).unwrap_or_default();
    write!(
        s,
        "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\n{sid}Content-Type: application/json\r\nAccept: application/json, text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
    .map_err(|e| e.to_string())?;
    let mut raw = String::new();
    s.read_to_string(&mut raw).map_err(|e| e.to_string())?;
    let (head, rest) = raw.split_once("\r\n\r\n").unwrap_or((&raw, ""));
    let code: u16 = head.split_whitespace().nth(1).and_then(|c| c.parse().ok()).unwrap_or(0);
    if let Some(id) = head.lines().find_map(|l| l.split_once(':').filter(|(k, _)| k.trim().eq_ignore_ascii_case("mcp-session-id")).map(|(_, v)| v.trim().to_string())) {
        *session = Some(id);
    }
    match code {
        200 => Ok(Some(rest.to_string())),
        202 => Ok(None),
        401 => Err("Daybloom refused the token. Open the MCP addon and copy the setup again.".into()),
        c => Err(format!("Daybloom answered {c}.")),
    }
}

/// Read JSON-RPC lines from stdin, forward each to the running app, write the answers to stdout.
/// `args` are the command line: `--mcp-app=<identifier>` points at another build's data.
pub fn stdio_relay(args: &[String]) {
    let identifier = args
        .iter()
        .find_map(|a| a.strip_prefix("--mcp-app="))
        .filter(|id| !id.is_empty() && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-'))
        .unwrap_or(IDENTIFIER)
        .to_string();
    let stdin = std::io::stdin();
    let mut out = std::io::stdout();
    let mut session = None;
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let id = serde_json::from_str::<Value>(line).ok().and_then(|v| v.get("id").cloned());
        let cfg = config_path_standalone(&identifier).and_then(|p| read_saved(&p));
        let res = match &cfg {
            Some((port, token)) => post(*port, token, line, &mut session),
            None => Err("Daybloom's MCP addon isn't set up yet. Open Daybloom › Addons › MCP and switch it on.".into()),
        };
        match res {
            Ok(Some(body)) => {
                let _ = writeln!(out, "{}", body.trim());
            }
            Ok(None) => {}
            Err(e) => {
                if let Some(id) = id {
                    let _ = writeln!(out, "{}", rpc_error(id, -32000, &e));
                }
            }
        }
        let _ = out.flush();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_local_origins() {
        assert!(origin_ok(None));
        assert!(origin_ok(Some(&"http://localhost:3000".into())));
        assert!(origin_ok(Some(&"http://127.0.0.1".into())));
        assert!(!origin_ok(Some(&"https://evil.example".into())));
        assert!(!origin_ok(Some(&"http://localhost.evil.example".into())));
    }

    #[test]
    fn tokens_are_long_and_fresh() {
        let a = new_token();
        assert_eq!(a.len(), 48);
        assert_ne!(a, new_token());
    }
}
