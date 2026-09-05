# Scope — chassis-rs

Approved by Kenny on 2026-09-05 (Phase 0 approval form, all 17 statements
"Klopt"). Every statement below was an item of that form; wording changes
go through a mini-round (FORM_PROTOCOL §5).

## What this is

chassis-rs is the shared foundation for Kenny's Rust web services: a
library crate with feature flags plus a scaffold command. Four services
exist today — kyu (message hub), Almanac (events → Google Calendar),
HTTPSwitchboard (message shape translator) and kyu-runner (kyu → Home
Assistant pump) — and each re-implemented the same foundation by hand.
The inventory of 2026-09-05 measured roughly 5,500 of Almanac's 14,000
lines as foundation rather than product.

## Goals

- **G1 · One foundation crate.** A library crate with feature flags
  (`core`, `dashboard`, `self-update`, `notify`) that every Rust web
  service builds on. `core` provides configuration, logging, errors
  with a remedy, health, metrics and graceful shutdown. `dashboard`
  provides login, the Clients page (tokens, last requests), the status
  page and the kp-themes chrome. `self-update` provides the three modes
  (off / supervised / autonomous). `notify` provides per-event webhooks.
- **G2 · A scaffold command for what a crate cannot carry.** A small
  CLI, `chassis`, with `new` (write a new project AND create and
  configure its GitHub repository via `gh`: branch protection, required
  checks), `sync` (diff an existing project against the current
  scaffold) and `release` (bump and tag, wait for CI, download and
  verify the artefacts, sign locally with minisign, upload `.minisig`
  and `VERSION`). It writes the CI and release workflows, Dockerfile,
  systemd unit, `service.yml` for the homelab, sign script, git hooks,
  `deny.toml`, toolchain pin, a minimal `main.rs` and `Cargo.toml`.
- **G3 · v1 proves itself on an example service before anyone
  migrates.** The first release is tested on a new, small example
  service created with `chassis new`, running under systemd on a
  scratch LXC and adopted by the homelab. Only then do the four
  existing projects migrate, each as its own mini-project in its own
  repository and session. Their order is decided then, not now.
- **G4 · Homelab compatibility is a requirement, not an extra.** A
  service on chassis-rs meets, without bespoke work, what the homelab
  expects: norm N1 (graceful shutdown), norm N2 (verifiable release),
  the supervised-update contract (exit 0 when already current, never
  restart itself), a `version` field in `/healthz`, one state root, the
  golden systemd unit, and `--version` / `--check` that never start the
  application.
- **G5 · Readable for a beginning Rust programmer.** A concrete API
  without generic builder constructions, an `examples/` directory with a
  working one-file service, rustdoc that opens every module in plain
  language before the types, and a documented eject route: every module
  small and loose enough to copy into a project and adapt. All of it in
  English.

## Non-goals

- **N1 · No domain logic in the crate.** What a service actually does
  (kyu's queue, Almanac's calendars, HTTPSwitchboard's translation,
  kyu-runner's pump) stays in that project. chassis-rs knows only what
  every service needs. A module that serves one project does not belong.
- **N2 · No in-process TLS, no unprotected mode, no token scopes.**
  HTTPS comes from Traefik in front, not from the binary (passkeys work
  only behind that proxy). A dashboard never starts without a login
  token. Per-token scopes are not in v1 and sit as Later in the register.
- **N3 · No crates.io, no runtime plugins, no branch-following.** The
  crate is not published to crates.io; projects take it as a git
  dependency pinned to a tag, with `SHA256SUMS` beside every release,
  like kp-themes. A service never loads code at runtime: a new kit
  version means rebuild and release. Projects follow a tag, never a
  branch, so a kit change never alters a project without someone
  choosing it.
- **N4 · The four migrations are not part of this project.** Moving
  kyu, Almanac, HTTPSwitchboard and kyu-runner happens in each project,
  with its own tests and release. chassis-rs only guarantees that the
  extension points they need exist, and keeps a per-project
  compatibility checklist in its docs (what each project must change,
  from the 2026-09-05 inventory).

## Success criteria

- **C1 · From nothing to a running, signed service with three actions
  by Kenny.** A new service goes from `chassis new` to a signed GitHub
  release with a dashboard, running under systemd on a scratch LXC and
  adopted by `homelab adopt`, where Kenny does exactly three things
  himself: choose the name, type the signing password, and say "go" for
  publishing. Every additional manual step is a defect that enters the
  register.
- **C2 · The broken-release drill passes in both modes.** A
  deliberately broken release (verifies correctly, does not start) is
  installed via the drill flag. In supervised mode the homelab rolls the
  service back and reports it; in autonomous mode the kit restores the
  previous binary itself on the next start. Both drills run on the
  scratch LXC with the real binary, never a test double, and the outcome
  is evidence in the release report.
- **C3 · A kp-themes update is one kit release.** Proof: bump kp-themes
  in the kit, release the kit, rebuild the example service with only a
  tag change, and it shows the new theme without a single kp-themes file
  touched in the example service.
- **C4 · Kenny reads the example service's `main.rs` and understands
  every line.** Before the release Kenny reads the example's `main.rs`
  (target: at most forty lines) and the rustdoc of one module of his
  choice, and signs off that he understands what is there. Whatever he
  does not understand is rewritten or documented before the release.

## Hard constraints

- **H1 · Rust, pinned toolchain, axum and tokio.** Rust edition 2024
  with the toolchain pinned as the four projects pin it (1.97 today),
  axum 0.8 as the web layer and tokio as the runtime — the same versions
  as the projects that will build on it, so a migration never pulls in a
  second framework. Phase 3 fixes the remaining libraries and the target
  platforms formally.
- **H2 · Public repository, one ecosystem signing key, no secrets in
  git.** The repository is public under `kennypassenier`, like kyu,
  Almanac and kp-themes. Releases are signed with the existing minisign
  key that latch and Almanac already share; the public half lives in the
  crate. Secrets never sit in the repository, in argv or in logs, and
  tests assert it (standing rule 10).
- **H3 · Semver over the kit API and the scaffold files.** The version
  follows semver over two contracts: the Rust API projects call, and the
  shape of the files the scaffold writes (workflow names, unit fields,
  `service.yml`). A breaking change in either is a major, with a
  migration note in the CHANGELOG saying what a project must change.
- **H4 · The dev procedure with every gate, no paid tooling.** All
  eleven phases with their forms, git-native hooks and branch protection
  from Phase 5, the architecture-critic in Phase 4 (mandatory: the kit
  touches secrets, network and auth), `/security-review` in Phase 7, and
  only tooling included in the subscription.

## Decisions carried in from the scoping session (2026-09-05)

These were taken in the starterskit session before Phase 0 and are the
starting position for Phases 2–4; they are recorded here so no later
phase re-derives them from memory. Feature IDs are assigned in Phase 2.

- Shape: crate + scaffold script (not a cargo-generate template).
- Login: bootstrap token + session cookie, plus passkeys (WebAuthn)
  offered only when served over HTTPS; TLS terminated by Traefik.
- Clients page: named "Clients" in code and URL, label overridable per
  project. Token actions: issue, re-issue, revoke (row kept, name
  freed), delete; reveal for a configurable window, copy token only,
  copy full command. Last N requests per client (redacted headers,
  truncated body, configurable TTL) shown on the row — replaces
  Almanac's captures page and its capture-only token. A "send test
  request" button per client.
- Self-update: one module, three modes (off / supervised via
  `<name> update` / autonomous with timer, staged `--check` probe,
  rename swap, rollback marker), container detection forces off; hold
  and drill flag; state copy before every swap and a rule that
  migrations stay readable one version back; update card on the status
  page and a latest-release check even when off.
- Releases: binary, `SHA256SUMS`, `SHA256SUMS.minisig`, `VERSION`;
  CI builds and publishes with `GITHUB_TOKEN` (no PAT); Kenny signs
  locally via one command.
- Notifications: a fixed list of kit events (update ok / failed /
  rolled back, health degraded, started) plus project events; per event
  one or more webhooks (URL, method, headers, body template; secrets
  from env); presets for a kyu topic and a Home Assistant webhook;
  optional fallback chain.
- Configuration: CLI flag > env var > config file > default; prefix
  derived from the app name; `${VAR}` references in the file; one state
  root env var and no per-path overrides; `--version`, `--check` and
  `--print-config` never start the app; secrets shown as `***`.
- Health and metrics: `/healthz` JSON with `version` and per-subsystem
  status (no `/readyz`); `/metrics` with a kit baseline and an app
  registry, existing metric names preserved, a blind-spot sentence per
  measurement; `--healthcheck` self-probe for distroless images.
- Logging: tracing to stderr as text, JSON optional; request-id in
  every log line and response header. The homelab's Alloy has no JSON
  stage today; asking for one is an open item with the Homelab Rust
  session once the kit exists.
- Guards: same-origin CSRF guard, rate limiting on login and per token,
  body size and concurrency as configurable knobs.
- Rated Gewenst (1.x, after 1.0): clap for the CLI and one backoff
  helper; quiesce / backup-paths contract (homelab builds its side once
  it exists). Rated Later: token scopes. Rated Niet doen: unprotected
  mode, in-process TLS, `/readyz`.
- Open with the Homelab Rust session, to be requested once the kit can
  deliver: an Alloy JSON stage for logs; the quiesce call in the nightly
  backup.

## Build vs buy (Phase 1 record, greenfield) — ratified in R1

Crate survey of 2026-09-05 (versions and dates from crates.io that day).
Per concern: use the crate, build our own, or hybrid — with what each
wins and loses. The recommendation is what T3 in
ARCHITECTURE_DECISIONS.md adopts.

| Concern | Candidates | Decision | Why |
|---|---|---|---|
| Config layering + `${VAR}` + provenance | `config-rs` 0.15.25 (active), `figment` 0.10.19 (2024) | **Build our own** (~150 lines) | neither crate expands `${VAR}` inside values nor reports the source of each value, and `--print-config` (K2) needs both; clap supplies the flag layer, `toml` the file layer |
| HTTP middleware | `tower-http` 0.7.1, `axum-extra` 0.12.6 | **Use** | same-day axum releases; request-id, body limit, timeout, cookies |
| Rate limiting | `governor` 0.10.4 + `tower_governor` 0.8.0 | **Use** | GCRA, keyed; tower layer confirmed for axum 0.8 |
| Secret wrapper | `secrecy` 0.10.3 + `zeroize` 1.9 | **Use** | `SecretString`/`SecretBox` redact Debug; zero on drop |
| Metrics | `metrics` 0.24 + `metrics-exporter-prometheus` 0.18 + `axum-prometheus` 0.10 | **Use** | facade keeps project metric names verbatim (K7); the axum middleware saves hand-written HTTP metrics |
| Self-update | `self_update` 1.3 (zipsign, not minisign), `self-replace` 1.5 | **Build our own** (Almanac's pipeline) | no crate does download → signature → hash → probe → rename with minisign; `self-replace` solves Windows quirks we do not have |
| Minisign | `minisign-verify` 0.2.5 | **Use** | Almanac's choice; verify-only, minimal |
| Passkeys | `webauthn-rs` 0.5.5 (MPL-2.0) | **Use the ceremony, write the axum glue** | reference example targets axum 0.7; ceremony state kept in memory (registration must finish on the same process) |
| Sessions | `tower-sessions` 0.15, `axum-login` 0.18 | **Build our own** (kyu's ~100 lines) | our sessions live in the encrypted store next to clients; a store trait for tower-sessions would be that same code plus a layer |
| Templates | `minijinja` 2.24 (askama as alternative) | **Use minijinja** | kyu precedent; block inheritance for the layout hooks |
| Static assets | `rust-embed` 8.12 vs `include_str!` | **`include_str!`** | eight files; no build script; hash cache-busting is ten lines |
| CLI | `clap` 4.6 | **Use** | no serious alternative |
| Backoff | `backon` 1.6 (active), `backoff` 0.4 (unmaintained since 2024) | **Use backon** | Almanac's `backoff` crate is dead; kyu-runner's hand-rolled one is what we replace |
| Scaffolding | `cargo-generate` 0.24 | **Build our own** (`chassis new/sync`) | one-shot only; no Rust tool re-syncs generated files, and `sync` is half the point (G2) |
| Encrypted store | `chacha20poly1305` 0.11 (+ `hkdf` if a derived key is ever needed) | **Use the primitive, own the file format** | `age` is a whole file format for one blob |
| systemd notify | `sd-notify` 0.5 | **Use** | pure Rust, finished scope |
| Tests | `axum-test` 21, `tower::ServiceExt` | **reqwest against a real port 0 + tower oneshot** | K11 wants the real bind path exercised; `axum-test` optional later |

Corrections this record made to the draft architecture: T3 named
`figment` for configuration and a hand-rolled backoff; both changed to the
decisions above before R3 was queued.
