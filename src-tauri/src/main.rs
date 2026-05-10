#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "tauri-runtime")]
fn main() {
    wodouyao_lib::run()
}

#[cfg(not(feature = "tauri-runtime"))]
fn main() {
    eprintln!("Built without tauri-runtime; use the wodouyao-server binary instead.");
    std::process::exit(1);
}
