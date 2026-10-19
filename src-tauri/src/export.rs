//! Saving exports (bills, timesheets) where people look for them: the Downloads folder,
//! then optionally opening the file (an HTML bill opens in the browser, ready to print to
//! PDF; a CSV opens in the spreadsheet app) or showing it in Finder / Explorer.

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

/// Only a plain file name with a known extension: no folders, no surprises.
fn clean_name(name: &str) -> Result<String, String> {
    let base: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || " ._-()".contains(c) { c } else { '-' })
        .collect();
    let base = base.trim().trim_start_matches('.').to_string();
    let ok_ext = [".html", ".csv", ".json", ".txt"];
    if base.is_empty() || base.len() > 120 || !ok_ext.iter().any(|e| base.to_ascii_lowercase().ends_with(e)) {
        return Err("unsupported file name".into());
    }
    Ok(base)
}

fn unique(dir: &PathBuf, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) => (&name[..i], &name[i..]),
        None => (name, ""),
    };
    (2..1000)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .unwrap_or(first)
}

/// Writes `contents` to Downloads/<name> (made unique) and returns the full path.
/// `then`: "open" opens it with the default app, "reveal" shows it in the folder.
#[tauri::command]
pub fn export_save(app: AppHandle, name: String, contents: String, then: Option<String>) -> Result<String, String> {
    let name = clean_name(&name)?;
    let p = app.path();
    let dir = p
        .download_dir()
        .or_else(|_| p.document_dir())
        .or_else(|_| p.app_data_dir())
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = unique(&dir, &name);
    fs::write(&path, contents).map_err(|e| format!("could not save {name}: {e}"))?;
    match then.as_deref() {
        Some("open") => {
            let _ = app.opener().open_path(path.to_string_lossy(), None::<&str>);
        }
        Some("reveal") => {
            let _ = app.opener().reveal_item_in_dir(&path);
        }
        _ => {}
    }
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_plain_files() {
        assert_eq!(clean_name("Invoice INV-2026-0001.html").unwrap(), "Invoice INV-2026-0001.html");
        assert_eq!(clean_name("../../etc/passwd.csv").unwrap(), "-..-etc-passwd.csv");
        assert!(clean_name("evil.sh").is_err());
        assert!(clean_name(".html").is_err() || clean_name(".html").unwrap() != ".html");
        assert!(clean_name("").is_err());
    }
}
