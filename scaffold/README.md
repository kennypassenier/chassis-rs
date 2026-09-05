# The scaffold

Everything a service needs that a crate cannot carry (G2, K23): the files
`chassis new` writes into a fresh project and `chassis sync` compares an
existing one against. Each file is a minijinja template rendered with:

| Variable | Meaning | Example |
|---|---|---|
| `name` | the service's name: binary, unit, env prefix stem, state dir | `inbox` |
| `prefix` | upper-cased name with `-` → `_` | `INBOX` |
| `repo` | GitHub `owner/name` | `kennypassenier/inbox` |
| `owner` | GitHub owner | `kennypassenier` |
| `description` | one line for Cargo.toml and the README | `Clients post JSON messages…` |
| `toolchain` | the pinned Rust | `1.97` |
| `chassis_tag` | the kit tag the project pins | `v0.1.0` |
| `chassis_repo` | where the kit lives | `https://github.com/kennypassenier/chassis-rs` |
| `kp_themes` | the kp-themes version the kit vendors | `3.1.0` |
| `state_dir` | the default state root | `/var/lib/inbox` |
| `vmid` / `stack` | for `service.yml`; placeholders until adoption | `0` / `inbox` |

Rendered paths mirror this directory: `scaffold/.github/workflows/ci.yml`
lands at `.github/workflows/ci.yml`. A file named `*.tmpl` loses the
suffix (`Cargo.toml.tmpl` → `Cargo.toml`), which keeps editors from
treating templates as the real thing.

Files the project owns after `new` and that `sync` therefore never
overwrites without `--write --force`: `src/**`, `README.md`, `CHANGELOG.md`,
`docs/**`. Everything else is the kit's contract (H3) and `sync` shows the
diff.
