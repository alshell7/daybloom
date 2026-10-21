//! Privacy mode: every Daybloom window is left out of screenshots and screen recordings.
//! macOS sets the window's sharing type to none; Windows sets display affinity to
//! "exclude from capture" (Tauri's content protection). New windows (the widget, the
//! screen-cue overlay) pick the mode up as they are built.

use std::sync::atomic::{AtomicBool, Ordering};

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
#[cfg(desktop)]
use tauri::WebviewWindow;

#[derive(Default)]
pub struct Privacy(AtomicBool);

#[cfg(desktop)]
pub fn is_on(app: &AppHandle) -> bool {
    app.try_state::<Privacy>().map(|p| p.0.load(Ordering::SeqCst)).unwrap_or(false)
}

/// Applies the current mode to one window (call right after building it).
#[cfg(desktop)]
pub fn apply(app: &AppHandle, w: &WebviewWindow) {
    let _ = w.set_content_protected(is_on(app));
}

/// Turns privacy mode on or off for every window, the tray check and the frontend.
pub fn set(app: &AppHandle, on: bool) {
    if let Some(p) = app.try_state::<Privacy>() {
        p.0.store(on, Ordering::SeqCst);
    }
    for w in app.webview_windows().values() {
        let _ = w.set_content_protected(on);
    }
    #[cfg(desktop)]
    crate::tray::sync_privacy(app, on);
    let _ = app.emit("daybloom://privacy", json!({ "on": on }));
}
