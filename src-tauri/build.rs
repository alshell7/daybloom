fn main() {
    let os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    // Android 15+ devices may use 16 KB memory pages; NDK 27 still links for 4 KB unless told.
    // Set here, not in .cargo/config.toml, so it holds however cargo is started (tauri's CLI,
    // CI, an IDE) and whatever RUSTFLAGS say.
    if os == "android" {
        println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
    }
    // MinGW exports every symbol of a DLL by default, and the app's cdylib (which Android
    // needs) has more than its 65k limit; export none instead (nothing calls into it there).
    if os == "windows" && env == "gnu" {
        println!("cargo:rustc-link-arg-cdylib=-Wl,--exclude-all-symbols");
    }
    tauri_build::build()
}
