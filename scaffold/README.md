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
| `kp_themes` | the kp-themes version the kit vendors | `11.2.0` |
| `state_dir` | the default state root | `/var/lib/inbox` |
| `env_file` | where the env file lives on the target (1.6.0; default `/etc/<name>/<name>.env`) — a migrated project records the measured path | `/appdata/almanac/almanac-config/latch.env` |
| `vmid` | the LXC's vmid once adopted (1.7.1); `service.yml` and its hostname `<vmid>-app-<name>` come from it — a sync no longer resets them to 0 | `112` |
| `deny_ignore` | RUSTSEC ids cargo-deny ignores for this project (1.7.0), each a reviewed decision with its reason in a comment beside it | `["RUSTSEC-2023-0071"]` |
| `unit_service` | the project's own `[Service]` directives, rendered into `deploy/<name>.service` after `ExecStart=` so `chassis sync --write` keeps them (fix-14); a `# …` line may explain one | `["ExecReload=/bin/kill -HUP $MAINPID"]` |
| `image` | whether `chassis release` builds and pushes a container image (3.3.0). Absent: no image when `deploy/service.yml` names a `binary:` (a native unit), else an image | `false` |
| `latch_env` | the `--env` the latch unit passes (1.6.0; default `prod`; `""` = no `--env`, latch's own default) | `""` |
| `vmid` / `stack` | for `service.yml`; placeholders until adoption | `0` / `inbox` |
| `knobs_table` | the kit's knob table as Markdown, pre-rendered from `AppSpec::knobs()` for `docs/KIT.md` (K27, K31) | `\| Key \| Env \| …` |

### `[release]` in `.chassis.toml` (homelab-shared-4)

How `chassis release` differs from "one static musl binary named like the
project". The table is optional; every key has a default that is the
behaviour before it existed, and an unchanged record is written without it.
None of these reach a rendered template.

| Key | Meaning | Default |
|---|---|---|
| `binaries` | the binaries one release ships, each built with `--bin <name>`, copied to `dist/<name>`, listed in `SHA256SUMS` and uploaded; the first one answers `--version` in the gate | `[]` = the one binary named like the project, built with no `--bin` |
| `build` | `"musl"`: static, built in `rust:<toolchain>-slim-trixie`, refused if it links dynamically. `"glibc"`: dynamically linked, built in a Debian image into `target-glibc/` (add it to `.gitignore`), no `ldd` refusal | `"musl"` |
| `glibc_image` | the image of the glibc build | `rust:<toolchain>-slim-bookworm` |
| `sign` | whether `scripts/sign-release.sh` runs at the end (and must exist). `false`: the release stays unsigned and you sign it yourself | `true` |
| `notes` | `"local"`: the text `chassis release` writes. `"generated"`: `gh release create --generate-notes` | `"local"` |

A workspace root with no `[package]` keeps its one shared version under
`[workspace.package]`; `chassis release` writes the new version there, and
`[package]` still wins when both exist. No key is needed.

`[release.hooks]` names the project's own scripts. Each entry is one command
line (split on whitespace), run from the project root with
`CHASSIS_RELEASE_VERSION`, `CHASSIS_RELEASE_TAG` and
`CHASSIS_RELEASE_DRY_RUN` (`1`/`0`) set; a non-zero exit stops the release
before anything is changed, and a relative path such as `scripts/x` is
resolved against the project root. The kit knows nothing about what they
check.

| Key | Runs | Default |
|---|---|---|
| `pre_gate` | a list; after the tree, branch and tag checks, before the gate | `[]` |
| `post_gate` | a list; after the gate is green, before the version is written | `[]` |
| `tag_notes` | one command whose stdout becomes the tag's annotation (`git tag -a -F`), run right after `pre_gate`; it must print something | unset = the plain lightweight tag |

```toml
[release]
binaries = ["homelab-host", "homelab", "homelab-admin"]
build = "glibc"
sign = false
notes = "generated"

[release.hooks]
pre_gate = ["scripts/measure-due.py --run"]
post_gate = ["scripts/host-drift.sh"]
tag_notes = ".githooks/check-register.py --release-text"
```

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
