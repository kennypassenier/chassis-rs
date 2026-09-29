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
| `kp_themes` | the kp-themes version the kit vendors | `8.0.0` |
| `state_dir` | the default state root | `/var/lib/inbox` |
| `env_file` | where the env file lives on the target (1.6.0; default `/etc/<name>/<name>.env`) — a migrated project records the measured path | `/appdata/almanac/almanac-config/latch.env` |
| `vmid` | the LXC's vmid once adopted (1.7.1); `service.yml` and its hostname `<vmid>-app-<name>` come from it — a sync no longer resets them to 0 | `112` |
| `deny_ignore` | RUSTSEC ids cargo-deny ignores for this project (1.7.0), each a reviewed decision with its reason in a comment beside it | `["RUSTSEC-2023-0071"]` |
| `latch_env` | the `--env` the latch unit passes (1.6.0; default `prod`; `""` = no `--env`, latch's own default) | `""` |
| `vmid` / `stack` | for `service.yml`; placeholders until adoption | `0` / `inbox` |
| `knobs_table` | the kit's knob table as Markdown, pre-rendered from `AppSpec::knobs()` for `docs/KIT.md` (K27, K31) | `\| Key \| Env \| …` |

Rendered paths mirror this directory: `scaffold/.claude/hooks/gates.sh`
lands at `.claude/hooks/gates.sh`. A file named `*.tmpl` loses the
suffix (`Cargo.toml.tmpl` → `Cargo.toml`), which keeps editors from
treating templates as the real thing.

Files the project owns after `new` and that `sync` therefore never
overwrites without `--write --force`: `src/**`, `README.md`, `CHANGELOG.md`,
`docs/**` — except `docs/KIT.md`, which is generated (K27) and therefore
kit-owned. Everything else is the kit's contract (H3) and `sync` shows the
diff.

There is no `.github/workflows/` since 3.0.0 (Kenny, 2026-09-29: tests and
release builds run locally, GitHub Actions builds nothing). What the old
`ci.yml` ran is the gate `chassis release` runs on this machine, and what
`release.yml` built is built there too; `sync` reports the two files as
obsolete in a project that still has them and `sync --write` removes them.

## What sync keeps

`chassis sync --write` rewrites the kit-owned files. Two places are the
project's own and survive every sync (1.6.0): `.claude/hooks/gates.project.sh`
(run by the kit's `gates.sh` and by `chassis release` when present, with
`CHASSIS_RELEASE_GATE=1` set in the release gate — a module-boundary grep, a
version-consistency script, a SQL guard) and everything in `.gitignore`
under `# --- project additions below (kept by chassis sync) ---`.

## What sync compares besides files

Some drift is not a file diff (three things went wrong on 2026-09-06 that
no file diff could show), so
`chassis sync` compares them too (K32) and prints each difference after the
diffs as `! <what>: <project value> vs <expected> — <remedy>`:

| Comparison | Project side | Expected side | `--write` |
|---|---|---|---|
| kit tag | the `tag` (and `version`) of the `chassis` dependency in `Cargo.toml` | `chassis_tag` in `.chassis.toml` (`v1.7.1` and `1.7.1` are equal) | reports only — `Cargo.toml` is project-owned; a `path` dependency is a note, not drift |
| `kp_themes` | `kp_themes` in `.chassis.toml` | the kp-themes version the running `chassis` vendors (read from the kit's `KP_THEMES.sha256`) | rewrites the one line, comments kept |
| obsolete files (3.0.0) | `.github/workflows/ci.yml`, `.github/workflows/release.yml` present | absent: `chassis release` does their work locally | removes them, and `.github/workflows` once it is empty |
| `required_checks` (3.0.0) | a non-empty `required_checks` in `.chassis.toml` | none: there is no CI job to wait for | reports only — delete the line by hand |
| branch protection (`--remote` only, needs `gh`) | the checks, `strict` and `enforce_admins` of `main`'s protection | no required checks, not strict, admins not enforced — what `--protect` sets | `--protect` repairs and reads back |

Any of them makes `sync` exit 1 like a file diff does; the closing line
`in sync with the scaffold of chassis X` appears only when nothing drifted.
Without `--remote` sync needs no network and no token, so a script can run
it as a drift check.
