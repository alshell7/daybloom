mod activity;
mod assistant;
mod capture;
mod commands;
mod export;
mod mcp;
mod oauth;
mod overlay;
mod privacy;
mod tray;
mod widget;

use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_window_state::StateFlags;

pub(crate) const MAIN: &str = "main";

/// Brings the main window to the front, restoring it if hidden or minimised.
pub(crate) fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        #[cfg(windows)]
        set_webview_visible(&w, true);
    }
}

/// WebView2 keeps rendering, and reports `document.visibilityState = "visible"`, after its
/// window is hidden or minimised, so the planner tells it (WKWebView follows its window by
/// itself). A hidden page pauses its animations and the clock drops to a 5 s tick; the
/// windows' `additionalBrowserArgs` turn off Chromium's IntensiveWakeUpThrottling, which would
/// otherwise stretch that tick to a minute (late notifications) after 5 minutes hidden.
#[cfg(windows)]
pub(crate) fn set_webview_visible(w: &tauri::WebviewWindow, visible: bool) {
    let _ = w.with_webview(move |webview| unsafe {
        let _ = webview.controller().SetIsVisible(visible);
    });
}

/// Shows a window without leaving it with the keyboard focus, then runs `then`.
///
/// Windows activates a window on show (SW_SHOW) despite `focus: false`, which takes the focus
/// from whatever you are typing in. Showing it without activation (SW_SHOWNOACTIVATE, or
/// building it already visible) avoids that but leaves WebView2 rendering the hidden planner
/// and its GPU process busy (~20% of a core idle; PR #2's measurements). So on Windows the
/// window is shown normally and the foreground goes straight back to the previous window, all
/// on the main thread (where Tauri runs window calls synchronously), and `then` runs after.
/// Elsewhere a plain show leaves the focus alone.
pub(crate) fn show_quietly(w: &tauri::WebviewWindow, then: impl FnOnce() + Send + 'static) -> Result<(), String> {
    #[cfg(windows)]
    {
        let w = w.clone();
        let app = w.app_handle().clone();
        app.run_on_main_thread(move || {
            use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, SetForegroundWindow};
            // SAFETY: plain Win32 calls on window handles; failures are ignored.
            let prev = unsafe { GetForegroundWindow() };
            let _ = w.show();
            let own = w.hwnd().ok();
            if !prev.is_invalid() && Some(prev) != own {
                unsafe {
                    let _ = SetForegroundWindow(prev);
                }
            }
            then();
        })
        .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        w.show().map_err(|e| e.to_string())?;
        then();
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // `daybloom --mcp`: a stdio relay to the running app for AI tools (see mcp.rs). It never
    // opens a window, so it must come before the single-instance plugin.
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.iter().any(|a| a == "--mcp") {
        mcp::stdio_relay(&args);
        return;
    }
    let app = tauri::Builder::default()
        // Must be registered first so a second launch never gets further than this.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| show_main(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        // Self-updates from the public release feed; every download is verified against
        // the minisign public key in tauri.conf.json before it is installed.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            // Geometry only: the frontend decides whether the widget is visible.
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                // The cues window always covers the planner's display; nothing to remember.
                .with_denylist(&[overlay::LABEL, capture::LABEL])
                .build(),
        )
        .manage(oauth::Listeners::default())
        .manage(assistant::Weights::default())
        .manage(widget::LayerState::default())
        .manage(privacy::Privacy::default())
        .manage(mcp::Mcp::default())
        .setup(|app| {
            tray::create(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // The planner hides instead of quitting; Daybloom lives on in the tray / menu bar.
            // The widget really closes, releasing its webview until it is shown again.
            WindowEvent::CloseRequested { api, .. }
                if window.label() != widget::LABEL && window.label() != overlay::LABEL && window.label() != capture::LABEL =>
            {
                api.prevent_close();
                let _ = window.hide();
                #[cfg(windows)]
                if let Some(w) = window.app_handle().get_webview_window(window.label()) {
                    set_webview_visible(&w, false);
                }
            }
            // Minimise / restore from the taskbar.
            #[cfg(windows)]
            WindowEvent::Resized(_) if window.label() == MAIN => {
                if let Some(w) = window.app_handle().get_webview_window(MAIN) {
                    if w.is_minimized().unwrap_or(false) {
                        set_webview_visible(&w, false);
                    } else if w.is_visible().unwrap_or(false) {
                        set_webview_visible(&w, true);
                    }
                }
            }
            WindowEvent::Destroyed if window.label() == widget::LABEL => {
                widget::changed(window.app_handle());
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::state_load,
            commands::state_save,
            commands::secret_get,
            commands::secret_set,
            commands::secret_delete,
            commands::widget_show,
            commands::widget_set_layer,
            commands::overlay_show,
            commands::overlay_metrics,
            commands::capture_show,
            commands::capture_close,
            commands::privacy_set,
            mcp::mcp_set,
            mcp::mcp_status,
            mcp::mcp_reply,
            export::export_save,
            activity::activity_idle_seconds,
            activity::activity_foreground,
            commands::main_show,
            commands::set_tray_status,
            commands::set_dock_visible,
            oauth::oauth_listen,
            oauth::oauth_wait,
            assistant::assistant_weights_status,
            assistant::assistant_weights_download,
            assistant::assistant_weights_read,
            assistant::assistant_weights_forget,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Daybloom");

    app.run(|_app, _event| {
        // Dock icon clicked (macOS): always surface the planner, even if the widget is showing.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = _event {
            show_main(_app);
        }
    });
}
