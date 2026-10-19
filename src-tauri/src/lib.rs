mod activity;
mod assistant;
mod commands;
mod export;
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
fn set_webview_visible(w: &tauri::WebviewWindow, visible: bool) {
    let _ = w.with_webview(move |webview| unsafe {
        let _ = webview.controller().SetIsVisible(visible);
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
                .with_denylist(&[overlay::LABEL])
                .build(),
        )
        .manage(oauth::Listeners::default())
        .manage(assistant::Weights::default())
        .manage(widget::LayerState::default())
        .manage(privacy::Privacy::default())
        .setup(|app| {
            tray::create(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // The planner hides instead of quitting; Daybloom lives on in the tray / menu bar.
            // The widget really closes, releasing its webview until it is shown again.
            WindowEvent::CloseRequested { api, .. } if window.label() != widget::LABEL && window.label() != overlay::LABEL => {
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
            commands::privacy_set,
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
