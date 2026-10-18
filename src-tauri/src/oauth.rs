//! One-shot loopback receiver for the OAuth redirect (RFC 8252 §7.3).
//! `oauth_listen` binds 127.0.0.1:0; `oauth_wait` serves exactly one redirect and closes.

use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::State;

#[derive(Default)]
pub struct Listeners(Mutex<HashMap<u16, TcpListener>>);

#[derive(Serialize, Default)]
pub struct OAuthRedirect {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

#[tauri::command]
pub fn oauth_listen(listeners: State<'_, Listeners>) -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listeners.0.lock().unwrap().insert(port, listener);
    Ok(port)
}

#[tauri::command]
pub async fn oauth_wait(
    listeners: State<'_, Listeners>,
    port: u16,
    timeout_secs: u64,
) -> Result<OAuthRedirect, String> {
    let listener = listeners
        .0
        .lock()
        .unwrap()
        .remove(&port)
        .ok_or("no sign-in listener on that port")?;
    // Clamped: an absurd value would overflow `Instant` (and panic = abort in release).
    let timeout = Duration::from_secs(timeout_secs.min(3600));
    // The listener moves into the task and is dropped (port closed) when it returns.
    tauri::async_runtime::spawn_blocking(move || wait(listener, timeout))
        .await
        .map_err(|e| e.to_string())?
}

fn wait(listener: TcpListener, timeout: Duration) -> Result<OAuthRedirect, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + timeout;
    loop {
        match listener.accept() {
            Ok((stream, _)) => {
                if let Some(redirect) = serve(stream) {
                    return Ok(redirect);
                }
            }
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err("timed out waiting for the sign-in redirect".into());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) if matches!(e.kind(), ErrorKind::ConnectionAborted | ErrorKind::Interrupted) => {}
            Err(e) => return Err(e.to_string()),
        }
    }
}

/// Handles one connection. Returns `None` for anything that isn't the redirect
/// (browser preconnects, `/favicon.ico`, stray requests) so the caller keeps waiting.
fn serve(mut stream: TcpStream) -> Option<OAuthRedirect> {
    stream.set_nonblocking(false).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok()?;

    // Read the whole header block so closing the socket doesn't reset the connection.
    let mut buf = Vec::with_capacity(1024);
    let mut chunk = [0u8; 1024];
    while !buf.windows(4).any(|w| w == b"\r\n\r\n") && buf.len() < 16 * 1024 {
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
        }
    }
    let head = String::from_utf8_lossy(&buf);
    let mut parts = head.lines().next()?.split_whitespace();
    let (method, target) = (parts.next()?, parts.next()?);
    let (path, query) = target.split_once('?').unwrap_or((target, ""));

    let redirect = parse_query(query);
    let is_redirect = redirect.code.is_some() || redirect.error.is_some();
    if method != "GET" || path == "/favicon.ico" || !is_redirect {
        respond(&mut stream, "404 Not Found", "text/plain; charset=utf-8", "Not found");
        return None;
    }
    respond(&mut stream, "200 OK", "text/html; charset=utf-8", &page(redirect.error.is_none()));
    Some(redirect)
}

fn respond(stream: &mut TcpStream, status: &str, content_type: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n\
         Cache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
    let _ = stream.shutdown(std::net::Shutdown::Write);
}

fn parse_query(query: &str) -> OAuthRedirect {
    let mut r = OAuthRedirect::default();
    for pair in query.split('&').filter(|p| !p.is_empty()) {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        let slot = match decode(k).as_str() {
            "code" => &mut r.code,
            "state" => &mut r.state,
            "error" => &mut r.error,
            _ => continue,
        };
        slot.get_or_insert_with(|| decode(v));
    }
    r
}

/// `application/x-www-form-urlencoded` decoding: `+` is a space, `%XX` is a byte.
fn decode(s: &str) -> String {
    fn hex(c: u8) -> Option<u8> {
        (c as char).to_digit(16).map(|d| d as u8)
    }
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => out.push(b' '),
            b'%' => match (b.get(i + 1).and_then(|&c| hex(c)), b.get(i + 2).and_then(|&c| hex(c))) {
                (Some(hi), Some(lo)) => {
                    out.push(hi << 4 | lo);
                    i += 2;
                }
                _ => out.push(b'%'),
            },
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn page(ok: bool) -> String {
    let (accent, message) = if ok {
        ("#2E9E6B", "You’re connected — you can close this tab and return to Daybloom.")
    } else {
        ("#F0A532", "Sign-in didn’t finish, and that’s okay. You can close this tab and try again from Daybloom whenever you like.")
    };
    format!(
        r#"<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Daybloom</title>
<style>
:root{{color-scheme:light dark;--bg:#F3F4F6;--fg:#1C2740;--muted:#5B6578;--ring:#DDE1E7}}
@media (prefers-color-scheme:dark){{:root{{--bg:#151B28;--fg:#EEF1F4;--muted:#A3ACBB;--ring:#2A3758}}}}
html,body{{height:100%;margin:0}}
body{{display:grid;place-items:center;background:var(--bg);color:var(--fg);
font:17px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}}
main{{max-width:26rem;padding:2rem;text-align:center}}
p{{margin:1.25rem 0 0;color:var(--muted)}}
</style></head><body><main>
<svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
<circle cx="28" cy="28" r="22" fill="none" stroke="var(--ring)" stroke-width="7"/>
<path d="M28 6a22 22 0 0 1 22 22" fill="none" stroke="{accent}" stroke-width="7" stroke-linecap="round"/>
</svg>
<p>{message}</p>
</main></body></html>"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_query() {
        let r = parse_query("state=a%2Fb+c&code=4%2F0Ab_x-y&scope=x&code=ignored");
        assert_eq!(r.code.as_deref(), Some("4/0Ab_x-y"));
        assert_eq!(r.state.as_deref(), Some("a/b c"));
        assert_eq!(r.error, None);
        assert_eq!(decode("100%"), "100%");
        assert_eq!(decode("%E2%80%94"), "—");
    }

    #[test]
    fn serves_one_redirect() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let addr = listener.local_addr().unwrap();
        let waiter = std::thread::spawn(move || wait(listener, Duration::from_secs(5)));
        let get = |target: &str| {
            let mut s = TcpStream::connect(addr).unwrap();
            write!(s, "GET {target} HTTP/1.1\r\nHost: {addr}\r\n\r\n").unwrap();
            let mut out = String::new();
            s.read_to_string(&mut out).unwrap();
            out
        };
        drop(TcpStream::connect(addr).unwrap()); // speculative preconnect
        assert!(get("/favicon.ico").starts_with("HTTP/1.1 404"));
        let page = get("/?state=s1&code=c%2F1");
        assert!(page.starts_with("HTTP/1.1 200") && page.contains("You’re connected"));
        let r = waiter.join().unwrap().unwrap();
        assert_eq!((r.code.as_deref(), r.state.as_deref()), (Some("c/1"), Some("s1")));
    }
}
