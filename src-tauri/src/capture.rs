//! Quick capture: a small floating card, opened from the tray / menu bar, that adds things to the
//! backlog without opening the planner (src/views/CaptureView.svelte). It is built on demand,
//! takes the keyboard, and closes after use, handing the focus back to whatever you were in.

use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "capture";
/// Logical size: room for the card, its preview and its shadow.
const W: f64 = 600.0;
const H: f64 = 340.0;

/// Open (or bring back) the capture card. Call it off the main thread: building a webview from
/// a menu handler deadlocks WebView2.
pub fn show(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        w.show().map_err(|e| e.to_string())?;
        return w.set_focus().map_err(|e| e.to_string());
    }
    let mut b = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html?view=capture".into()))
        .title("Add to the backlog")
        .inner_size(W, H)
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .focused(true)
        .visible_on_all_workspaces(true);
    if let Some(args) = crate::overlay::browser_args(app) {
        b = b.additional_browser_args(&args);
    }
    let w = b.build().map_err(|e| e.to_string())?;
    crate::privacy::apply(app, &w);
    place(app, &w);
    w.show().map_err(|e| e.to_string())?;
    w.set_focus().map_err(|e| e.to_string())
}

/// Centred near the top of the display the pointer is on, like a launcher.
fn place(app: &AppHandle, w: &WebviewWindow) {
    let m = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(m) = m else {
        let _ = w.center();
        return;
    };
    let s = m.scale_factor();
    let (pos, size) = (m.position(), m.size());
    let x = pos.x as f64 + (size.width as f64 - W * s) / 2.0;
    let y = pos.y as f64 + size.height as f64 * 0.18;
    let _ = w.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
}

/// Close the card. On macOS, if the planner isn't open, Daybloom steps back so the app you were
/// in gets the keyboard again (Windows does that by itself when the window goes).
pub fn close(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        w.close().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        let planner = app.get_webview_window(crate::MAIN).and_then(|w| w.is_visible().ok()).unwrap_or(false);
        if !planner {
            let _ = app.hide();
        }
    }
    Ok(())
}
