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
| `env_file` | where the env file lives on the target (1.6.0; default `/etc/<name>/<name>.env`) — a migrated project records the measured path | `/appdata/almanac/almanac-config/latch.env` |
| `vmid` | the LXC's vmid once adopted (1.7.1); `service.yml` and its hostname `<vmid>-app-<name>` come from it — a sync no longer resets them to 0 | `112` |
| `deny_ignore` | RUSTSEC ids cargo-deny ignores for this project (1.7.0), each a reviewed decision with its reason in a comment beside it | `["RUSTSEC-2023-0071"]` |
| `latch_env` | the `--env` the latch unit passes (1.6.0; default `prod`; `""` = no `--env`, latch's own default) | `""` |
| `vmid` / `stack` | for `service.yml`; placeholders until adoption | `0` / `inbox` |

Rendered paths mirror this directory: `scaffold/.github/workflows/ci.yml`
lands at `.github/workflows/ci.yml`. A file named `*.tmpl` loses the
suffix (`Cargo.toml.tmpl` → `Cargo.toml`), which keeps editors from
treating templates as the real thing.

Files the project owns after `new` and that `sync` therefore never
overwrites without `--write --force`: `src/**`, `README.md`, `CHANGELOG.md`,
`docs/**`. Everything else is the kit's contract (H3) and `sync` shows the
diff.

## What sync keeps

`chassis sync --write` rewrites the kit-owned files. Two places are the
project's own and survive every sync (1.6.0): `.claude/hooks/gates.project.sh`
(run by the kit's `gates.sh` and CI when present — a module-boundary grep, a
version-consistency script, a SQL guard) and everything in `.gitignore`
under `# --- project additions below (kept by chassis sync) ---`.
