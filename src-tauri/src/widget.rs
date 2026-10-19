//! The floating desktop dial: visibility and window layer, kept in sync with the tray.
//!
//! The widget's webview only exists while it is shown: it is built from its
//! tauri.conf.json entry (`"create": false`) on show and closed on hide, so a hidden
//! widget costs no memory. Its position is restored by the window-state plugin.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

pub const LABEL: &str = "widget";

#[derive(Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Layer {
    /// Floats above other windows (matches `alwaysOnTop: true` in tauri.conf.json).
    #[default]
    Top,
    /// Sits below normal windows, on the desktop.
    Desktop,
    Normal,
}

impl Layer {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "top" => Ok(Self::Top),
            "desktop" => Ok(Self::Desktop),
            "normal" => Ok(Self::Normal),
            other => Err(format!("unknown widget layer `{other}`")),
        }
    }
}

#[derive(Default)]
pub struct LayerState(Mutex<Layer>);

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

/// The widget window, built from its config entry if it isn't open yet.
fn ensure(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(w) = window(app) {
        return Ok(w);
    }
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == LABEL)
        .ok_or("widget window config missing")?
        .clone();
    let w = tauri::WebviewWindowBuilder::from_config(app, &config)
        .and_then(|b| b.build())
        .map_err(|e| e.to_string())?;
    apply_layer(&w, layer(app))?;
    crate::privacy::apply(app, &w);
    Ok(w)
}

pub fn is_visible(app: &AppHandle) -> bool {
    window(app).and_then(|w| w.is_visible().ok()).unwrap_or(false)
}

pub fn layer(app: &AppHandle) -> Layer {
    *app.state::<LayerState>().0.lock().unwrap()
}

/// Shows or hides the widget (toggles when `show` is `None`); returns the new visibility.
pub fn set_visible(app: &AppHandle, show: Option<bool>) -> Result<bool, String> {
    let show = show.unwrap_or_else(|| !is_visible(app));
    if show {
        // Never steals the keyboard focus (see `show_quietly`).
        crate::show_quietly(&ensure(app)?)?;
    } else if let Some(w) = window(app) {
        // Closing (not hiding) frees the webview; `Destroyed` then calls `changed`.
        w.close().map_err(|e| e.to_string())?;
        return Ok(false);
    }
    changed(app);
    Ok(show)
}

fn apply_layer(w: &WebviewWindow, layer: Layer) -> Result<(), String> {
    // Clear the opposite flag first: on macOS both map onto a single window level.
    match layer {
        Layer::Top => w.set_always_on_bottom(false).and_then(|_| w.set_always_on_top(true)),
        Layer::Desktop => w.set_always_on_top(false).and_then(|_| w.set_always_on_bottom(true)),
        Layer::Normal => w.set_always_on_top(false).and_then(|_| w.set_always_on_bottom(false)),
    }
    .map_err(|e| e.to_string())
}

pub fn set_layer(app: &AppHandle, layer: Layer) -> Result<(), String> {
    *app.state::<LayerState>().0.lock().unwrap() = layer;
    if let Some(w) = window(app) {
        let shown = w.is_visible().unwrap_or(false);
        apply_layer(&w, layer)?;
        // The status (tray tick, saved setting) is reported once the widget is shown again.
        if shown && keep_shown(app, &w) {
            return Ok(());
        }
    }
    changed(app);
    Ok(())
}

/// Windows: tao keeps its own "visible" flag, which `show_quietly`'s raw SW_SHOWNOACTIVATE
/// doesn't set, and it hides a window whose styles change while that flag says hidden. So
/// after a layer change, show the widget quietly again, queued on the main thread behind
/// tao's own style update so it runs last.
/// Returns whether the re-show (which then reports the status) was queued.
#[cfg(windows)]
fn keep_shown(app: &AppHandle, w: &WebviewWindow) -> bool {
    let w = w.clone();
    let a = app.clone();
    app.run_on_main_thread(move || {
        let _ = crate::show_quietly(&w);
        changed(&a);
    })
    .is_ok()
}

#[cfg(not(windows))]
fn keep_shown(_app: &AppHandle, _w: &WebviewWindow) -> bool {
    false
}

#[derive(Clone, Serialize)]
struct WidgetStatus {
    visible: bool,
    layer: Layer,
}

/// Re-syncs the tray checkmarks and tells the frontend (`daybloom://widget`) so it can
/// persist changes that originated natively (tray menu, Alt+F4).
pub fn changed(app: &AppHandle) {
    let status = WidgetStatus { visible: is_visible(app), layer: layer(app) };
    crate::tray::sync(app, status.visible, status.layer);
    let _ = app.emit("daybloom://widget", status);
}
