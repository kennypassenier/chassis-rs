# Changelog

All notable changes to chassis-rs. Semantic versioning over two contracts
(SCOPE H3): the Rust API services call, and the shape of the files the
scaffold writes. A breaking change in either is a major and carries a
**Migration** section; `chassis release` refuses a major without one.

## [Unreleased]

Kit batch 3 (F1–F8, weighed by Kenny 2026-09-06): seven Essential candidates
built in parallel worktrees on 2026-09-07. Additive only; nothing a 1.7.x
consumer must change.

### Added
- **`chassis::testing`** (K25, feature `testing`, implies `dashboard`; for a
  project's dev-dependencies): `TestApp::start` / `start_with` /
  `start_with_env` / `start_open` bring a service up in-process — temporary
  state dir, fresh `<P>_TOKEN` and `<P>_SECRET_KEY`, port 0 — with `login`,
  `issue_client` (K16 form fields included), `bearer`, `page`,
  `get_json` / `post_json` / `delete`, `as_browser` / `as_cross_site_browser`
  (Chrome's form-submit headers, CF-7) and `shutdown`. It is the harness kyu,
  Almanac and the inbox example each wrote by hand; the kit's own in-process
  suites now run on it. `FakeReleaseServer` (with `self-update`) is the update
  suite's signed fake release, made public. `docs/TESTING.md` carries the
  worked example, which the suite compiles and runs.
- **Project vocabulary** (K28): `App::vocabulary(singular, plural)` names what
  this service calls a client ("source"/"sources" for Almanac). Every kit
  sentence on the login, clients and status pages and every refusal from the
  clients API use it; the heading and nav label default to the capitalised
  plural (`clients_label` still wins when set). Presentation only: paths,
  JSON keys, cookies, metrics and log fields keep saying `client`.
- **Row and section actions** (K29): `App::client_action(ClientAction)` puts a
  project button on every active client row (`{id}` in the route becomes the
  client's id); `StatusSection::actions()` (a default method) puts buttons
  under a section on `/`. Both render through the kit's `[data-post]`
  mechanism with arm-before-act and a busy label on destructive ones; the
  route is the project's own, behind the admin login. Almanac's stand-alone
  "Reload profiles from disk" form becomes one `SectionAction`.
- **`chassis clients`** (K30): `chassis clients <list|issue|reissue|revoke|
  delete|reveal> --url <base> --token-env <VAR> [--field k=v]... [--json]
  [--timeout-secs N]` manages a running service's client tokens over its own
  `/api/clients`, for headless services (http-switchboard, kyu-runner) that
  need a token for a caller like Alertmanager. The admin token comes from the
  environment only; `issue`, `reissue` and `reveal` print the token once on
  stdout and nothing else; every refusal names a remedy; exit codes 0/1/2.
- **The knob table from the spec** (K31): every kit knob carries a
  one-sentence meaning and the feature that reads it; `AppSpec::knobs_markdown()`
  renders the list as a Markdown table and the new control `<name> --knobs`
  prints it — answered before any configuration is read, like `--version`.
  The hand-written knob tables in CONFIGURATION.md are gone; they point at
  `--knobs`.
- **`docs/KIT.md` in every project** (K27): `chassis new` writes and `chassis
  sync` keeps a generated, kit-owned document describing what the project gets
  from the kit — the door (client tokens, the two secrets, `gen-secret`), the
  dashboard pages, `/healthz` and `/metrics`, self-update, notifications, the
  control commands, the full knob table for the pinned kit version, and where
  state lives.
- **`chassis sync` reports drift that is not a file** (K32): the kit tag
  `Cargo.toml` pins vs `.chassis.toml`'s `chassis_tag` (a path dependency is a
  note), `kp_themes` vs the version the kit vendors (`--write` corrects the
  record before rendering, since `docs/KIT.md` names it; a test pins the CLI's
  constant to `KP_THEMES.sha256`), and behind the new `--remote` flag main's
  branch protection (checks, `strict`, `enforce_admins`) vs the scaffold's CI
  job names — one list shared with `--protect`. Every difference is one
  `! <what>: <project> vs <expected> — <remedy>` line and exits 1; sync stays
  offline without `--remote`. Measured 2026-09-06 on Almanac (1.7.0 vs 1.7.1)
  and kyu (`gates` still required).

### Fixed
- `chassis new` drops `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_PREFIX`
  and `GIT_COMMON_DIR` for every tool it runs: from a pre-commit hook in a
  linked worktree, its `git init` + first commit landed in the caller's
  repository (and set `core.bare` on the shared config). Both `gates.sh`
  (the kit's and the scaffold's) unset the same variables, so any test that
  spawns git stays in its own directory. The scaffold copy reaches projects
  through `chassis sync`.
- A refusal on a `[data-post]` button (Re-issue, Revoke, Delete, and now
  project actions) was never visible: the remedy flashed during the button's
  busy spell was overwritten the same tick by the busy restore, and the button
  came back reading "Working…". The flash now outlives the busy spell and
  shows the kit's error and remedy for five seconds; Reveal reads "Hide" while
  a token is shown, as DASHBOARD.md always said.
- A wrong bearer on the admin routes (`/api/clients*`, pages) is answered with
  a JSON 401 and a remedy naming `<PREFIX>_TOKEN` instead of a redirect to
  `/login`; requests without any credential are still redirected (K30).
- `chassis sync` exits 1 whenever a difference is still there when the run
  ends — also under `--write`, for the drift it cannot fix (the kit tag in
  Cargo.toml, a branch protection without `--protect`). Before, `--write`
  exited 0 after printing the red line, so a script read green over an
  unresolved difference (K32, D1).

## [1.7.1] - 2026-09-06

### Fixed
- `.chassis.toml` gains `vmid`: `service.yml` and its hostname come from it,
  so a sync no longer resets an adopted project's stack file to vmid 0
  (Almanac's and kyu's did on their first sync).

## [1.7.0] - 2026-09-06

### Added
- **Issue-form fields and hooks** (K16): `App::client_form_field` adds a
  text or select field (options asked for at render time) to the clients
  page's issue form; `App::on_client_issued(client, fields)` runs before a
  token exists and may refuse; `App::on_client_deleted(client)` runs before
  a delete and may refuse — either error reaches the page with its remedy.
  Almanac's sources become one page: name + calendar → profile and token in
  one click. `POST /api/clients` accepts the extra fields as JSON keys next
  to `name`.
- **`deny_ignore` in `.chassis.toml`**: reviewed RUSTSEC exceptions reach
  the kit-owned `deny.toml`, so a sync keeps them — the first kit-CI run on
  Almanac was red on three advisories with nowhere to record the decision.

### Fixed
- The scaffold units set `<PREFIX>_STATE_DIR` explicitly from
  `.chassis.toml` instead of relying on the binary's compiled-in default —
  Almanac's rendered unit lacked the line CT 112 actually runs with.

## [1.6.0] - 2026-09-06

### Added
- **Project-owned gates** (M1): the scaffold's `gates.sh` and CI run
  `.claude/hooks/gates.project.sh` when it exists — a project keeps its own
  checks (a module-boundary grep, a version script, a SQL guard) in a file
  `chassis sync` never touches.
- **Measured deploy paths** (M2): `.chassis.toml` gains `env_file` (default
  `/etc/<name>/<name>.env`) and `latch_env` (default `prod`; `""` = no
  `--env`); the unit, the latch unit and `service.yml` render them, so a
  migrated project's deploy files can equal what its LXC actually runs.
- **`.gitignore` additions survive a sync** (M3): everything under
  `# --- project additions below (kept by chassis sync) ---` is kept.

## [1.5.1] - 2026-09-06

### Fixed
- The self-updater's `--check` probe retries a spawn that fails with
  `ETXTBSY` (the staged binary still held open for a moment) instead of
  declaring the release unusable — seen once in the kit's own CI.
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
- `/healthz` keeps a failed store write until a write to that **same path**
  succeeds; a good write elsewhere no longer clears it (it also made the
  health check race between parallel writers in the kit's own tests).
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
