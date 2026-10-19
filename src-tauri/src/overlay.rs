//! Screen cues: one transparent, click-through window over the whole display that draws the
//! edge glow, the docked time bar and the HUD (src/views/OverlayView.svelte). It never takes
//! focus or the mouse, sits on every workspace, and only exists while a cue is on.

use serde::Serialize;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "overlay";

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

/// The display the planner is on (else the primary one).
fn monitor(app: &AppHandle) -> Option<tauri::Monitor> {
    let main = app.get_webview_window(crate::MAIN);
    main.as_ref()
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
}

/// Cover the whole display; the page keeps the bar and HUD inside the work area.
fn place(app: &AppHandle, w: &WebviewWindow) -> Result<(), String> {
    let Some(m) = monitor(app) else { return Ok(()) };
    let pos = m.position();
    let size = m.size();
    w.set_position(PhysicalPosition::new(pos.x, pos.y)).map_err(|e| e.to_string())?;
    w.set_size(PhysicalSize::new(size.width, size.height)).map_err(|e| e.to_string())?;
    Ok(())
}

fn ensure(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(w) = window(app) {
        return Ok(w);
    }
    let b = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html?view=overlay".into()))
        .title("Daybloom Screen Cues")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .focusable(false)
        .visible(false)
        .visible_on_all_workspaces(true)
        .additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,IntensiveWakeUpThrottling");
    let w = b.build().map_err(|e| e.to_string())?;
    w.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;
    place(app, &w)?;
    Ok(w)
}

/// Shows or hides the cues window; returns whether it is now shown.
pub fn set_visible(app: &AppHandle, show: bool) -> Result<bool, String> {
    if show {
        let w = ensure(app)?;
        place(app, &w)?;
        w.show().map_err(|e| e.to_string())?;
        // Showing can re-enable hit testing on some platforms.
        w.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        if let Some(w) = window(app) {
            // Closing frees the webview, so cues cost nothing while they are off.
            w.close().map_err(|e| e.to_string())?;
        }
        Ok(false)
    }
}

#[derive(Serialize)]
pub struct Area {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Serialize)]
pub struct Metrics {
    /// The display, in logical pixels.
    screen: Area,
    /// The part not covered by the menu bar, Dock or taskbar, relative to the display.
    work: Area,
    scale: f64,
}

pub fn metrics(app: &AppHandle) -> Option<Metrics> {
    let m = monitor(app)?;
    let s = m.scale_factor();
    let pos = m.position();
    let size = m.size();
    let wa = m.work_area();
    Some(Metrics {
        screen: Area { x: pos.x as f64 / s, y: pos.y as f64 / s, width: size.width as f64 / s, height: size.height as f64 / s },
        work: Area {
            x: (wa.position.x - pos.x) as f64 / s,
            y: (wa.position.y - pos.y) as f64 / s,
            width: wa.size.width as f64 / s,
            height: wa.size.height as f64 / s,
        },
        scale: s,
    })
}
