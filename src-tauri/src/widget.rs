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
        ensure(app)?.show().map_err(|e| e.to_string())?;
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
        apply_layer(&w, layer)?;
    }
    changed(app);
    Ok(())
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
