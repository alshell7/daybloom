mod commands;
mod oauth;
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
    }
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
                .build(),
        )
        .manage(oauth::Listeners::default())
        .manage(widget::LayerState::default())
        .setup(|app| {
            tray::create(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // The planner hides instead of quitting; Daybloom lives on in the tray / menu bar.
            // The widget really closes, releasing its webview until it is shown again.
            WindowEvent::CloseRequested { api, .. } if window.label() != widget::LABEL => {
                api.prevent_close();
                let _ = window.hide();
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
            commands::main_show,
            commands::set_tray_status,
            commands::set_dock_visible,
            oauth::oauth_listen,
            oauth::oauth_wait,
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
