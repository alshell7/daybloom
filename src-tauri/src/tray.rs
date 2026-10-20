//! Menu-bar (macOS) / notification-area (Windows) icon and menu.

use serde_json::json;
use tauri::menu::{CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuEvent, MenuItem, MenuItemBuilder};
use tauri::tray::{TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::widget::{self, Layer};

pub const ID: &str = "main";

/// Check items whose state mirrors the widget window.
pub struct TrayItems {
    show_widget: CheckMenuItem<Wry>,
    on_top: CheckMenuItem<Wry>,
    on_desktop: CheckMenuItem<Wry>,
    privacy: CheckMenuItem<Wry>,
    /// "Now: Deep work · 25m left" and "Next: Lunch at 12:30", kept current by the planner.
    now: MenuItem<Wry>,
    next: MenuItem<Wry>,
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let show_widget = CheckMenuItemBuilder::with_id("show-widget", "Show Widget").build(app)?;
    let on_top = CheckMenuItemBuilder::with_id("layer-top", "Widget Floats on Top")
        .checked(true)
        .build(app)?;
    let on_desktop =
        CheckMenuItemBuilder::with_id("layer-desktop", "Widget Sits on Desktop").build(app)?;
    let privacy = CheckMenuItemBuilder::with_id("privacy", "Privacy Mode").build(app)?;
    let now = MenuItemBuilder::with_id("status-now", "Daybloom").build(app)?;
    let next = MenuItemBuilder::with_id("status-next", "").enabled(false).build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&now)
        .item(&next)
        .separator()
        .item(&MenuItemBuilder::with_id("open", "Open Daybloom").build(app)?)
        .item(&show_widget)
        .separator()
        .item(&on_top)
        .item(&on_desktop)
        .separator()
        .item(&privacy)
        .separator()
        .item(&MenuItemBuilder::with_id("capture", "Add to Backlog…").build(app)?)
        .item(&MenuItemBuilder::with_id("new-block", "New Block…").build(app)?)
        .item(&MenuItemBuilder::with_id("focus-now", "Focus on Now").build(app)?)
        .item(&MenuItemBuilder::with_id("open-settings", "Settings…").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("quit", "Quit Daybloom").build(app)?)
        .build()?;

    app.manage(TrayItems { show_widget, on_top, on_desktop, privacy, now, next });

    let builder = TrayIconBuilder::with_id(ID)
        .tooltip("Daybloom")
        .menu(&menu)
        .on_menu_event(on_menu)
        .on_tray_icon_event(on_icon);

    // macOS: monochrome template glyph that adapts to the menu bar. Elsewhere the colour
    // app icon (a black glyph would vanish on the dark Windows taskbar), left-click opens.
    #[cfg(target_os = "macos")]
    let builder = builder
        .icon(tauri::include_image!("icons/tray@2x.png"))
        .icon_as_template(true);
    #[cfg(not(target_os = "macos"))]
    let builder = {
        let b = builder.show_menu_on_left_click(false);
        match app.default_window_icon() {
            Some(icon) => b.icon(icon.clone()),
            None => b,
        }
    };

    builder.build(app)?;
    Ok(())
}

pub fn sync(app: &AppHandle, visible: bool, layer: Layer) {
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.show_widget.set_checked(visible);
        let _ = items.on_top.set_checked(layer == Layer::Top);
        let _ = items.on_desktop.set_checked(layer == Layer::Desktop);
    }
}

/// The menu's live lines. An empty "next" reads as a quiet dash.
pub fn set_status(app: &AppHandle, now: &str, next: &str) {
    if let Some(items) = app.try_state::<TrayItems>() {
        if !now.is_empty() {
            let _ = items.now.set_text(now);
        }
        let _ = items.next.set_text(if next.is_empty() { "Nothing else planned today" } else { next });
    }
}

pub fn sync_privacy(app: &AppHandle, on: bool) {
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.privacy.set_checked(on);
    }
}

fn on_menu(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "open" | "status-now" => crate::show_main(app),
        "show-widget" => {
            // Off the menu handler: creating the widget's webview there deadlocks WebView2 on Windows.
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = widget::set_visible(&app, None);
            });
        }
        // Radio pair: picking the active one keeps it active.
        "layer-top" => {
            let _ = widget::set_layer(app, Layer::Top);
        }
        "layer-desktop" => {
            let _ = widget::set_layer(app, Layer::Desktop);
        }
        action @ ("new-block" | "focus-now" | "open-settings") => {
            crate::show_main(app);
            let _ = app.emit("daybloom://tray", json!({ "action": action }));
        }
        "privacy" => crate::privacy::set(app, !crate::privacy::is_on(app)),
        // Off the main thread: building a webview from a menu handler deadlocks WebView2.
        "capture" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = crate::capture::show(&app);
            });
        }
        "quit" => app.exit(0),
        _ => {}
    }
}

fn on_icon(tray: &TrayIcon, event: TrayIconEvent) {
    let app = tray.app_handle();
    match event {
        // Hovering precedes opening the menu: refresh checkmarks in case the widget was
        // hidden from JS (`getCurrentWindow().hide()`) without going through `widget_show`.
        TrayIconEvent::Enter { .. } => sync(app, widget::is_visible(app), widget::layer(app)),
        #[cfg(not(target_os = "macos"))]
        TrayIconEvent::Click {
            button: tauri::tray::MouseButton::Left,
            button_state: tauri::tray::MouseButtonState::Up,
            ..
        } => crate::show_main(app),
        _ => {}
    }
}
