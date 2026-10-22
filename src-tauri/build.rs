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
    // The binary's native API level (runtime.json, see src/ota.rs): web bundles built for
    // another level are never served by this binary.
    println!("cargo:rerun-if-changed=runtime.json");
    let json = std::fs::read_to_string("runtime.json").expect("src-tauri/runtime.json");
    let v: serde_json::Value = serde_json::from_str(&json).expect("runtime.json is not JSON");
    let runtime = v["RUNTIME"].as_u64().filter(|n| *n > 0).expect("runtime.json needs a positive integer RUNTIME");
    println!("cargo:rustc-env=DAYBLOOM_RUNTIME={runtime}");
    tauri_build::build()
}
