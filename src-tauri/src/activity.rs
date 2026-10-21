//! Activity sensing for the Time Tracker addon (`src/lib/addons/tracker/native.ts`):
//! how long the computer has been idle, and which app is in front.
//!
//!   activity_idle_seconds()          -> f64                         0 when unknown
//!   activity_foreground(withTitle)   -> { app, title } | null       title: Windows only
//!
//! Both are plain (non-async) commands, so they run on the main thread: AppKit only keeps
//! `frontmostApplication` current on a thread that runs the main run loop. Every call is a
//! handful of system calls. Nothing here may panic; any failure reads as 0 or None.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Foreground {
    /// Display name of the app ("Safari", "Code"); on Windows, the executable's file stem.
    pub app: String,
    /// Window title. Only on Windows, and only when asked for: on macOS a window title
    /// needs the Screen Recording permission, which a planner should never ask for.
    pub title: Option<String>,
}

/// Seconds since the last keyboard, mouse or trackpad input anywhere in the session.
#[tauri::command]
pub fn activity_idle_seconds() -> f64 {
    let s = idle_seconds();
    if s.is_finite() && s >= 0.0 {
        s
    } else {
        0.0
    }
}

/// The app in front (and, on Windows with `with_title`, its window title).
#[cfg(desktop)]
#[tauri::command]
pub fn activity_foreground(with_title: bool) -> Option<Foreground> {
    foreground(with_title).filter(|f| !f.app.trim().is_empty())
}

/// A phone: the app last in front, from Android's usage stats (once the user allows usage
/// access; see DevicePlugin.kt). Never a window title.
#[cfg(mobile)]
#[tauri::command]
pub async fn activity_foreground(app: tauri::AppHandle, with_title: bool) -> Option<Foreground> {
    let _ = with_title;
    #[derive(serde::Deserialize)]
    struct Front {
        app: Option<String>,
    }
    let f: Front = crate::device::call(&app, "foregroundApp", serde_json::json!({})).await.ok()?;
    f.app.filter(|a| !a.trim().is_empty()).map(|app| Foreground { app, title: None })
}

// ---- macOS ------------------------------------------------------------------------------

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    /// `CGEventSourceStateID` is an `int32_t`, `CGEventType` a `uint32_t`.
    fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
}

#[cfg(target_os = "macos")]
fn idle_seconds() -> f64 {
    const COMBINED_SESSION_STATE: i32 = 0; // kCGEventSourceStateCombinedSessionState
    const ANY_INPUT_EVENT: u32 = !0; // kCGAnyInputEventType
    // SAFETY: a pure query with no pointers; it needs no permission.
    unsafe { CGEventSourceSecondsSinceLastEventType(COMBINED_SESSION_STATE, ANY_INPUT_EVENT) }
}

#[cfg(target_os = "macos")]
fn foreground(_with_title: bool) -> Option<Foreground> {
    use objc2_app_kit::NSWorkspace;
    objc2::rc::autoreleasepool(|_| {
        let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
        let name = app.localizedName()?.to_string();
        Some(Foreground { app: name, title: None })
    })
}

// ---- Windows ----------------------------------------------------------------------------

#[cfg(windows)]
fn idle_seconds() -> f64 {
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    // SAFETY: `info` is a valid, correctly sized LASTINPUTINFO for the call's duration.
    unsafe {
        if !GetLastInputInfo(&mut info).as_bool() {
            return 0.0;
        }
        // Both are 32-bit tick counts; wrapping_sub stays right across the 49.7-day wrap.
        GetTickCount().wrapping_sub(info.dwTime) as f64 / 1000.0
    }
}

#[cfg(windows)]
fn foreground(with_title: bool) -> Option<Foreground> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    };

    // SAFETY: every handle is checked before use and closed on every path; buffers are
    // sized by us and their lengths passed alongside.
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32));
        if pid == 0 {
            return None;
        }
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = vec![0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
        let _ = CloseHandle(process);
        if !ok {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..(len as usize).min(buf.len())]);
        let app = std::path::Path::new(&path).file_stem()?.to_string_lossy().into_owned();

        let title = if with_title {
            let n = GetWindowTextLengthW(hwnd);
            if n > 0 {
                let mut t = vec![0u16; n as usize + 1];
                let got = GetWindowTextW(hwnd, &mut t);
                let got = (got.max(0) as usize).min(t.len());
                Some(String::from_utf16_lossy(&t[..got])).filter(|s| !s.trim().is_empty())
            } else {
                None
            }
        } else {
            None
        };
        Some(Foreground { app, title })
    }
}

// ---- Everything else --------------------------------------------------------------------

#[cfg(not(any(target_os = "macos", windows)))]
fn idle_seconds() -> f64 {
    0.0
}

#[cfg(not(any(target_os = "macos", windows)))]
#[cfg_attr(mobile, allow(dead_code))]
fn foreground(_with_title: bool) -> Option<Foreground> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real readings on this machine: `cargo test --lib activity -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn reads_idle_time_and_the_front_app() {
        let idle = activity_idle_seconds();
        let front = activity_foreground(false);
        eprintln!("idle {idle:.1}s, front {:?}", front.as_ref().map(|f| f.app.clone()));
        assert!(idle >= 0.0);
        #[cfg(any(target_os = "macos", windows))]
        assert!(front.is_some_and(|f| !f.app.is_empty()));
    }
}
