//! The microphone. Daybloom opens it only while you talk (voice input, Alef), so the app answers
//! the webview's own permission prompt itself and the operating system's privacy switch is the
//! one that counts: macOS asks once (Info.plist), Windows follows Settings › Privacy & security ›
//! Microphone.
//!
//! On Windows, WebView2 used to show its own "Allow / Block" prompt and remembered a "Block" in
//! its profile for good; nothing in Windows Settings could undo it. Each window now clears any
//! such remembered answer when it opens (`forget_block`).

use tauri::webview::{PermissionKind, PermissionResponse};

/// Answers the webview's permission prompts: the microphone is allowed, everything else asks as usual.
pub fn answer(kind: PermissionKind) -> PermissionResponse {
    match kind {
        PermissionKind::Microphone => PermissionResponse::Allow,
        _ => PermissionResponse::Default,
    }
}

/// Clears a "Block" that WebView2 remembered for this window's page, so the microphone works again.
#[cfg(windows)]
pub fn forget_block(w: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Profile4, ICoreWebView2_13, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_DEFAULT,
    };
    use webview2_com::SetPermissionStateCompletedHandler;
    use windows::core::{Interface, HSTRING};

    let Some(origin) = w.url().ok().map(|u| u.origin().ascii_serialization()) else {
        return;
    };
    let _ = w.with_webview(move |webview| {
        // SAFETY: COM calls on the live webview, on the thread `with_webview` runs them on.
        unsafe {
            let Ok(core) = webview.controller().CoreWebView2() else { return };
            let Ok(profile) = core.cast::<ICoreWebView2_13>().and_then(|c| c.Profile()) else { return };
            let Ok(profile) = profile.cast::<ICoreWebView2Profile4>() else { return };
            let done = SetPermissionStateCompletedHandler::create(Box::new(|_| Ok(())));
            let _ = profile.SetPermissionState(COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, &HSTRING::from(origin), COREWEBVIEW2_PERMISSION_STATE_DEFAULT, &done);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_only_the_microphone() {
        assert!(matches!(answer(PermissionKind::Microphone), PermissionResponse::Allow));
        assert!(matches!(answer(PermissionKind::Camera), PermissionResponse::Default));
        assert!(matches!(answer(PermissionKind::Geolocation), PermissionResponse::Default));
    }
}
