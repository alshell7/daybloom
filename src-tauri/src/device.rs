//! The phone's own side (Android): Daybloom's Kotlin plugin
//! (`gen/android/app/src/main/java/app/daybloom/device/DevicePlugin.kt`), reached from Rust
//! through `call` and from the planner through the `device_call` command.

use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime};

pub struct Device<R: Runtime>(PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("device")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle = api.register_android_plugin("app.daybloom.device", "DevicePlugin")?;
                app.manage(Device(handle));
            }
            #[cfg(not(target_os = "android"))]
            let _ = (app, api);
            Ok(())
        })
        .build()
}

/// Methods the planner may call. Anything else is refused before it reaches Kotlin.
const METHODS: &[&str] = &[
    "insets",
    "systemBars",
    "backHandler",
    "keepAwake",
    "hour12",
    "secure",
    "schedule",
    "focusShow",
    "focusHide",
    "reminderAccess",
    "openSettings",
    "widgets",
    "widgetPending",
    "pinWidget",
];

pub async fn call<R: Runtime, T: DeserializeOwned>(app: &AppHandle<R>, method: &str, args: impl Serialize) -> Result<T, String> {
    let device = app.try_state::<Device<R>>().ok_or("This device has no native side.")?;
    device.0.run_mobile_plugin_async(method, args).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn device_call(app: AppHandle, method: String, args: Option<Value>) -> Result<Value, String> {
    if !METHODS.contains(&method.as_str()) {
        return Err(format!("unknown device method `{method}`"));
    }
    call(&app, &method, args.unwrap_or(Value::Object(Default::default()))).await
}
