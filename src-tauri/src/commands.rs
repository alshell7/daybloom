//! Native commands invoked from `src/lib/platform.ts`. Keep names/args in sync with it.
//!
//! Commands without `async` run on the main thread, so anything touching the disk or
//! the keychain is `async` (and keychain calls go to the blocking pool).

use std::io::{ErrorKind, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{AppHandle, Manager};

use crate::widget::{self, Layer};

const KEYRING_SERVICE: &str = "app.daybloom.desktop";

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(err)?
}

// ---- App state: app_data_dir()/state/<key>.json -------------------------------------

fn state_path(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    let valid = (1..=64).contains(&key.len())
        && key.bytes().all(|b| matches!(b, b'a'..=b'z' | b'0'..=b'9' | b'_' | b'-'));
    if !valid {
        return Err(format!("invalid state key `{key}`"));
    }
    Ok(app.path().app_data_dir().map_err(err)?.join("state").join(format!("{key}.json")))
}

#[tauri::command]
pub async fn state_load(app: AppHandle, key: String) -> Result<Option<String>, String> {
    match std::fs::read_to_string(state_path(&app, &key)?) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(err(e)),
    }
}

#[tauri::command]
pub async fn state_save(app: AppHandle, key: String, value: String) -> Result<(), String> {
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let path = state_path(&app, &key)?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(err)?;
    // Unique temp name so concurrent saves from both windows never interleave bytes.
    let tmp = path.with_extension(format!("{}.tmp", SEQ.fetch_add(1, Ordering::Relaxed)));
    let write = || -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(value.as_bytes())?;
        f.sync_all()?;
        std::fs::rename(&tmp, &path)
    };
    write().map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        err(e)
    })
}

// ---- Secrets: OS keychain / Credential Manager ---------------------------------------

fn entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, account).map_err(err)
}

#[tauri::command]
pub async fn secret_get(account: String) -> Result<Option<String>, String> {
    blocking(move || match entry(&account)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(err(e)),
    })
    .await
}

#[tauri::command]
pub async fn secret_set(account: String, value: String) -> Result<(), String> {
    blocking(move || entry(&account)?.set_password(&value).map_err(err)).await
}

#[tauri::command]
pub async fn secret_delete(account: String) -> Result<(), String> {
    blocking(move || match entry(&account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(err(e)),
    })
    .await
}

// ---- Windows, tray, dock -------------------------------------------------------------

/// Async on purpose: building a webview window from a synchronous command deadlocks
/// WebView2 on Windows (the frame appears, the webview never loads).
#[tauri::command]
pub async fn widget_show(app: AppHandle, show: Option<bool>) -> Result<bool, String> {
    widget::set_visible(&app, show)
}

#[tauri::command]
pub fn widget_set_layer(app: AppHandle, layer: String) -> Result<(), String> {
    widget::set_layer(&app, Layer::parse(&layer)?)
}

/// Async for the same reason as widget_show: building a window from a sync command can
/// deadlock WebView2 on Windows.
#[tauri::command]
pub async fn overlay_show(app: AppHandle, show: bool) -> Result<bool, String> {
    crate::overlay::set_visible(&app, show)
}

/// Privacy mode on or off for every window (also mirrored in the tray menu).
#[tauri::command]
pub fn privacy_set(app: AppHandle, on: bool) {
    crate::privacy::set(&app, on);
}

#[tauri::command]
pub fn overlay_metrics(app: AppHandle) -> Option<crate::overlay::Metrics> {
    crate::overlay::metrics(&app)
}

#[tauri::command]
pub fn main_show(app: AppHandle) {
    crate::show_main(&app);
}

#[tauri::command]
pub fn set_tray_status(app: AppHandle, title: Option<String>, tooltip: String) -> Result<(), String> {
    let tray = app.tray_by_id(crate::tray::ID).ok_or("tray not ready")?;
    // Title is the text beside the macOS menu-bar icon; ignored on Windows.
    tray.set_title(title.filter(|t| !t.is_empty())).map_err(err)?;
    tray.set_tooltip(Some(tooltip)).map_err(err)
}

#[tauri::command]
pub fn set_dock_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use tauri::ActivationPolicy::{Accessory, Regular};
        app.set_activation_policy(if visible { Regular } else { Accessory })
            .map_err(err)?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, visible);
    Ok(())
}
