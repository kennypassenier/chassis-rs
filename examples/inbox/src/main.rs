//! inbox — the example service that proves the kit (K26).
//!
//! L0: it links against `chassis` and answers `--version`. The real
//! service (clients, messages, dashboard page) is assembled in L7.

#![forbid(unsafe_code)]

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("--version") | Some("-V") => {
            println!(
                "inbox {} (chassis {})",
                env!("CARGO_PKG_VERSION"),
                chassis::VERSION
            )
        }
        _ => {
            eprintln!(
                "inbox {}: nothing to serve yet (L0 walking skeleton). What now: run with --version; the service is assembled in milestone L7.",
                env!("CARGO_PKG_VERSION")
            );
            std::process::exit(2);
        }
    }
}
