fn main() {
    // The binary's native API level (runtime.json, see src/ota.rs): web bundles built for
    // another level are never served by this binary.
    println!("cargo:rerun-if-changed=runtime.json");
    let json = std::fs::read_to_string("runtime.json").expect("src-tauri/runtime.json");
    let v: serde_json::Value = serde_json::from_str(&json).expect("runtime.json is not JSON");
    let runtime = v["RUNTIME"].as_u64().filter(|n| *n > 0).expect("runtime.json needs a positive integer RUNTIME");
    println!("cargo:rustc-env=DAYBLOOM_RUNTIME={runtime}");
    tauri_build::build()
}
