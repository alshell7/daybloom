//! Web updates over the air. A release that changes only the web layer (HTML, CSS, JS) ships as
//! a signed bundle that this binary serves instead of its built-in one; anything native (Rust,
//! plugins, capabilities, permissions) still needs a full install through the updater plugin.
//!
//! `OtaAssets` wraps the embedded assets: each request gets the active bundle's file, else the
//! built-in one, on the normal app origin, so `invoke`, capabilities and storage are unchanged.
//! Bundles live in `app_data_dir()/web/`:
//!
//!   state.json          the bundle in use, the one before it, the staged one, blocked versions
//!   <version>/          a verified bundle: bundle.zip and bundle.zip.sig as downloaded, and
//!                       files/ unpacked from it
//!   staging-<version>/  an unpack in progress, renamed to <version>/ once every file verified
//!
//! Safety:
//! - A zip must carry a valid minisign signature from the updater key (tauri.conf.json) before
//!   it is opened. Its daybloom-web.json gives the version, runtime, notes and the SHA-256 of
//!   every file. Each launch checks the signature and every unpacked file again, so files that
//!   anything else writes there are never served.
//! - A bundle is for one RUNTIME (runtime.json: the binary's native API level). Bundles for
//!   another one are ignored and deleted. The built-in bundle wins when it is as new or newer
//!   (after an install).
//! - A new bundle is on trial until the planner calls `ota_ready`. Without that call within
//!   15 s, or if the app stops without a clean exit first, Daybloom goes back to the bundle
//!   before it (or the built-in one) and never takes that version again.
//!
//!   ota_status() -> { runtime, embedded, version, active, previous, pending, blocked, reverted, feed }
//!   ota_stage(url, sig) -> { version, notes }   download, verify, unpack; starts on the next launch
//!   ota_apply() -> version                      serve the staged bundle now (the caller reloads)
//!   ota_ready(runtime, version) -> ()           the planner started (on the page of that version)
//!   ota_rollback() -> version                   back to the bundle before; blocks this one
//!
//! Debug builds also read DAYBLOOM_OTA_FEED and DAYBLOOM_OTA_PUBKEY, to try bundles end to end
//! from a local server with a test key. Release builds ignore both.

use std::borrow::Cow;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, RwLock};
use std::time::Duration;

use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use reqwest::redirect::Policy;
use reqwest::Url;
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::utils::assets::{AssetKey, AssetsIter, CspHash};
use tauri::{App, AppHandle, Assets, Manager, Runtime, State};
use zip::ZipArchive;

/// The binary's native API level (src-tauri/runtime.json, read by build.rs).
pub const RUNTIME: u32 = parse_runtime(env!("DAYBLOOM_RUNTIME"));

const FEED: &str = "https://github.com/alshell7/daybloom/releases/latest/download/web-latest.json";
/// Bundles come only from this repo's release downloads (redirects are checked separately).
const SOURCE: &str = "/alshell7/daybloom/releases/download/";
const MANIFEST: &str = "daybloom-web.json";
const STATE: &str = "state.json";
/// In each bundle folder: the zip and its signature as downloaded, and the files from it.
const ZIP: &str = "bundle.zip";
const SIG: &str = "bundle.zip.sig";
const FILES: &str = "files";
/// How long a new bundle has to call `ota_ready`.
const TRIAL: Duration = Duration::from_secs(15);
/// How long an asset request may wait for `setup` (it runs before the event loop, so it
/// should never have to).
const BOOT_WAIT: Duration = Duration::from_secs(10);
/// Sanity ceilings; a bundle is about 1.5 MB zipped and 4 MB unpacked.
const MAX_ZIP: u64 = 64 * 1024 * 1024;
const MAX_UNPACKED: u64 = 256 * 1024 * 1024;
const MAX_FILES: usize = 10_000;

const fn parse_runtime(s: &str) -> u32 {
    let b = s.as_bytes();
    assert!(!b.is_empty(), "DAYBLOOM_RUNTIME is empty");
    let mut n = 0u32;
    let mut i = 0;
    while i < b.len() {
        assert!(b[i].is_ascii_digit(), "DAYBLOOM_RUNTIME must be a number");
        n = n * 10 + (b[i] - b'0') as u32;
        i += 1;
    }
    n
}

/// state.json. `previous` is always a bundle that started fine, or None: the built-in one.
#[derive(Serialize, Deserialize, Default, Clone, Debug, PartialEq)]
#[serde(default)]
struct Saved {
    /// The bundle in use; None is the built-in one.
    active: Option<String>,
    previous: Option<String>,
    /// Verified and waiting: it starts with the next launch, or now with `ota_apply`.
    staged: Option<String>,
    /// `active` called `ota_ready` at least once.
    confirmed: bool,
    /// A launch is trying `active` and has not heard `ota_ready` yet. Still set at the next
    /// launch means that one crashed or hung, so the bundle is set aside.
    trial: bool,
    /// Versions that failed to start or were rolled back; never taken again.
    blocked: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct Manifest {
    version: String,
    runtime: u32,
    #[serde(default)]
    notes: String,
    /// Path in the bundle → hex SHA-256 of the file.
    files: BTreeMap<String, String>,
}

/// A verified bundle on disk.
#[derive(Debug)]
struct Bundle {
    version: String,
    /// Asset key ("/assets/x.js") → its file.
    files: HashMap<String, PathBuf>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Staged {
    version: String,
    notes: String,
}

#[derive(Serialize)]
pub struct Status {
    runtime: u32,
    /// The built-in bundle's version (the app's).
    embedded: String,
    /// What the planner runs: the active bundle's version, else the built-in one.
    version: String,
    active: Option<String>,
    previous: Option<String>,
    pending: Option<Staged>,
    blocked: Vec<String>,
    /// A bundle that did not start this launch, so the one before it runs again.
    reverted: Option<String>,
    feed: String,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// A bundle version: plain x.y.z, so it is also a safe folder name.
fn parse_version(v: &str) -> Option<Version> {
    let plain = v.split('.').count() == 3 && v.split('.').all(|p| (1..=9).contains(&p.len()) && p.bytes().all(|b| b.is_ascii_digit()));
    plain.then(|| Version::parse(v).ok()).flatten()
}

/// A bundle path as a relative file path: no root, `..`, backslashes or drive letters.
fn asset_path(name: &str) -> Option<PathBuf> {
    if name.is_empty() || name.len() > 512 || name == MANIFEST || name.starts_with('/') || name.contains('\\') {
        return None;
    }
    let mut path = PathBuf::new();
    for part in name.split('/') {
        if part.is_empty() || part == "." || part == ".." || part.contains(':') || part.chars().any(char::is_control) {
            return None;
        }
        path.push(part);
    }
    Some(path)
}

fn check_manifest(m: &Manifest) -> Result<(), String> {
    if parse_version(&m.version).is_none() {
        return Err(format!("invalid bundle version {}", m.version));
    }
    if m.files.is_empty() || m.files.len() > MAX_FILES || !m.files.contains_key("index.html") {
        return Err("the bundle has no index.html".into());
    }
    for (name, sha) in &m.files {
        if asset_path(name).is_none() {
            return Err(format!("unsafe path in the bundle: {name}"));
        }
        if sha.len() != 64 || !sha.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f')) {
            return Err(format!("invalid SHA-256 for {name}"));
        }
    }
    Ok(())
}

/// Checks the bundle's zip against the key again, then every unpacked file against the zip's
/// manifest.
fn load_bundle(root: &Path, version: &str, key: &Key) -> Result<Bundle, String> {
    let m = signed_manifest(root, key)?;
    if m.version != version {
        return Err(format!("bundle {version} says it is {}", m.version));
    }
    if m.runtime != RUNTIME {
        return Err(format!("bundle {version} is for runtime {}, this app is {RUNTIME}", m.runtime));
    }
    let mut files = HashMap::with_capacity(m.files.len());
    for (name, sha) in &m.files {
        let path = root.join(FILES).join(asset_path(name).unwrap_or_default());
        let bytes = fs::read(&path).map_err(|e| format!("bundle {version}: {name}: {e}"))?;
        if hex(&Sha256::digest(&bytes)) != *sha {
            return Err(format!("bundle {version}: {name} does not match its SHA-256"));
        }
        files.insert(format!("/{name}"), path);
    }
    Ok(Bundle { version: m.version, files })
}

/// Checks `data` against a minisign signature (both base64, as in the updater's feed) and
/// returns the version the signature was made for, if it names one.
fn verify(data: &[u8], sig: &str, pubkey: &str) -> Result<Option<String>, String> {
    let text = |b64: &str| {
        base64::engine::general_purpose::STANDARD
            .decode(b64.trim())
            .ok()
            .and_then(|b| String::from_utf8(b).ok())
    };
    let key = text(pubkey).and_then(|t| PublicKey::decode(&t).ok()).ok_or("invalid update key")?;
    let sig = text(sig).and_then(|t| Signature::decode(&t).ok()).ok_or("invalid update signature")?;
    key.verify(data, &sig, false).map_err(|_| "the update's signature does not match Daybloom's key".to_string())?;
    // The trusted comment is covered by the signature, so it is safe to read only now.
    Ok(sig.trusted_comment().split('\t').find_map(|f| f.strip_prefix("version:")).map(str::to_string))
}

/// The key bundles must be signed with.
enum Key {
    /// The updater's minisign public key (base64, as in tauri.conf.json).
    Minisign(String),
    /// Tests: "ok" is a valid signature, "ok:<version>" one made for that version.
    #[cfg(test)]
    Test,
}

impl Key {
    fn verify(&self, data: &[u8], sig: &str) -> Result<Option<String>, String> {
        match self {
            Key::Minisign(key) => verify(data, sig, key),
            #[cfg(test)]
            Key::Test => match sig.strip_prefix("ok") {
                Some("") => Ok(None),
                Some(v) => Ok(v.strip_prefix(':').map(str::to_string)),
                None => Err("the update's signature does not match Daybloom's key".into()),
            },
        }
    }
}

/// The manifest of the zip kept in `root`, once the zip's signature checks out.
fn signed_manifest(root: &Path, key: &Key) -> Result<Manifest, String> {
    let zip = fs::read(root.join(ZIP)).map_err(|e| format!("{}: {e}", root.display()))?;
    let sig = fs::read_to_string(root.join(SIG)).map_err(|e| format!("{}: {e}", root.display()))?;
    let signed = key.verify(&zip, &sig)?;
    let mut archive = ZipArchive::new(Cursor::new(&zip[..])).map_err(|e| format!("damaged bundle: {e}"))?;
    let (m, _) = read_manifest(&mut archive)?;
    match signed {
        Some(s) if s != m.version => Err(format!("the signature is for version {s}, the bundle says {}", m.version)),
        _ => Ok(m),
    }
}

fn read_manifest(archive: &mut ZipArchive<Cursor<&[u8]>>) -> Result<(Manifest, Vec<u8>), String> {
    let entry = archive.by_name(MANIFEST).map_err(|_| format!("the bundle has no {MANIFEST}"))?;
    let mut raw = Vec::new();
    entry.take(4 * 1024 * 1024).read_to_end(&mut raw).map_err(|e| e.to_string())?;
    let m: Manifest = serde_json::from_slice(&raw).map_err(|e| format!("{MANIFEST}: {e}"))?;
    check_manifest(&m)?;
    Ok((m, raw))
}

/// Writes every listed file into `to`, each checked against its SHA-256. Any file the manifest
/// does not list fails the bundle.
fn unpack(archive: &mut ZipArchive<Cursor<&[u8]>>, m: &Manifest, to: &Path) -> Result<(), String> {
    let io = |e: std::io::Error| format!("could not unpack the update: {e}");
    let mut seen = HashSet::with_capacity(m.files.len());
    let mut total = 0u64;
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| format!("damaged bundle: {e}"))?;
        let name = entry.name().to_string();
        if entry.is_dir() || name == MANIFEST {
            continue;
        }
        let want = m.files.get(&name).ok_or_else(|| format!("the bundle has an unlisted file: {name}"))?;
        if !seen.insert(name.clone()) {
            return Err(format!("the bundle has {name} twice"));
        }
        let mut bytes = Vec::new();
        entry.take(MAX_UNPACKED - total + 1).read_to_end(&mut bytes).map_err(|e| format!("damaged bundle: {e}"))?;
        total += bytes.len() as u64;
        if total > MAX_UNPACKED {
            return Err("the bundle is too large".into());
        }
        if hex(&Sha256::digest(&bytes)) != *want {
            return Err(format!("{name} does not match its SHA-256"));
        }
        let path = to.join(asset_path(&name).unwrap_or_default());
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(io)?;
        }
        fs::write(&path, bytes).map_err(io)?;
    }
    if seen.len() != m.files.len() {
        return Err("the bundle is missing files".into());
    }
    Ok(())
}

/// The bundles on disk and state.json. No Tauri in here, so the tests drive it directly.
struct Store {
    dir: PathBuf,
    embedded: Version,
    key: Key,
    saved: Saved,
    /// Set aside at this launch because the last one never heard from it.
    reverted: Option<String>,
}

impl Store {
    fn open(dir: PathBuf, embedded: Version, key: Key) -> Store {
        let saved = fs::read(dir.join(STATE)).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        Store { dir, embedded, key, saved, reverted: None }
    }

    fn save(&self) -> Result<(), String> {
        let io = |e: std::io::Error| format!("could not save the update state: {e}");
        fs::create_dir_all(&self.dir).map_err(io)?;
        let tmp = self.dir.join(format!("{STATE}.tmp"));
        fs::write(&tmp, serde_json::to_vec_pretty(&self.saved).map_err(|e| e.to_string())?).map_err(io)?;
        fs::rename(&tmp, self.dir.join(STATE)).map_err(io)
    }

    /// What runs: the active bundle's version, else the built-in one.
    fn version(&self) -> String {
        self.saved.active.clone().unwrap_or_else(|| self.embedded.to_string())
    }

    /// Newer than what runs now, and than the built-in bundle.
    fn is_newer(&self, version: &str) -> bool {
        let Some(v) = parse_version(version) else { return false };
        v > self.embedded && self.saved.active.as_deref().and_then(parse_version).map_or(true, |a| v > a)
    }

    fn pending(&self) -> Option<Staged> {
        let m = signed_manifest(&self.dir.join(self.saved.staged.as_ref()?), &self.key).ok()?;
        Some(Staged { version: m.version, notes: m.notes })
    }

    /// At launch: which bundle to serve. Sets the active bundle on trial if it never started.
    fn boot(&mut self) -> Option<Bundle> {
        // The last launch tried the active bundle and never heard from it.
        if self.saved.trial && !self.saved.confirmed && self.saved.active.is_some() {
            self.reverted = self.saved.active.clone();
            self.fall_back(true);
        }
        // A bundle staged earlier starts now.
        if let Some(v) = self.saved.staged.take() {
            if self.is_newer(&v) && !self.saved.blocked.contains(&v) {
                self.promote(v);
            }
        }
        let bundle = self.load_active();
        self.saved.trial = bundle.is_some() && !self.saved.confirmed;
        self.prune();
        let _ = self.save();
        bundle
    }

    /// The active bundle becomes the one before it (if it started fine) and `v` takes its place.
    fn promote(&mut self, v: String) {
        let s = &mut self.saved;
        if s.confirmed || s.active.is_none() {
            s.previous = s.active.take();
        }
        s.active = Some(v);
        s.confirmed = false;
        s.trial = false;
    }

    /// Leaves the active bundle for the one before it (or the built-in one); `block` sets its
    /// version aside for good.
    fn fall_back(&mut self, block: bool) {
        let s = &mut self.saved;
        if let Some(v) = s.active.take() {
            if block && !s.blocked.contains(&v) {
                s.blocked.push(v);
            }
        }
        s.active = s.previous.take();
        s.confirmed = true;
        s.trial = false;
    }

    /// The active bundle, verified; on any problem the one before it, else the built-in one.
    fn load_active(&mut self) -> Option<Bundle> {
        loop {
            let v = self.saved.active.clone()?;
            let newer = parse_version(&v).is_some_and(|p| p > self.embedded);
            if !newer || self.saved.blocked.contains(&v) {
                // An install brought a built-in bundle at least as new.
                let s = std::mem::take(&mut self.saved);
                self.saved = Saved { staged: s.staged, blocked: s.blocked, confirmed: true, ..Saved::default() };
                return None;
            }
            match load_bundle(&self.dir.join(&v), &v, &self.key) {
                Ok(b) => return Some(b),
                // Missing, damaged or for another runtime: not the bundle's fault, so not blocked.
                Err(_) => self.fall_back(false),
            }
        }
    }

    /// Deletes every bundle folder but the active, previous and staged ones, and forgets blocks
    /// the built-in bundle has passed. Launch only: a staging may be running later.
    fn prune(&mut self) {
        let s = &self.saved;
        let keep: HashSet<&str> = [&s.active, &s.previous, &s.staged].into_iter().flatten().map(String::as_str).collect();
        if let Ok(entries) = fs::read_dir(&self.dir) {
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().into_owned();
                if e.path().is_dir() && !keep.contains(name.as_str()) {
                    let _ = fs::remove_dir_all(e.path());
                }
            }
        }
        let embedded = &self.embedded;
        self.saved.blocked.retain(|v| parse_version(v).is_some_and(|p| p > *embedded));
    }

    /// Checks a downloaded zip's signature, unpacks it into `staging-<v>/`, verifies every file,
    /// then renames it to `<v>/` and records it as staged.
    fn stage(&mut self, zip: &[u8], sig: &str) -> Result<Staged, String> {
        let signed = self.key.verify(zip, sig)?;
        let signed = signed.as_deref();
        let mut archive = ZipArchive::new(Cursor::new(zip)).map_err(|e| format!("not a Daybloom bundle: {e}"))?;
        let (m, _) = read_manifest(&mut archive)?;
        if signed.is_some_and(|s| s != m.version) {
            return Err(format!("the signature is for version {}, the bundle says {}", signed.unwrap_or_default(), m.version));
        }
        if m.runtime != RUNTIME {
            return Err(format!("this update needs a newer Daybloom (runtime {}, this app is {RUNTIME})", m.runtime));
        }
        if self.saved.blocked.contains(&m.version) {
            return Err(format!("version {} was set aside", m.version));
        }
        if !self.is_newer(&m.version) {
            return Err(format!("version {} is not newer than {}", m.version, self.version()));
        }
        let io = |e: std::io::Error| format!("could not save the update: {e}");
        let tmp = self.dir.join(format!("staging-{}", m.version));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).map_err(io)?;
        let unpacked = unpack(&mut archive, &m, &tmp.join(FILES))
            .and_then(|_| fs::write(tmp.join(ZIP), zip).map_err(io))
            .and_then(|_| fs::write(tmp.join(SIG), sig).map_err(io));
        if let Err(e) = unpacked {
            let _ = fs::remove_dir_all(&tmp);
            return Err(e);
        }
        // Not the active or previous bundle: both are older.
        let dest = self.dir.join(&m.version);
        let _ = fs::remove_dir_all(&dest);
        fs::rename(&tmp, &dest).map_err(io)?;
        if let Some(old) = self.saved.staged.replace(m.version.clone()) {
            if old != m.version {
                let _ = fs::remove_dir_all(self.dir.join(old));
            }
        }
        self.save()?;
        Ok(Staged { version: m.version, notes: m.notes })
    }
}

#[derive(Default)]
struct Gate {
    booted: bool,
    /// An asset was served before `setup` (never seen): this launch keeps the built-in bundle.
    early: bool,
}

#[derive(Default)]
struct Inner {
    /// None until `setup`, and in development (the dev server serves the page).
    store: Option<Store>,
    /// The trial waiting for `ota_ready`.
    trial: Option<u64>,
}

#[derive(Default)]
pub struct Ota {
    inner: Mutex<Inner>,
    live: RwLock<Option<Arc<Bundle>>>,
    gate: (Mutex<Gate>, Condvar),
    staging: AtomicBool,
    trials: AtomicU64,
    reverted: Mutex<Option<String>>,
}

impl Ota {
    /// Opens the store and picks the bundle to serve. Returns the trial to watch, if any.
    fn boot(&self, dir: Option<PathBuf>, embedded: Version, key: Key) -> Option<u64> {
        let (lock, ready) = &self.gate;
        let mut gate = lock.lock().unwrap();
        let mut inner = self.inner.lock().unwrap();
        if let Some(dir) = dir {
            let mut store = Store::open(dir, embedded, key);
            if !gate.early {
                let bundle = store.boot();
                if store.saved.trial {
                    inner.trial = Some(self.trials.fetch_add(1, Ordering::Relaxed) + 1);
                }
                *self.reverted.lock().unwrap() = store.reverted.clone();
                *self.live.write().unwrap() = bundle.map(Arc::new);
            }
            inner.store = Some(store);
        }
        gate.booted = true;
        ready.notify_all();
        inner.trial
    }

    /// The bundle's bytes for `key`, if the active bundle has it.
    fn get(&self, key: &str) -> Option<Vec<u8>> {
        {
            let (lock, ready) = &self.gate;
            let mut gate = lock.lock().unwrap();
            if !gate.booted {
                gate = ready.wait_timeout_while(gate, BOOT_WAIT, |g| !g.booted).unwrap().0;
                if !gate.booted {
                    gate.early = true;
                    return None;
                }
            }
        }
        let bundle = self.live.read().unwrap().clone()?;
        fs::read(bundle.files.get(key)?).ok()
    }

    fn with_store<T>(&self, f: impl FnOnce(&mut Store, &mut Option<u64>) -> Result<T, String>) -> Result<T, String> {
        let mut inner = self.inner.lock().unwrap();
        let Inner { store, trial } = &mut *inner;
        let store = store.as_mut().ok_or("web updates are off in development")?;
        f(store, trial)
    }

    fn status(&self) -> Result<Status, String> {
        let reverted = self.reverted.lock().unwrap().clone();
        self.with_store(|s, _| {
            Ok(Status {
                runtime: RUNTIME,
                embedded: s.embedded.to_string(),
                version: s.version(),
                active: s.saved.active.clone(),
                previous: s.saved.previous.clone(),
                pending: s.pending(),
                blocked: s.saved.blocked.clone(),
                reverted,
                feed: dev_override("DAYBLOOM_OTA_FEED").unwrap_or_else(|| FEED.into()),
            })
        })
    }

    /// Serves the staged bundle from now on, on trial. Returns the trial to watch.
    fn apply(&self) -> Result<(String, u64), String> {
        let (bundle, id) = self.with_store(|s, trial| {
            let v = s.saved.staged.take().ok_or("no update is ready")?;
            if !s.is_newer(&v) || s.saved.blocked.contains(&v) {
                s.save()?;
                return Err(format!("version {v} is not newer than {}", s.version()));
            }
            s.promote(v.clone());
            let bundle = s.load_active();
            s.saved.trial = bundle.is_some() && !s.saved.confirmed;
            s.save()?;
            match bundle {
                Some(b) if b.version == v => {
                    let id = self.trials.fetch_add(1, Ordering::Relaxed) + 1;
                    *trial = Some(id);
                    Ok((b, id))
                }
                _ => Err(format!("version {v} could not be loaded")),
            }
        })?;
        let version = bundle.version.clone();
        *self.live.write().unwrap() = Some(Arc::new(bundle));
        Ok((version, id))
    }

    /// The planner started on a page of `version`: if that is the active bundle, it is good.
    fn ready(&self, version: &str) -> Result<(), String> {
        self.with_store(|s, trial| {
            if s.version() != version {
                return Err(format!("this page is version {version}, the app runs {}", s.version()));
            }
            *trial = None;
            if s.saved.active.is_some() && !s.saved.confirmed {
                s.saved.confirmed = true;
                s.saved.trial = false;
                s.save()?;
            }
            Ok(())
        })
    }

    /// Goes back to the bundle before the active one, and blocks the active one. `trial` limits
    /// it to that trial (the deadline); None is a rollback the user asked for.
    fn fall_back(&self, trial: Option<u64>) -> Result<Option<String>, String> {
        let bundle = self.with_store(|s, pending| {
            if trial.is_some() && (*pending != trial || s.saved.confirmed) {
                return Ok(None);
            }
            let from = s.saved.active.clone().ok_or("the built-in version is already in use")?;
            *pending = None;
            s.fall_back(true);
            let bundle = s.load_active();
            s.save()?;
            Ok(Some((from, bundle)))
        })?;
        let Some((from, bundle)) = bundle else { return Ok(None) };
        let to = bundle.as_ref().map(|b| b.version.clone());
        *self.live.write().unwrap() = bundle.map(Arc::new);
        if trial.is_some() {
            *self.reverted.lock().unwrap() = Some(from);
        }
        Ok(Some(to.unwrap_or_default()))
    }

    /// A clean exit before the planner reported in is not a failure: the next launch tries again.
    fn exit(&self) {
        let _ = self.with_store(|s, trial| {
            if trial.take().is_some() && s.saved.trial && !s.saved.confirmed {
                s.saved.trial = false;
                s.save()?;
            }
            Ok(())
        });
    }

    fn stage(&self, zip: &[u8], sig: &str) -> Result<Staged, String> {
        self.with_store(|s, _| s.stage(zip, sig))
    }
}

/// Debug builds only: a local feed and a test key, to try bundles end to end.
fn dev_override(name: &str) -> Option<String> {
    if cfg!(debug_assertions) {
        std::env::var(name).ok().filter(|v| !v.trim().is_empty())
    } else {
        None
    }
}

fn same_origin(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme() && a.host_str() == b.host_str() && a.port_or_known_default() == b.port_or_known_default()
}

/// Starting URL: this repo's release downloads (or, in a debug build, the local feed's server).
fn check_url(url: &str) -> Result<Url, String> {
    let u = Url::parse(url).map_err(|_| "invalid update URL".to_string())?;
    let local = dev_override("DAYBLOOM_OTA_FEED").and_then(|f| Url::parse(&f).ok());
    let plain = u.username().is_empty() && u.password().is_none();
    let ok = plain
        && (local.is_some_and(|f| same_origin(&u, &f))
            || (u.scheme() == "https" && u.host_str() == Some("github.com") && u.port().is_none() && u.path().starts_with(SOURCE)));
    if ok {
        Ok(u)
    } else {
        Err(format!("refusing to download an update from {url}"))
    }
}

/// GitHub answers a release download with a redirect to its asset storage.
fn redirect_ok(u: &Url) -> bool {
    let local = dev_override("DAYBLOOM_OTA_FEED").and_then(|f| Url::parse(&f).ok());
    u.username().is_empty()
        && u.password().is_none()
        && (local.is_some_and(|f| same_origin(u, &f))
            || (u.scheme() == "https"
                && match u.host_str() {
                    Some(h) => h == "github.com" || h.ends_with(".githubusercontent.com"),
                    None => false,
                }))
}

async fn download(url: Url) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 10 {
                attempt.error("too many redirects")
            } else if redirect_ok(attempt.url()) {
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
    if resp.content_length().is_some_and(|n| n > MAX_ZIP) {
        return Err("download failed: the update is too large".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(net)? {
        bytes.extend_from_slice(&chunk);
        if bytes.len() as u64 > MAX_ZIP {
            return Err("download failed: the update is too large".into());
        }
    }
    Ok(bytes)
}

/// The updater's public key (tauri.conf.json → plugins.updater.pubkey).
fn updater_key(config: &tauri::Config) -> String {
    dev_override("DAYBLOOM_OTA_PUBKEY").unwrap_or_else(|| {
        config.plugins.0.get("updater").and_then(|u| u.get("pubkey")).and_then(|k| k.as_str()).unwrap_or_default().to_string()
    })
}

/// Reloads every window but `except` (that one reloads itself), so none keeps running code
/// from another bundle.
fn reload_windows<R: Runtime>(app: &AppHandle<R>, except: Option<&str>) {
    for (label, w) in app.webview_windows() {
        if except != Some(label.as_str()) {
            let _ = w.reload();
        }
    }
}

/// If trial `id` has not heard `ota_ready` after TRIAL, its bundle is set aside and every
/// window reloads with the one before it.
fn watch_trial<R: Runtime>(app: AppHandle<R>, ota: Arc<Ota>, id: u64) {
    std::thread::spawn(move || {
        std::thread::sleep(TRIAL);
        if let Ok(Some(_)) = ota.fall_back(Some(id)) {
            reload_windows(&app, None);
        }
    });
}

/// The asset provider: the active bundle's files first, else the built-in ones.
pub struct OtaAssets<R: Runtime> {
    embedded: Box<dyn Assets<R>>,
    ota: Arc<Ota>,
}

/// Holds the built-in assets' place for a moment while they move into `OtaAssets`.
struct Nothing;

impl<R: Runtime> Assets<R> for Nothing {
    fn get(&self, _key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        None
    }
    fn iter(&self) -> Box<AssetsIter<'_>> {
        Box::new(std::iter::empty())
    }
    fn csp_hashes(&self, _html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        Box::new(std::iter::empty())
    }
}

/// Wraps the context's embedded assets in `OtaAssets`.
pub fn wrap<R: Runtime>(context: &mut tauri::Context<R>) {
    let embedded = context.set_assets(Box::new(Nothing));
    context.set_assets(Box::new(OtaAssets { embedded, ota: Arc::default() }));
}

impl<R: Runtime> Assets<R> for OtaAssets<R> {
    /// Runs after the config's windows are built and before the event loop delivers their
    /// first request; `get` still waits for it, in case a platform asks earlier.
    fn setup(&self, app: &App<R>) {
        self.embedded.setup(app);
        app.manage(self.ota.clone());
        let dir = if tauri::is_dev() { None } else { app.path().app_data_dir().ok().map(|d| d.join("web")) };
        if let Some(id) = self.ota.boot(dir, app.package_info().version.clone(), Key::Minisign(updater_key(app.config()))) {
            watch_trial(app.handle().clone(), self.ota.clone(), id);
        }
    }

    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        self.ota.get(key.as_ref()).map(Cow::Owned).or_else(|| self.embedded.get(key))
    }

    fn iter(&self) -> Box<AssetsIter<'_>> {
        self.embedded.iter()
    }

    /// The build has no inline scripts (vite.config.ts checks), so the built-in page's hashes
    /// fit every bundle's page.
    fn csp_hashes(&self, html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        self.embedded.csp_hashes(html_path)
    }
}

/// A clean exit (see `Ota::exit`).
pub fn exit<R: Runtime>(app: &AppHandle<R>) {
    if let Some(ota) = app.try_state::<Arc<Ota>>() {
        ota.exit();
    }
}

#[tauri::command]
pub async fn ota_status(ota: State<'_, Arc<Ota>>) -> Result<Status, String> {
    ota.status()
}

/// Downloads a bundle, checks its signature, then unpacks and verifies it. It starts with the
/// next launch, or now with `ota_apply`.
#[tauri::command]
pub async fn ota_stage(ota: State<'_, Arc<Ota>>, url: String, sig: String) -> Result<Staged, String> {
    let url = check_url(&url)?;
    if ota.staging.swap(true, Ordering::AcqRel) {
        return Err("an update is already downloading".into());
    }
    struct Busy<'a>(&'a AtomicBool);
    impl Drop for Busy<'_> {
        fn drop(&mut self) {
            self.0.store(false, Ordering::Release);
        }
    }
    let _busy = Busy(&ota.staging);
    let zip = download(url).await?;
    let ota = ota.inner().clone();
    tauri::async_runtime::spawn_blocking(move || ota.stage(&zip, &sig)).await.map_err(|e| e.to_string())?
}

/// Serves the staged bundle from now on. The calling window reloads itself; the others reload
/// here.
#[tauri::command]
pub async fn ota_apply(app: AppHandle, window: tauri::WebviewWindow, ota: State<'_, Arc<Ota>>) -> Result<String, String> {
    let (version, id) = ota.apply()?;
    watch_trial(app.clone(), ota.inner().clone(), id);
    reload_windows(&app, Some(window.label()));
    Ok(version)
}

/// The planner started on a page built as `version` for `runtime`.
#[tauri::command]
pub async fn ota_ready(ota: State<'_, Arc<Ota>>, runtime: u32, version: String) -> Result<(), String> {
    if runtime != RUNTIME {
        return Err(format!("this page was built for runtime {runtime}, the app is {RUNTIME}"));
    }
    ota.ready(&version)
}

/// Back to the bundle before the active one (or the built-in one); the active one is not
/// taken again. Returns the version now in use ("" for the built-in one).
#[tauri::command]
pub async fn ota_rollback(app: AppHandle, window: tauri::WebviewWindow, ota: State<'_, Arc<Ota>>) -> Result<String, String> {
    let to = ota.fall_back(None)?.unwrap_or_default();
    reload_windows(&app, Some(window.label()));
    Ok(to)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    // A throwaway test key (no password) and signatures made with `tauri signer sign`.
    const TEST_KEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDk1Nzg4MDYxOEU4RTQ5NzQKUldSMFNZNk9ZWUI0bGR1MVY2L2huNUdFblFrb2N1bVhNM1R2clI5SHhhVlFYS0JnTUtFNktseG4K";
    const PAYLOAD: &[u8] = b"daybloom ota fixture\n";
    /// PAYLOAD, signed with TEST_KEY for version 0.9.0.
    const SIG_V090: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSMFNZNk9ZWUI0bGNTQWxkaUQwSzdqZHpsaHQrU1pGVlM5eDZ2di9KRGJJZEZnN3V5YktobWwxSTdiOU92RHBWM1NmVkN3QS9DRGg4b05rSHdhZEk2eUI2UGlOMWxjVWdNPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkyNjE3MzUyCWZpbGU6cGF5bG9hZC5iaW4JdmVyc2lvbjowLjkuMAo4RTFqQlNTajJKWHBqZUt0UThtSEdwT1R1WGtUZGdQNmhlNytHMGdPTkFrZEI4Mlhja2lIRWcwWEVJa0RVSWkwelhwbm1MMStxb2pPQXhrUmhGOUpDZz09Cg==";
    /// PAYLOAD, signed with TEST_KEY, no version.
    const SIG_PLAIN: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSMFNZNk9ZWUI0bFVHV1owOUx2M2dmdnJRNlVSbnFjbkxGQnJhM05sTGhnRld0ZitXQVFWTjNPR0k0cWFOd2lIVk9VTVJjb1pKWmVBdlptVzlXcnpWdzIrYUZkYVBPZlFNPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkyNjE3MzUzCWZpbGU6cGF5bG9hZDIuYmluCkF5M3kvUGRWbkR4YjhkYmFsUDdvRmpmZHpFUU5EVGdaRWZOM2tYOGpmMHdZaHF0Zml0Q2tpNnpNazU1S3grOFpndTlJbGZRTStQTnk0dEI5aVhNQkFnPT0K";
    /// PAYLOAD, signed with another key.
    const SIG_OTHER_KEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUU0JxaTl0aTlIQ1p1MDNYU2hHdlZ2TlJXc1lhWVJsTURmZnhjaXJpak5SYWVLRmVWZ0hSTjZsUWwwWWYyNnl3OUo2NkJkaFZaNkVsc3dmOFpRRENGbTkzQlRVSVZLY3djPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkyNjE3MzU4CWZpbGU6cGF5bG9hZDIuYmluCXZlcnNpb246MC45LjAKdTl0R0ZXTDFPZjRCRHRDaEhjM3pXM21zK1RkSWw0NXIyZmpwQXZqUFZxWnVSL2NWQk9ZTlR6N2ZzbTVNTCsvOXFjQjdxcldVcjhQTHllR1ZZeVFuQWc9PQo=";

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> TempDir {
            static N: AtomicU64 = AtomicU64::new(0);
            let p = std::env::temp_dir().join(format!("daybloom-ota-{tag}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::Relaxed)));
            let _ = fs::remove_dir_all(&p);
            TempDir(p)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn v(s: &str) -> Version {
        Version::parse(s).unwrap()
    }

    /// A zip as scripts/web-bundle.mjs makes it: the manifest, then the files.
    fn bundle_zip(version: &str, runtime: u32, files: &[(&str, &str)], tamper: impl Fn(&mut Manifest)) -> Vec<u8> {
        let mut m = Manifest {
            version: version.into(),
            runtime,
            notes: format!("Notes for {version}"),
            files: files.iter().map(|(n, c)| (n.to_string(), hex(&Sha256::digest(c.as_bytes())))).collect(),
        };
        tamper(&mut m);
        let mut w = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let o = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        w.start_file(MANIFEST, o).unwrap();
        w.write_all(&serde_json::to_vec(&m).unwrap()).unwrap();
        for (name, contents) in files {
            w.start_file(*name, o).unwrap();
            w.write_all(contents.as_bytes()).unwrap();
        }
        w.finish().unwrap().into_inner()
    }

    fn page(version: &str) -> Vec<(&'static str, String)> {
        vec![("index.html", format!("<html>{version}</html>")), ("assets/app.js", format!("console.log('{version}')"))]
    }

    fn zip_for(version: &str) -> Vec<u8> {
        let files = page(version);
        let refs: Vec<(&str, &str)> = files.iter().map(|(n, c)| (*n, c.as_str())).collect();
        bundle_zip(version, RUNTIME, &refs, |_| {})
    }

    fn serve(store: &mut Store) -> Option<String> {
        store.boot().map(|b| fs::read_to_string(&b.files["/index.html"]).unwrap())
    }

    #[test]
    fn the_runtime_comes_from_runtime_json() {
        let json: serde_json::Value = serde_json::from_str(include_str!("../runtime.json")).unwrap();
        assert_eq!(json["RUNTIME"].as_u64(), Some(RUNTIME as u64));
        assert_eq!(parse_runtime("12"), 12);
    }

    #[test]
    fn signatures_must_come_from_the_key() {
        assert_eq!(verify(PAYLOAD, SIG_V090, TEST_KEY).unwrap().as_deref(), Some("0.9.0"));
        assert_eq!(verify(PAYLOAD, SIG_PLAIN, TEST_KEY).unwrap(), None);
        let mut tampered = PAYLOAD.to_vec();
        tampered[0] ^= 1;
        assert!(verify(&tampered, SIG_V090, TEST_KEY).unwrap_err().contains("does not match"));
        assert!(verify(PAYLOAD, SIG_OTHER_KEY, TEST_KEY).is_err());
        assert!(verify(PAYLOAD, "not base64!", TEST_KEY).is_err());
        assert!(verify(PAYLOAD, SIG_V090, "").is_err());
    }

    #[test]
    fn the_app_trusts_its_updater_key() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let key = conf["plugins"]["updater"]["pubkey"].as_str().unwrap();
        // A signature from the test key is refused by the real one.
        assert!(verify(PAYLOAD, SIG_V090, key).unwrap_err().contains("does not match"));
    }

    #[test]
    fn paths_stay_inside_the_bundle() {
        assert_eq!(asset_path("assets/index-B1.js"), Some(PathBuf::from("assets").join("index-B1.js")));
        for bad in ["", "/etc/passwd", "../x", "assets/../../x", "a//b", "./a", "C:/x", "a\\b", MANIFEST, "a/\u{0}b"] {
            assert!(asset_path(bad).is_none(), "{bad:?}");
        }
        assert!(parse_version("0.2.1").is_some());
        for bad in ["0.2", "0.2.1-beta", "v0.2.1", "../0.2.1", "0.2.1.1", "01234567890.1.1"] {
            assert!(parse_version(bad).is_none(), "{bad:?}");
        }
    }

    #[test]
    fn stages_then_serves_a_newer_bundle_on_trial() {
        let t = TempDir::new("stage");
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        assert_eq!(serve(&mut s), None);
        let staged = s.stage(&zip_for("0.2.1"), "ok:0.2.1").unwrap();
        assert_eq!(staged, Staged { version: "0.2.1".into(), notes: "Notes for 0.2.1".into() });
        assert_eq!(s.pending().unwrap().version, "0.2.1");
        assert!(!t.0.join("staging-0.2.1").exists());

        // The next launch starts it, on trial.
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        assert_eq!(serve(&mut s).as_deref(), Some("<html>0.2.1</html>"));
        assert_eq!(s.saved.active.as_deref(), Some("0.2.1"));
        assert!(s.saved.trial && !s.saved.confirmed);
        assert_eq!(s.saved.previous, None);
    }

    #[test]
    fn refuses_old_blocked_foreign_and_damaged_bundles() {
        let t = TempDir::new("refuse");
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        assert!(s.stage(&zip_for("0.2.0"), "ok").unwrap_err().contains("not newer"));
        assert!(s.stage(&zip_for("0.1.9"), "ok").unwrap_err().contains("not newer"));
        // The signature names another version than the bundle.
        assert!(s.stage(&zip_for("0.2.1"), "ok:0.2.2").unwrap_err().contains("signature is for version 0.2.2"));
        // Built for another runtime.
        let other = bundle_zip("0.2.1", RUNTIME + 1, &[("index.html", "x")], |_| {});
        assert!(s.stage(&other, "ok").unwrap_err().contains("newer Daybloom"));
        // A file that does not match its hash, an unlisted file, a missing one, an unsafe path.
        let bad_hash = bundle_zip("0.2.1", RUNTIME, &[("index.html", "x")], |m| {
            m.files.insert("index.html".into(), "0".repeat(64));
        });
        assert!(s.stage(&bad_hash, "ok").unwrap_err().contains("does not match"));
        let unlisted = bundle_zip("0.2.1", RUNTIME, &[("index.html", "x"), ("extra.js", "y")], |m| {
            m.files.remove("extra.js");
        });
        assert!(s.stage(&unlisted, "ok").unwrap_err().contains("unlisted"));
        let missing = bundle_zip("0.2.1", RUNTIME, &[("index.html", "x")], |m| {
            m.files.insert("gone.js".into(), "a".repeat(64));
        });
        assert!(s.stage(&missing, "ok").unwrap_err().contains("missing"));
        let escape = bundle_zip("0.2.1", RUNTIME, &[("index.html", "x")], |m| {
            m.files.insert("../evil.js".into(), "a".repeat(64));
        });
        assert!(s.stage(&escape, "ok").unwrap_err().contains("unsafe path"));
        assert!(s.stage(b"not a zip", "ok").is_err());
        // Nothing was kept from any of them.
        assert_eq!(s.saved.staged, None);
        assert!(!t.0.join("0.2.1").exists() && !t.0.join("staging-0.2.1").exists());

        s.saved.blocked.push("0.2.1".into());
        assert!(s.stage(&zip_for("0.2.1"), "ok").unwrap_err().contains("set aside"));
    }

    #[test]
    fn a_bundle_that_never_reports_in_is_rolled_back_and_blocked() {
        let t = TempDir::new("trial");
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        s.stage(&zip_for("0.2.1"), "ok").unwrap();
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        assert_eq!(serve(&mut s).as_deref(), Some("<html>0.2.1</html>"));
        // It confirmed: 0.2.1 is now the one to go back to.
        s.saved.confirmed = true;
        s.saved.trial = false;
        s.stage(&zip_for("0.2.2"), "ok").unwrap();
        s.save().unwrap();

        // 0.2.2 starts on trial, then the app stops before `ota_ready` (no clean exit).
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        assert_eq!(serve(&mut s).as_deref(), Some("<html>0.2.2</html>"));
        assert_eq!(s.saved.previous.as_deref(), Some("0.2.1"));
        // The next launch goes back to 0.2.1 and never takes 0.2.2 again.
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        assert_eq!(serve(&mut s).as_deref(), Some("<html>0.2.1</html>"));
        assert_eq!(s.reverted.as_deref(), Some("0.2.2"));
        assert!(s.saved.confirmed && !s.saved.trial);
        assert_eq!(s.saved.blocked, vec!["0.2.2".to_string()]);
        assert!(!t.0.join("0.2.2").exists());
        assert!(s.stage(&zip_for("0.2.2"), "ok").unwrap_err().contains("set aside"));
        // A later version is fine.
        s.stage(&zip_for("0.2.3"), "ok").unwrap();
    }

    #[test]
    fn a_first_bundle_that_fails_goes_back_to_the_built_in_one() {
        let t = TempDir::new("first");
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        s.stage(&zip_for("0.2.1"), "ok").unwrap();
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        assert!(serve(&mut s).is_some());
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        assert_eq!(serve(&mut s), None);
        assert_eq!(s.saved.active, None);
        assert_eq!(s.saved.blocked, vec!["0.2.1".to_string()]);
    }

    #[test]
    fn a_newer_install_wins_and_clears_the_old_bundles() {
        let t = TempDir::new("install");
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        s.stage(&zip_for("0.2.1"), "ok").unwrap();
        s.saved.blocked.push("0.3.5".into());
        s.save().unwrap();
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        assert!(serve(&mut s).is_some());
        // The app updates to 0.3.0 (its built-in bundle is newer).
        let mut s = Store::open(t.0.clone(), v("0.3.0"), Key::Test);
        assert_eq!(serve(&mut s), None);
        assert_eq!(s.saved.active, None);
        assert!(!t.0.join("0.2.1").exists());
        assert_eq!(s.saved.blocked, vec!["0.3.5".to_string()]);
        // Same version as the built-in one: the built-in one wins too.
        let mut s = Store::open(t.0.clone(), v("0.3.0"), Key::Test);
        assert!(s.stage(&zip_for("0.3.0"), "ok").is_err());
        // Blocks the built-in bundle has passed are forgotten.
        let mut s = Store::open(t.0.clone(), v("0.4.0"), Key::Test);
        assert_eq!(serve(&mut s), None);
        assert!(s.saved.blocked.is_empty());
    }

    #[test]
    fn a_damaged_or_foreign_bundle_on_disk_is_not_served() {
        let t = TempDir::new("damaged");
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        s.stage(&zip_for("0.2.1"), "ok").unwrap();
        fs::write(t.0.join("0.2.1/files/assets/app.js"), "changed").unwrap();
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        assert_eq!(serve(&mut s), None);
        assert_eq!(s.saved.active, None);
        // Not its own fault, so not blocked (it may download again).
        assert!(s.saved.blocked.is_empty());
        assert!(!t.0.join("0.2.1").exists());

        // A bundle for another runtime left on disk (say, from before an install) is deleted.
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        s.stage(&zip_for("0.2.1"), "ok").unwrap();
        let foreign = bundle_zip("0.2.1", RUNTIME + 1, &[("index.html", "<html>0.2.1</html>")], |_| {});
        fs::write(t.0.join("0.2.1").join(ZIP), foreign).unwrap();
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        assert_eq!(serve(&mut s), None);
        assert!(!t.0.join("0.2.1").exists());
    }

    #[test]
    fn a_bad_signature_is_refused_before_the_zip_is_opened() {
        let t = TempDir::new("badsig");
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        assert!(s.stage(&zip_for("0.2.1"), "forged").unwrap_err().contains("does not match"));
        assert!(s.stage(b"not even a zip", "forged").unwrap_err().contains("does not match"));
        assert_eq!(s.saved.staged, None);
        assert!(!t.0.join("0.2.1").exists());
    }

    #[test]
    fn files_written_there_by_anything_else_are_not_served() {
        let t = TempDir::new("planted");
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        s.stage(&zip_for("0.2.1"), "ok").unwrap();
        // Something rewrites the bundle and its manifest consistently, but cannot sign it.
        let planted = bundle_zip("0.2.1", RUNTIME, &[("index.html", "<html>evil</html>"), ("assets/app.js", "evil()")], |_| {});
        fs::write(t.0.join("0.2.1").join(ZIP), planted).unwrap();
        fs::write(t.0.join("0.2.1/files/index.html"), "<html>evil</html>").unwrap();
        fs::write(t.0.join("0.2.1/files/assets/app.js"), "evil()").unwrap();
        fs::write(t.0.join("0.2.1").join(SIG), "forged").unwrap();
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        assert_eq!(serve(&mut s), None);
        assert_eq!(s.saved.active, None);
        assert!(!t.0.join("0.2.1").exists());
    }

    #[test]
    fn leftovers_are_swept_at_launch() {
        let t = TempDir::new("sweep");
        fs::create_dir_all(t.0.join("staging-0.2.5/assets")).unwrap();
        fs::create_dir_all(t.0.join("0.1.0")).unwrap();
        fs::write(t.0.join(STATE), "{ not json").unwrap();
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        assert_eq!(s.saved, Saved::default());
        assert_eq!(serve(&mut s), None);
        assert!(!t.0.join("staging-0.2.5").exists() && !t.0.join("0.1.0").exists());
    }

    fn ota_at(dir: &Path, embedded: &str) -> (Ota, Option<u64>) {
        let ota = Ota::default();
        let trial = ota.boot(Some(dir.to_path_buf()), v(embedded), Key::Test);
        (ota, trial)
    }

    #[test]
    fn serves_the_bundle_first_and_switches_on_apply_ready_and_rollback() {
        let t = TempDir::new("live");
        let (ota, trial) = ota_at(&t.0, "0.2.0");
        assert_eq!(trial, None);
        assert_eq!(ota.get("/index.html"), None);
        ota.stage(&zip_for("0.2.1"), "ok").unwrap();
        assert_eq!(ota.status().unwrap().pending.unwrap().version, "0.2.1");

        let (version, id) = ota.apply().unwrap();
        assert_eq!(version, "0.2.1");
        assert_eq!(ota.get("/index.html").unwrap(), b"<html>0.2.1</html>");
        // A file only the built-in bundle has falls through to it.
        assert_eq!(ota.get("/favicon.svg"), None);
        let st = ota.status().unwrap();
        assert_eq!((st.version.as_str(), st.embedded.as_str(), st.pending), ("0.2.1", "0.2.0", None));

        // A page of another version (say, a stale one) does not count; this one's does, so the
        // deadline leaves it alone.
        assert!(ota.ready("0.2.0").is_err());
        ota.ready("0.2.1").unwrap();
        assert_eq!(ota.fall_back(Some(id)).unwrap(), None);
        assert_eq!(ota.get("/index.html").unwrap(), b"<html>0.2.1</html>");

        // The next one is applied but never reports in: the deadline goes back to 0.2.1.
        ota.stage(&zip_for("0.2.2"), "ok").unwrap();
        let (_, id) = ota.apply().unwrap();
        assert_eq!(ota.get("/index.html").unwrap(), b"<html>0.2.2</html>");
        assert_eq!(ota.fall_back(Some(id)).unwrap().as_deref(), Some("0.2.1"));
        assert_eq!(ota.get("/index.html").unwrap(), b"<html>0.2.1</html>");
        let st = ota.status().unwrap();
        assert_eq!(st.reverted.as_deref(), Some("0.2.2"));
        assert_eq!(st.blocked, vec!["0.2.2".to_string()]);

        // The user goes back to the built-in version.
        assert_eq!(ota.fall_back(None).unwrap().as_deref(), Some(""));
        assert_eq!(ota.get("/index.html"), None);
        assert!(ota.fall_back(None).is_err());
        assert_eq!(ota.status().unwrap().blocked, vec!["0.2.2".to_string(), "0.2.1".to_string()]);
    }

    #[test]
    fn a_clean_exit_during_the_trial_tries_again_next_launch() {
        let t = TempDir::new("exit");
        let (ota, _) = ota_at(&t.0, "0.2.0");
        ota.stage(&zip_for("0.2.1"), "ok").unwrap();
        ota.apply().unwrap();
        ota.exit();
        let (ota, trial) = ota_at(&t.0, "0.2.0");
        assert!(trial.is_some());
        assert_eq!(ota.get("/index.html").unwrap(), b"<html>0.2.1</html>");
        // This time it crashes (no exit): the launch after goes back.
        let (ota, trial) = ota_at(&t.0, "0.2.0");
        assert_eq!(trial, None);
        assert_eq!(ota.get("/index.html"), None);
        assert_eq!(ota.status().unwrap().reverted.as_deref(), Some("0.2.1"));
    }

    #[test]
    fn requests_wait_for_setup() {
        let t = TempDir::new("gate");
        let mut s = Store::open(t.0.clone(), v("0.2.0"), Key::Test);
        s.stage(&zip_for("0.2.1"), "ok").unwrap();
        let ota = Arc::new(Ota::default());
        let early = {
            let ota = ota.clone();
            std::thread::spawn(move || ota.get("/index.html"))
        };
        std::thread::sleep(Duration::from_millis(50));
        ota.boot(Some(t.0.clone()), v("0.2.0"), Key::Test);
        assert_eq!(early.join().unwrap().unwrap(), b"<html>0.2.1</html>");
    }

    #[test]
    fn development_has_no_store() {
        let ota = Ota::default();
        assert_eq!(ota.boot(None, v("0.2.0"), Key::Test), None);
        assert_eq!(ota.get("/index.html"), None);
        assert!(ota.status().is_err());
        assert!(ota.apply().is_err());
    }

    #[test]
    fn downloads_come_only_from_this_repos_releases() {
        assert!(check_url("https://github.com/alshell7/daybloom/releases/download/v0.2.1/web-0.2.1-r1.zip").is_ok());
        assert!(check_url("http://github.com/alshell7/daybloom/releases/download/v0.2.1/x.zip").is_err());
        assert!(check_url("https://github.com/someone/daybloom/releases/download/v0.2.1/x.zip").is_err());
        assert!(check_url("https://github.com/alshell7/daybloom/releases/download/../../../evil/x.zip").is_err());
        assert!(check_url("https://github.com.evil.com/alshell7/daybloom/releases/download/x.zip").is_err());
        assert!(check_url("https://user@github.com/alshell7/daybloom/releases/download/x.zip").is_err());
        assert!(check_url("https://github.com:8443/alshell7/daybloom/releases/download/x.zip").is_err());
        let to = |s: &str| Url::parse(s).unwrap();
        assert!(redirect_ok(&to("https://release-assets.githubusercontent.com/github-production-release-asset/x")));
        assert!(redirect_ok(&to("https://objects.githubusercontent.com/x")));
        assert!(!redirect_ok(&to("http://objects.githubusercontent.com/x")));
        assert!(!redirect_ok(&to("https://githubusercontent.com.evil.com/x")));
    }
}
