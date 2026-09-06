# Changelog

All notable changes to chassis-rs. Semantic versioning over two contracts
(SCOPE H3): the Rust API services call, and the shape of the files the
scaffold writes. A breaking change in either is a major and carries a
**Migration** section; `chassis release` refuses a major without one.

## [Unreleased]

_Nothing yet._

## [1.5.1] - 2026-09-06

### Fixed
- **Dashboard forms were refused from Chrome** (CF-7, found live on
  CT 112 with Almanac 3.0.0): under `referrer-policy: no-referrer` a
  browser sends `Origin: null` on every form submit, and the CSRF rule
  refused it — login included. The CSRF guard now reads `Sec-Fetch-Site`
  first (`same-origin`/`none` pass, `cross-site`/`same-site` refused) and
  falls back to `Origin` vs `Host` only without it; the header is
  `referrer-policy: same-origin`. `tests/browser_forms.rs` sends what
  Chrome sends.
- A refusal answered to a browser navigation renders as a page in the
  dashboard layout (`templates/error.html`, same status, error and
  remedy, a way back) instead of a bare JSON document; scripts and API
  callers keep the JSON shape.
- `chassis release` (also `--dry-run`) refuses a repository whose
  `release.yml` builds a container image but has no `Dockerfile`, with the
  `chassis sync --write` remedy — kyu-runner's first v0.2.0 Release run
  failed on exactly that (CF-6 b).

### Changed
- The scaffold end-to-end test also runs `cargo deny check` on the
  generated project when cargo-deny is installed (the kit's CI installs
  it); the first remote project was red on cargo-deny while every local
  gate was green (CF-6 a).

## [1.5.0] - 2026-09-06

### Added

- **An open dashboard, as an opt-in.** `AppSpec::open_dashboard = true`
  lets a service run its dashboard without `<P>_TOKEN` and
  `<P>_SECRET_KEY`: no login, every page and every API route answers
  whoever reaches the port, a banner on every page, a warning at every
  start and at `--check`, nothing sealed on disk (clients live in memory,
  no session is minted, passkeys stay off). Off by default — a service
  that does not opt in refuses to start exactly as before, and the remedy
  now names the opt-in. Asked for by Kenny at kyu's step-2 form (K2-4,
  2026-09-06): "a dashboard without a token must stay possible; for kyu we
  ask for one anyway". Tests: `tests/open_dashboard.rs`.

## [1.4.1] - 2026-09-06

Two faults that the first remote `chassis new` and the first `chassis
release` on a real machine found within an hour of each other.

### Fixed

- **`chassis release` refused a machine with minisign installed.** The
  tool check ran `minisign --version`, which minisign 0.12 answers with
  exit 2; `-v` is accepted now. Test:
  `a_tool_that_only_answers_dash_v_counts_as_available`.
- **A generated project's CI was red on cargo-deny.** `wildcards = "deny"`
  flags a git dependency without a version requirement, and the scaffold's
  `Cargo.toml` had only the tag. It now carries `version = "<tag without
  v>"` next to the tag — what kyu-runner's migration had already added by
  hand. Test: `the_git_dependency_pins_a_version_next_to_its_tag`.

### Changed

- MIGRATION.md §10 step 1 makes `.chassis.toml` a required part of the
  copy: the three projects migrated on 2026-09-05 lacked it and `chassis
  release` refused all three.

## [1.4.0] - 2026-09-06

The two items Kenny put on the table after the Phase 10 retrospective.

### Added
- `update_notify_after_failures` (default 3): `update.failed` is emitted
  once, on the N-th consecutive failed release check, and `update.ok` once
  on recovery — not at every interval while a release host is down. This
  is Almanac's AR24 ("three strikes before notifying"), lost in its
  migration and now the kit's for every consumer. Until now a failed check
  emitted no event at all, only a log line.
- `passkey_ceremony_cap` (64), `passkey_ceremony_ttl_secs` (300) and
  `passkey_ceremonies_per_ip` (8): the pending-ceremony table's bounds are
  knobs (rule 27).

### Security
- **S6 closed.** The passkey ceremony table no longer refuses when full:
  the oldest ceremony makes room, one client IP can evict only its own
  share, and `/passkeys/login/*` sits behind the same per-IP limiter as
  `/login`. Before, one unauthenticated machine could start 64 ceremonies
  and block passkey login and registration for everyone for five minutes.

### Changed
- `scripts/release-kit.sh`: the kit's own verified publish chain (standing
  rule 36) — every step asserts its postcondition, the tag is cut from the
  verified `origin/main` SHA, the GitHub release comes last.

## [1.3.0] - 2026-09-05

Asked for by the Almanac migration and ratified as D-A1.

### Added
- `App::on_update_event(|event| …)`: a project's listener on the kit's
  update events (`update.installed`, `update.ok`, `update.failed`,
  `update.rolled_back`, `update.held`), from the autonomous loop, the
  read-only watch and the `update` subcommand alike. The kit still handles
  each event itself (the `notify` feature's webhooks, or a log line); the
  hook runs alongside, so a project without a config file can speak its own
  vocabulary to its own notifier — Almanac's `almanac-update`, `-reverted`
  and `-unverified` to Home Assistant. `chassis::UpdateEvent` is the event
  type (`kind`, `version`, `detail`).

## [1.2.0] - 2026-09-05

Found while migrating kyu-runner, http-switchboard and kyu (AFK round 2, A2).

### Added
- `AppSpec.help_extra`: text appended to `--help` for the project's own
  environment variables and subcommands (kyu's `KYU_TOKEN`, Almanac's
  `ALMANAC_BOOTSTRAP_TOKEN` — the kit cannot know them).
- `App::needs_project_config()`: true only for a real start and `--check`.
  `--version`, `--help`, `gen-secret`, `--healthcheck`, `--print-config`,
  `update` and `rekey` are the kit's alone and must work without the
  project's configuration; two projects broke their `--healthcheck` on a
  box without a config file by reading it first.
- `App::update_gate(|| Option<String>)`: the project's veto on an
  autonomous update check — `Some(reason)` defers it to the next interval
  (Almanac's "never restart while captures are retained", AR25).
  Supervised updates are not gated.
- Feature `assets` (implied by `dashboard`): `chassis::shell::assets::ASSETS`
  for a project with its own dashboard, so it serves the vendored fonts
  (`fonts.css`, `fonts/*.woff2`) and kp-themes files itself and the kit's
  CSP (`font-src 'self'`) holds without a CDN.

### Fixed
- `--help` printed on stderr with exit 1, as if it were a refusal. It is an
  answer now: stdout, exit 0 (`Control::Help`). The unknown-flag refusal
  still points at `--help`.

## [1.1.0] - 2026-09-05

### Added
- `App::on_start(f)`: runs once after the socket is bound and readiness
  was announced, on the serving path only — where a service spawns its
  background workers (a pump, a poller). `--check` never reaches it. Found
  by the first migration (kyu-runner): a pump spawned before `run()` would
  start before logging and also under `--check`.
- `AppSpec::knob_keys()` and a public `App::spec`: a service that parses
  the shared config file with `deny_unknown_fields` strips the kit's keys
  first (see `docs/MIGRATION.md`).

## [1.0.0] - 2026-09-05

First release: the library (features `core`, `dashboard`, `passkeys`,
`self-update`, `notify`), the `chassis` command (`new`, `sync`, `release`)
and the `inbox` example. Consumers pin `tag = "v1.0.0"`. What is proven
where, and what is deliberately not, is `docs/TEST_PLAN.md`; the
Migration notes below apply to services built against the unreleased
0.1.x tree during development.

### Migration
- Release signatures must carry the trusted comment `<repo> v<version>`
  (`scaffold/scripts/sign-release.sh` and `chassis release` do this); a
  manifest signed without it is refused as "for another version".
- A plain `http://` `update_url` needs `<P>_UPDATE_ALLOW_INSECURE=true`.
- Secrets are no longer accepted as `--token` / `--secret-key` flags: set
  `<P>_TOKEN` and `<P>_SECRET_KEY` in the environment file.
- Services install to `/opt/<name>/bin/<name>`; the generated unit's
  `ReadWritePaths` covers only that directory (S2). Move the binary and
  update `service.yml` when taking the new unit.
- `--check` and start refuse a missing or unwritable state directory.
- `render_project` takes `(active_nav, source, ctx: impl Serialize)`;
  project pages get the `Dashboard` as an axum `Extension`.

### Added (Phase 7 hardening)
- `<P>_UPDATE_PUBKEY` (trust-root override, logged and shown on the card),
  `<P>_UPDATE_ALLOW_INSECURE`, `<P>_UPDATE_MAX_DOWNLOAD_BYTES`,
  `<P>_TIMEOUT_STOP_SECS` (mirrors the unit's `TimeoutStopSec` so `--check`
  can warn).
- `rekey` subcommand: re-seal every store from `<P>_OLD_SECRET_KEY` to
  `<P>_SECRET_KEY`.
- Read-only version watch in `off` and `supervised`; the update card shows a
  newer release without installing it.
- Skip list after an autonomous rollback (`update-skip.json`): a version
  that crashed is never reinstalled by the same process (CF-3).
- Built-in `store` subsystem in `/healthz`; state-dir probe at `--check`
  and start.
- Per-client-token API rate limit (429 + Retry-After), limiter pruning.
- Startup warnings: empty `trusted_proxies` on a non-loopback listen, short
  `TimeoutStopSec`; untrusted `X-Forwarded-*` noted once on the problems
  card; the self-update mode decision logged at start.
- Security headers on every response (CSP `script-src 'self'`, nosniff,
  DENY, no-referrer); fonts vendored; no inline script in the layout.
- Scaffold: `.dockerignore`, journald drop-in, compose example with log
  rotation, `--locked` release build, read-only CI token, SHA-pinned
  actions, systemd hardening set, lockfile in the first commit.

### Fixed
- Oversized bodies on captured API routes answered with an empty body; now
  413 with the kit's JSON error (both declared and streamed bodies).
- Webhook URLs were logged in full on failure; now scheme and host only.
- The SIGTERM listener was registered after the bind; a signal in that
  window killed the process instead of draining (found by the E2E suite
  under load).
- `main.rs` template was not rustfmt-clean; `Cargo.lock` was missing from a
  new project's first commit (both found by the generated-project gates E2E).


### Added
- The kit: `core` (configuration with provenance, errors with a remedy,
  logging, request-id, `/healthz` with `version`, `/metrics`, guards,
  graceful shutdown with `Type=notify`), `dashboard` (token + session
  login, Clients with tokens and last requests, status page, kp-themes
  3.1.0), `passkeys` (WebAuthn behind a trusted TLS proxy),
  `self-update` (off / supervised / autonomous, minisign-verified,
  staged probe, link+rename swap, rollback), `notify` (per-event webhooks
  with retries and a fallback).
- The `chassis` command: `new`, `sync`, `release`, and the scaffold they
  render (CI and Release workflows, Dockerfile, golden systemd unit,
  homelab `service.yml`, hooks).
- `examples/inbox`, the example service, and `examples/minimal.rs`.
