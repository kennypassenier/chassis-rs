//! `chassis` — scaffold, sync and release for services built on the kit.
//!
//! L0: the binary exists and answers `--version`; the subcommands `new`,
//! `sync` and `release` arrive in L6 (K23).

#![forbid(unsafe_code)]

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("--version") | Some("-V") => println!("chassis {}", env!("CARGO_PKG_VERSION")),
        _ => {
            eprintln!(
                "chassis {}: no subcommands yet (L0 walking skeleton). What now: run with --version; `new`, `sync` and `release` arrive in milestone L6.",
                env!("CARGO_PKG_VERSION")
            );
            std::process::exit(2);
        }
    }
}
