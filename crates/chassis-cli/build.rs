//! Hands the kit's Rust channel to the CLI (`CHASSIS_TOOLCHAIN`), read from
//! the workspace's `rust-toolchain.toml`, so the toolchain a new project pins
//! is never typed a second time (Kenny, 2026-11-03: no hard-coded versions).

use std::{env, fs, path::Path};

fn main() {
    let file = Path::new(&env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"))
        .join("../../rust-toolchain.toml");
    println!("cargo:rerun-if-changed={}", file.display());
    let text = fs::read_to_string(&file).unwrap_or_else(|e| panic!("read {}: {e}", file.display()));
    let channel = text
        .lines()
        .map(str::trim)
        .find_map(|l| l.strip_prefix("channel"))
        .and_then(|rest| rest.split('"').nth(1))
        .unwrap_or_else(|| panic!("{} names no channel = \"…\"", file.display()));
    println!("cargo:rustc-env=CHASSIS_TOOLCHAIN={channel}");
}
