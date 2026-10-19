//! On-device weights store for the Needle assistant model (Cactus Compute, Apache-2.0).
//!
//! The weights are not bundled. They download once, only when the user asks, from a pinned
//! Hugging Face revision into `app_data_dir()/models/`, and are SHA-256 verified before they
//! are kept, and again on the first read of each launch. Inference itself runs in the webview
//! (WebAssembly in a worker, see src/lib/assistant/engine.svelte.ts); this module only fetches,
//! verifies, serves and deletes the file.
//!
//!   assistant_weights_status(sha256?, bytes?) -> { present, bytes }
//!   assistant_weights_download(url, sha256, bytes) -> ()   emits `daybloom://needle-progress`
//!   assistant_weights_read(sha256?) -> raw bytes (an ArrayBuffer in JS, not a JSON array)
//!   assistant_weights_forget() -> ()                        also cancels a running download

use std::fs::{self, File};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};

use reqwest::redirect::Policy;
use reqwest::Url;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};

const FILE: &str = "needle3.cact";
const PROGRESS_EVENT: &str = "daybloom://needle-progress";
/// The only place a model may come from (the redirect target is checked separately).
const SOURCE_PREFIX: &str = "/Cactus-Compute/";
/// Sanity ceiling; the pinned model is ~35 MB.
const MAX_BYTES: u64 = 512 * 1024 * 1024;
const NOT_DOWNLOADED: &str = "weights not downloaded";
const MISMATCH: &str = "hash mismatch: the model file does not match its pinned SHA-256";

#[derive(Default)]
pub struct Weights {
    downloading: AtomicBool,
    cancel: AtomicBool,
    /// The file already hashed this launch, so later reads skip re-hashing it.
    verified: Mutex<Option<Fingerprint>>,
}

#[derive(Clone, PartialEq)]
struct Fingerprint {
    len: u64,
    modified: Option<SystemTime>,
    sha256: String,
}

#[derive(Serialize)]
pub struct WeightsStatus {
    present: bool,
    bytes: u64,
}

#[derive(Serialize, Clone)]
struct Progress {
    received: u64,
    total: u64,
}

struct Paths {
    file: PathBuf,
    part: PathBuf,
    /// Hex SHA-256 of `file`, written once the download verified.
    hash: PathBuf,
}

fn paths(app: &AppHandle) -> Result<Paths, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("models");
    Ok(Paths {
        file: dir.join(FILE),
        part: dir.join(format!("{FILE}.part")),
        hash: dir.join(format!("{FILE}.sha256")),
    })
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn check_hash(sha256: &str) -> Result<String, String> {
    let h = sha256.trim().to_ascii_lowercase();
    if h.len() == 64 && h.bytes().all(|b| b.is_ascii_hexdigit()) {
        Ok(h)
    } else {
        Err("invalid SHA-256".into())
    }
}

fn stored_hash(p: &Paths) -> Option<String> {
    fs::read_to_string(&p.hash).ok().and_then(|s| check_hash(&s).ok())
}

/// Starting URL: https://huggingface.co/Cactus-Compute/… and nothing else.
fn check_source(url: &str) -> Result<Url, String> {
    let u = Url::parse(url).map_err(|_| "invalid model URL".to_string())?;
    let ok = u.scheme() == "https"
        && u.host_str() == Some("huggingface.co")
        && u.port().is_none()
        && u.username().is_empty()
        && u.password().is_none()
        && u.path().starts_with(SOURCE_PREFIX);
    if ok {
        Ok(u)
    } else {
        Err(format!("refusing to download a model from {url}: only https://huggingface.co{SOURCE_PREFIX} is allowed"))
    }
}

/// Hugging Face answers `resolve/` with a 302 to its CDN (e.g. us.aws.cdn.hf.co).
fn is_hf_host(u: &Url) -> bool {
    u.scheme() == "https"
        && u.username().is_empty()
        && u.password().is_none()
        && match u.host_str() {
            Some(h) => {
                h == "huggingface.co" || h == "hf.co" || h.ends_with(".huggingface.co") || h.ends_with(".hf.co")
            }
            None => false,
        }
}

fn remove_quiet(path: &Path) -> std::io::Result<()> {
    match fs::remove_file(path) {
        Err(e) if e.kind() != ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

/// `{ present, bytes }`. Present means the file exists with the expected size and was
/// verified against the expected hash when it was downloaded.
#[tauri::command]
pub fn assistant_weights_status(
    app: AppHandle,
    sha256: Option<String>,
    bytes: Option<u64>,
) -> Result<WeightsStatus, String> {
    let p = paths(&app)?;
    let len = match fs::metadata(&p.file) {
        Ok(m) if m.is_file() => m.len(),
        _ => return Ok(WeightsStatus { present: false, bytes: 0 }),
    };
    let hash_ok = match (sha256.as_deref().map(check_hash).transpose()?, stored_hash(&p)) {
        (Some(want), Some(have)) => want == have,
        (None, Some(_)) => true,
        (_, None) => false,
    };
    let present = len > 0 && bytes.map_or(true, |b| b == len) && hash_ok;
    Ok(WeightsStatus { present, bytes: len })
}

struct Busy<'a>(&'a AtomicBool);
impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// Streams the model to `models/needle3.cact.part`, verifies size and SHA-256, then renames
/// it into place. Progress goes out as `daybloom://needle-progress` {received, total} at most
/// ~10 times a second.
#[tauri::command]
pub async fn assistant_weights_download(
    app: AppHandle,
    state: State<'_, Weights>,
    url: String,
    sha256: String,
    bytes: u64,
) -> Result<(), String> {
    let url = check_source(&url)?;
    let sha256 = check_hash(&sha256)?;
    if bytes == 0 || bytes > MAX_BYTES {
        return Err("unexpected model size".into());
    }
    if state.downloading.swap(true, Ordering::SeqCst) {
        return Err("the model is already downloading".into());
    }
    let _busy = Busy(&state.downloading);
    state.cancel.store(false, Ordering::SeqCst);

    let p = paths(&app)?;
    let emit = |received: u64| {
        let _ = app.emit(PROGRESS_EVENT, Progress { received, total: bytes });
    };
    let result = download(&emit, &state, &p, url, &sha256, bytes).await;
    if result.is_err() {
        let _ = fs::remove_file(&p.part);
    }
    result
}

async fn download(
    emit: &(dyn Fn(u64) + Sync),
    state: &Weights,
    p: &Paths,
    url: Url,
    sha256: &str,
    total: u64,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 10 {
                attempt.error("too many redirects")
            } else if is_hf_host(attempt.url()) {
                attempt.follow()
            } else {
                let host = attempt.url().host_str().unwrap_or("?").to_string();
                attempt.error(format!("refusing a redirect to {host}"))
            }
        }))
        .connect_timeout(Duration::from_secs(20))
        .read_timeout(Duration::from_secs(60))
        .user_agent(concat!("Daybloom/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;

    let net = |e: reqwest::Error| format!("download failed: {e}");
    let mut resp = client.get(url).send().await.map_err(net)?;
    if !resp.status().is_success() {
        return Err(format!("download failed: HTTP {}", resp.status().as_u16()));
    }
    if !is_hf_host(resp.url()) {
        return Err("download failed: unexpected host".into());
    }
    if let Some(len) = resp.content_length() {
        if len != total {
            return Err(format!("download failed: expected {total} bytes, the server offered {len}"));
        }
    }

    let io = |e: std::io::Error| format!("could not save the model: {e}");
    if let Some(dir) = p.part.parent() {
        fs::create_dir_all(dir).map_err(io)?;
    }
    let mut file = File::create(&p.part).map_err(io)?;
    let mut hasher = Sha256::new();
    let mut received = 0u64;
    emit(0);
    let mut last = Instant::now();
    while let Some(chunk) = resp.chunk().await.map_err(net)? {
        if state.cancel.load(Ordering::SeqCst) {
            return Err("download cancelled".into());
        }
        received += chunk.len() as u64;
        if received > total {
            return Err("download failed: larger than expected".into());
        }
        hasher.update(&chunk);
        file.write_all(&chunk).map_err(io)?;
        if last.elapsed() >= Duration::from_millis(100) {
            emit(received);
            last = Instant::now();
        }
    }
    if received != total {
        return Err(format!("download incomplete ({received} of {total} bytes)"));
    }
    emit(received);
    if hex(&hasher.finalize()) != sha256 {
        return Err(MISMATCH.into());
    }
    file.sync_all().map_err(io)?;
    drop(file);
    if state.cancel.load(Ordering::SeqCst) {
        return Err("download cancelled".into());
    }

    fs::rename(&p.part, &p.file).map_err(io)?;
    let tmp = p.hash.with_extension("sha256.tmp");
    fs::write(&tmp, sha256).map_err(io)?;
    fs::rename(&tmp, &p.hash).map_err(io)?;

    let modified = fs::metadata(&p.file).and_then(|m| m.modified()).ok();
    *state.verified.lock().unwrap() = Some(Fingerprint { len: total, modified, sha256: sha256.into() });
    Ok(())
}

/// The verified weights as raw bytes (an ArrayBuffer on the JS side). The first read of a
/// launch re-hashes the file; a mismatch deletes it so it can be downloaded again.
#[tauri::command]
pub async fn assistant_weights_read(
    app: AppHandle,
    state: State<'_, Weights>,
    sha256: Option<String>,
) -> Result<tauri::ipc::Response, String> {
    let p = paths(&app)?;
    let expected = match sha256 {
        Some(h) => check_hash(&h)?,
        None => stored_hash(&p).ok_or(NOT_DOWNLOADED)?,
    };
    let known = state.verified.lock().unwrap().clone();
    let (bytes, fp) = tauri::async_runtime::spawn_blocking(move || -> Result<(Vec<u8>, Fingerprint), String> {
        let missing = |e: std::io::Error| {
            if e.kind() == ErrorKind::NotFound {
                NOT_DOWNLOADED.to_string()
            } else {
                format!("could not read the model: {e}")
            }
        };
        let meta = fs::metadata(&p.file).map_err(missing)?;
        let bytes = fs::read(&p.file).map_err(missing)?;
        let fp = Fingerprint { len: bytes.len() as u64, modified: meta.modified().ok(), sha256: expected.clone() };
        if known.as_ref() != Some(&fp) && hex(&Sha256::digest(&bytes)) != expected {
            let _ = remove_quiet(&p.file);
            let _ = remove_quiet(&p.hash);
            return Err(MISMATCH.into());
        }
        Ok((bytes, fp))
    })
    .await
    .map_err(|e| e.to_string())??;
    *state.verified.lock().unwrap() = Some(fp);
    Ok(tauri::ipc::Response::new(bytes))
}

/// Deletes the weights (and any partial download, which is cancelled).
#[tauri::command]
pub fn assistant_weights_forget(app: AppHandle, state: State<'_, Weights>) -> Result<(), String> {
    if state.downloading.load(Ordering::SeqCst) {
        state.cancel.store(true, Ordering::SeqCst);
    }
    *state.verified.lock().unwrap() = None;
    let p = paths(&app)?;
    remove_quiet(&p.file).map_err(|e| e.to_string())?;
    remove_quiet(&p.hash).map_err(|e| e.to_string())?;
    // A running download still holds the .part open (Windows can't delete it yet); it
    // removes the file itself when it notices the cancel.
    let _ = remove_quiet(&p.part);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_pinned_org_is_a_source() {
        assert!(check_source("https://huggingface.co/Cactus-Compute/needle3/resolve/abc/needle3.cact").is_ok());
        assert!(check_source("http://huggingface.co/Cactus-Compute/x").is_err());
        assert!(check_source("https://huggingface.co/someone/x").is_err());
        assert!(check_source("https://huggingface.co/Cactus-Compute/../evil/x").is_err());
        assert!(check_source("https://huggingface.co.evil.com/Cactus-Compute/x").is_err());
        assert!(check_source("https://user@huggingface.co/Cactus-Compute/x").is_err());
        assert!(check_source("https://huggingface.co:8443/Cactus-Compute/x").is_err());
    }

    #[test]
    fn redirects_stay_on_hugging_face() {
        let ok = |s: &str| is_hf_host(&Url::parse(s).unwrap());
        assert!(ok("https://us.aws.cdn.hf.co/xet-bridge-us/abc"));
        assert!(ok("https://cdn-lfs.huggingface.co/x"));
        assert!(ok("https://huggingface.co/api/x"));
        assert!(!ok("http://us.aws.cdn.hf.co/x"));
        assert!(!ok("https://evilhf.co/x"));
        assert!(!ok("https://hf.co.evil.com/x"));
    }

    /// Real download of the pinned model (35 MB): `cargo test --lib assistant -- --ignored`.
    #[test]
    #[ignore]
    fn downloads_and_verifies_the_pinned_model() {
        const URL: &str = "https://huggingface.co/Cactus-Compute/needle3/resolve/3391a1007e7db31d2fe5c69c734bbe93a9c1ce79/needle3.cact";
        const SHA: &str = "c9d915eca282ed42d1a09b143b592adb4cc6744ffe2d294adf5cfc5548170c38";
        const BYTES: u64 = 35_335_380;
        let dir = std::env::temp_dir().join(format!("daybloom-needle-test-{}", std::process::id()));
        let p = Paths { file: dir.join(FILE), part: dir.join(format!("{FILE}.part")), hash: dir.join(format!("{FILE}.sha256")) };
        let ticks = std::sync::atomic::AtomicU64::new(0);
        let emit = |_received: u64| {
            ticks.fetch_add(1, Ordering::Relaxed);
        };
        let state = Weights::default();
        let block_on = tauri::async_runtime::block_on;
        let started = Instant::now();
        block_on(download(&emit, &state, &p, check_source(URL).unwrap(), SHA, BYTES)).unwrap();
        eprintln!("downloaded + verified in {:?}, {} progress events", started.elapsed(), ticks.load(Ordering::Relaxed));
        assert_eq!(fs::metadata(&p.file).unwrap().len(), BYTES);
        assert_eq!(fs::read_to_string(&p.hash).unwrap(), SHA);
        assert!(!p.part.exists());
        // A wrong pin fails verification and leaves nothing behind.
        let bad = block_on(download(&emit, &state, &p, check_source(URL).unwrap(), &"0".repeat(64), BYTES));
        assert!(bad.unwrap_err().starts_with("hash mismatch"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn hashes_are_normalised() {
        let h = "C9D915ECA282ED42D1A09B143B592ADB4CC6744FFE2D294ADF5CFC5548170C38";
        assert_eq!(check_hash(h).unwrap(), h.to_ascii_lowercase());
        assert!(check_hash("abc").is_err());
        assert_eq!(hex(&Sha256::digest(b"abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
}
