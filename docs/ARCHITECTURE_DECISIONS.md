# Architecture decisions — chassis-rs

Phases 3 (tech choice, **T**) and 4 (architecture, **AR**). Drafted
2026-09-05 during the AFK run; ratified in rounds **R3** and **R4**
(docs/PENDING_MINI_ROUNDS.md). Frozen after R4; changes go through
mini-rounds. Each AR decision ends with its enforcement mark (standing
rule 24): **code-enforced** (a test, gate or type makes it hold) or
**configuration-dependent** (it holds only while a deployment keeps a
setting, and says so).

The `⚔` blocks are the architecture-critic's surviving objections
(Phase 4). They stay in the document so the trade-off is visible when
someone revisits the decision.

---

## Phase 3 · Tech choice

### T1 · Language and toolchain
Rust, edition 2024, toolchain pinned to **1.97** in `rust-toolchain.toml`
with `rust-version = "1.97"` in every `Cargo.toml`; CI installs that exact
version. Same as kyu, Almanac, HTTPSwitchboard and kyu-runner, so a
migrating project never changes compiler and kit in one step. Raising it
is a deliberate commit that bumps both places.

### T2 · Workspace layout
```
chassis-rs/
  Cargo.toml              workspace
  crates/chassis/         the library (features: core, dashboard, passkeys, self-update, notify)
  crates/chassis-cli/     the `chassis` binary (new · sync · release), embeds the scaffold templates
  examples/inbox/         the example service (workspace member, K26)
  crates/chassis/examples/minimal.rs   the one-file service (K24, ≤40 lines)
  scaffold/               template files the CLI embeds (workflows, unit, Dockerfile, hooks…)
  docs/
```
`core` is a default feature; `dashboard`, `self-update` and `notify` are
opt-in; `passkeys` implies `dashboard` (see T8 for why it is separate).

### T3 · Libraries (pragmatic policy, Q5)
One line of reason each; versions are pinned in `Cargo.lock` and named
here at L0 once `cargo add` has resolved them.

| Concern | Crate | Why this one |
|---|---|---|
| Web | `axum` 0.8, `tokio` | H1; the four projects already use them |
| Middleware | `tower-http` (request-id, body limit, timeout), `axum-extra` (cookies) | maintained by the tower team; replaces three hand-rolled layers |
| Configuration | **own module** (`toml` for the file, `clap` for flags, `std::env`) | the Phase 1 survey found that neither `config-rs` nor `figment` expands `${VAR}` inside values or reports the source of each value, and `--print-config` (K2) needs both; ~150 lines, tested against a precedence table |
| CLI | `clap` 4.6 (derive) | consistent `--help`, unknown flags refused; pulled into K2 (see R2 note: W2's clap half moves into 1.0 because K2 needs a parser anyway; only the backoff helper stays Desired) |
| Secrets in memory | `secrecy` 0.10 (+ `zeroize`) | `SecretString` prints `[REDACTED]`, exposes via one method; matches K3 without our own type |
| Rate limiting | `governor` 0.10 + `tower_governor` 0.8 | proven algorithm (GCRA), keyed limiters per token and per IP; the tower layer is confirmed for axum 0.8 |
| Metrics | `metrics` 0.24 + `metrics-exporter-prometheus` 0.18 + `axum-prometheus` 0.10 | facade lets a project register its own names verbatim (K7); the axum middleware saves the hand-written HTTP metrics |
| Templates | `minijinja` 2 | kyu uses it; block inheritance for K16 |
| Assets | `include_str!` (no `rust-embed`) | eight files; no build script needed |
| Crypto | `chacha20poly1305` (XChaCha20), `sha2`, `subtle`, `getrandom`, `hex`, `base64` | RustCrypto, same as kyu and Almanac |
| Signatures | `minisign-verify` | what Almanac already verifies with; pure Rust |
| Passkeys | `webauthn-rs` 0.5.5 (kanidm, MPL-2.0 — allowed by `deny.toml`) | the maintained WebAuthn server library for Rust; its axum example targets 0.7, so the HTTP glue is ours; ceremony state stays in process memory (registration completes against the same instance) |
| Backoff | `backon` 1.6 | the `backoff` crate Almanac uses has had no commit since 2024; `backon` is active and async-native (AR19) |
| HTTP client | `reqwest` (rustls, no OpenSSL) | update downloads, webhooks, healthcheck self-probe |
| Logging | `tracing`, `tracing-subscriber` (env-filter, json) | the four already use it |
| Serialisation | `serde`, `serde_json`, `toml` | — |
| Errors | `thiserror` | typed errors with a mandatory `remedy` field |
| systemd | `sd-notify` | READY=1 after bind (AR19), 40 lines of dependency |
| Diffs (CLI `sync`) | `similar` | unified diffs for the scaffold sync |
| Tests | `reqwest` (dev), `tempfile`, `tokio` test-util (paused clock) | in-process app on port 0; no `axum-test` needed |

**Build our own, deliberately:** session handling (kyu's cookie session is
~100 lines and proven; `tower-sessions` adds a trait and a store we would
implement anyway), the encrypted file store (no crate does "small
encrypted JSON store"), the self-update pipeline (`self_update` has no
signature verification and no staged probe), the CSRF same-origin guard
(kyu's, 40 lines), the backoff helper (W2, later; `backon` is the
candidate if we change our mind).

### T4 · Dependency policy
Pragmatic (Q5): a well-known crate over hand-written code, gated by
`cargo-deny` in CI (kyu's `deny.toml`: permissive licenses only,
`wildcards = deny`, `unknown-git = deny`, advisories weekly). Adding a
dependency is a one-line reason in T3 in the same commit.

### T5 · License
MIT OR Apache-2.0 (Q7), `LICENSE-MIT` and `LICENSE-APACHE` in the repo.

### T6 · Platforms (Q3)
Linux x86_64 only. Runs as a native binary under systemd in Debian LXCs
on Proxmox (glibc), optionally as a container image. Development on
Kenny's Garuda PC, CI on GitHub Actions Ubuntu. No Windows, macOS or ARM.

### T7 · Environments and what differs between them (standing rule 35)

| Environment | Has | Lacks / differs |
|---|---|---|
| PC (Garuda) | cargo 1.97, gh token, minisign key, LAN reach, keyring | — |
| CI (Ubuntu runner) | cargo 1.97, `GITHUB_TOKEN` | no minisign key, no LAN, no systemd unit, ephemeral fs |
| CT 118 / production LXC (Debian 13, unprivileged) | systemd, journald, LAN, glibc 2.41 | no cargo, no gh; uid mapping (+100000 on the host); no curl by default |
| Container (debian:trixie-slim) | the binary, ca-certificates | no shell tools, rename swap not persistent → self-update forced off |

Phase 7 tests each mechanism from the environment it runs in: the update
swap and rollback on CT 118, the CI release job in CI, the scaffold's
`gh` calls against a scratch repository.

### T8 · Release build target
The release binary is built for **x86_64-unknown-linux-gnu on Debian
trixie** (`rust:1.97-slim-trixie` in Docker, as Almanac does), not static
musl. Reason: `webauthn-rs-core` 0.5.5 depends on `openssl` and
`openssl-sys` non-optionally (measured 2026-09-05 via the crates.io
dependency API); a musl build would need the vendored OpenSSL build on
every release, and every target environment (T7) runs glibc ≥ 2.41
anyway. The `passkeys` feature is separate so a
service that does not enable it stays OpenSSL-free and could build musl.
Container images use `debian:trixie-slim`, with `--healthcheck` because
the image has no curl.

---

## Phase 4 · Architecture

### AR1 · Core/shell split with zero ambient I/O in core
`chassis::core` holds pure decisions: config model and precedence,
version comparison, the update decision table, token and session
primitives, error types, template view-models. `chassis::shell` holds
everything that touches the world: axum handlers, files, network, clock,
process. Core never imports `std::fs`, `std::net`, `tokio::fs`, `reqwest`
or `std::time::SystemTime`; a CI grep fails the build if it does
(Almanac's AR13 pattern). **Code-enforced** (CI gate).

### AR2 · The assembly API is concrete
```rust
let spec = chassis::AppSpec {
    name: "inbox",
    version: env!("CARGO_PKG_VERSION"),
    ..Default::default()
};
let mut app = chassis::App::from_env_and_args(spec)?;   // config, logging, --version/--check/--print-config handled here
app.router(inbox::routes());                             // project routes, mounted under the kit's auth
app.status_section(inbox::StatusSection);                // trait object, one method
app.client_column(inbox::MessagesColumn);
app.test_route("/v1/messages", sample_body);
app.run().await                                          // bind, sd_notify, serve, shutdown
```
No generics on the public surface beyond `IntoResponse` where axum
forces it; extension points are traits with one or two methods taking
and returning plain structs. **Code-enforced** by the `examples/minimal.rs`
line budget (≤40 lines, checked by a test).

### AR3 · Configuration surface
Precedence **flag > env > file > default**, prefix = upper-cased app name.
The file is TOML at `<state_root>/config.toml` unless `--config <path>`;
`${VAR}` in any string value resolves from the environment (fail-closed
when unset). One root, every path derived from it (standing rule 28).

| Knob | Flag / env / key | Default | Notes |
|---|---|---|---|
| listen | `--listen` / `<P>_LISTEN` / `listen` | `0.0.0.0:8080` | K11 |
| state root | `--state-dir` / `<P>_STATE_DIR` / — | `/var/lib/<name>` | not in the file: the file lives under it |
| config file | `--config` / `<P>_CONFIG` / — | `<root>/config.toml` | optional |
| log filter / format | `<P>_LOG`, `<P>_LOG_FORMAT` | `info`, `text` | K4 |
| login token / secret key | `<P>_TOKEN`, `<P>_SECRET_KEY` | required with `dashboard` | env only, never file |
| shutdown timeout | `<P>_SHUTDOWN_TIMEOUT_MS` / `shutdown_timeout_ms` | 10000 | K5; refuses 0 |
| body / in-flight limits | `<P>_MAX_BODY_BYTES`, `<P>_MAX_IN_FLIGHT` | 1 MiB, 64 | K10 |
| rate limits | `<P>_RATE_LIMIT_LOGIN_PER_MIN`, `<P>_RATE_LIMIT_TOKEN_PER_SEC` | 10, 50 | K10 |
| reveal window | `<P>_REVEAL_SECONDS` | 10 | K12 |
| captures | `<P>_CAPTURE_KEEP`, `<P>_CAPTURE_BODY_BYTES`, `<P>_CAPTURE_TTL_SECS` | 20, 4096, 3600 | K13 |
| trusted proxies | `<P>_TRUSTED_PROXIES` | empty | AR6: `X-Forwarded-Proto` honoured only from these |
| update | `<P>_UPDATE_MODE` (off/supervised/autonomous), `<P>_UPDATE_URL`, `<P>_UPDATE_INTERVAL_SECS`, `<P>_UPDATE_HEALTHY_AFTER_SECS`, `<P>_UPDATE_MAX_START_ATTEMPTS`, `<P>_UPDATE_HOLD`, `<P>_UPDATE_DRILL`, `<P>_UPDATE_KEEP_COPIES` | off, GitHub latest, 21600, 60, 2, —, —, 3 | K18–K21 |
| notify | `[[notify.webhook]]` table entries in the file (event, url, method, headers, body); URLs/headers may use `${VAR}` | none | K22 |

Contract values that stay constants (rule 27 exception): store format
version byte, XChaCha20 nonce size, the minisign public key, cookie name
pattern `<name>_session`, metric name prefix rules. **Code-enforced:** a
test asserts every knob in this table is reachable by all three names
and appears in `--print-config`.

### AR4 · Error model
`chassis::Error { kind: Kind, message: String, remedy: String }` built
only through constructors that take the remedy (compile-time mandatory);
`kind` maps to an HTTP status. API responses render
`{"error": "<message>", "remedy": "<remedy>", "request_id": "<id>"}`.
Project errors implement `chassis::IntoApiError` (one method returning
the kit's error). Startup errors print message + remedy and exit 1;
`--check` exits 1 on the first configuration error. **Code-enforced**
(types).

### AR5 · Storage: small encrypted JSON files, atomic writes
Under the state root: `clients.json.enc`, `sessions.json.enc`,
`passkeys.json.enc`, `update-state.json` (plain), `pre-update/<version>/`.
Each `.enc` file is `{"v": 1, "nonce": ..., "ciphertext": ...}` with
XChaCha20-Poly1305 under `<P>_SECRET_KEY`; the plaintext is JSON with its
own `"v"`; a reader accepts version N and N−1 (K21). Writes are temp +
fsync + rename (rule 12). The `ClientStore` trait (`list`, `get_by_token`,
`insert`, `revoke`, `delete`, `touch`) is what kyu implements over SQLite;
the kit ships the file implementation and an in-memory one for tests, and
one suite drives all implementations (rule 7g). **Code-enforced.**

### AR6 · Security model
- Bootstrap token compared constant-time (`subtle`); client tokens stored
  encrypted (not hashed) so reveal/copy work, compared constant-time
  against the decrypted list; the list is decrypted once at load and held
  in memory, re-read on change.
- Session id = 32 random bytes hex; cookie `HttpOnly; SameSite=Lax;
  Path=/`, `Secure` when the request was HTTPS; remember-me = 30 days
  else session-scoped server side (24 h TTL).
- HTTPS detection: `X-Forwarded-Proto: https` **only** when the peer is
  in `<P>_TRUSTED_PROXIES`; otherwise plain HTTP. Passkey routes exist
  only for HTTPS requests (K9).
- CSRF: state-changing requests with an `Origin` header must match
  `Host`; no `Origin` (curl) passes (kyu's rule).
- Rate limits keyed by IP on `/login` and by token on the API (K10).
- Captures redact `authorization`, `cookie`, `set-cookie`, `x-api-key`
  and any header named in `<P>_CAPTURE_REDACT`.
- Secrets never in logs: `SecretString` everywhere; a plaintext-scan test
  runs the whole suite's log and body output against the known secrets.
**Code-enforced**, except "Traefik is in front" which is
**configuration-dependent** (N2 in SCOPE.md) and documented as such.

### AR7 · Concurrency and state in memory
One process, tokio multi-thread. Stores behind `tokio::sync::RwLock`.
Captures (K13) live in memory only: a bounded ring per client with TTL,
lost on restart. **Configuration-dependent consequence, accepted:** a
restart empties the debug view; the docs say so. Rate limiters and the
notifier queue are in memory too.

### AR8 · Update mechanism (K18–K21)
Modes `off | supervised | autonomous`, one enum in config → exactly one
armed, **code-enforced**. Container detection (`/.dockerenv`,
`/run/.containerenv`, cgroup markers) forces `off` with a log line.

Pipeline (both active modes): `GET <url>/VERSION` → compare semver →
`GET SHA256SUMS` + `SHA256SUMS.minisig` → **verify the signature with the
compiled-in public key before reading any hash** → `GET <name>` binary to
`<bin>.staging` (same filesystem as the binary) → SHA-256 equals the
manifest line → run `<bin>.staging --check` → state copy hook (K21) into
`<root>/pre-update/<version>/` → `rename(bin, bin.prev)`,
`rename(staging, bin)`.

- **supervised:** stops there, prints one line, exit 0 (also when already
  current: no download, nothing touched). Never restarts, never writes
  `update-state.json`. The homelab owns restart and rollback.
- **autonomous:** writes `update-state.json {from, to, attempts,
  previous: bin.prev}`, restarts itself (exit 0 under
  `Restart=always`). On start, `handle_pending_update`: if state says
  pending and attempts ≥ max → rename `bin.prev` back, mark rolled back,
  notify `update.rolled_back`; else attempts += 1. After bind +
  `HEALTHY_AFTER_SECS` with `/healthz` ok → clear state, notify
  `update.ok`. Timer ticks every `INTERVAL_SECS`, first tick after a
  short startup delay, one log line per tick at info (rule 23).
- **hold** skips versions ≤ hold or pins exactly; **drill** downloads a
  release whose binary is expected to fail `--check`... no: the drill
  must pass verification and `--check` yet fail at *start*, so the drill
  flag makes the kit install the verified binary and then the started
  binary exits 1 when it sees `<P>_UPDATE_DRILL=broken` and a marker file
  from the swap — proving the rollback path end to end without a bad
  release existing on GitHub.
- **Authenticity:** the public key `RWQWCzzUBquIHGkS3YERMkuqEm4C3vBArnlb9rySbr8z5ytgVYuji3bS`
  (Almanac's `RELEASE_PUBKEY`, also one of latch's) is a constant; one
  real signature by Kenny is pinned as a regression vector (rule 9).
**Code-enforced**, except "the LXC's `ReadWritePaths` covers the binary's
directory" which is **configuration-dependent** and written into the
golden unit.

### AR9 · Transaction units (standing rule 33)
| State change | Unit | If it dies halfway |
|---|---|---|
| issue / re-issue / revoke / delete client | one encrypted file write (temp+fsync+rename) | old file intact |
| login (session create) | one sessions file write | no session; user retries |
| binary swap | two renames; `bin.prev` exists before `bin` is replaced | worst case: `bin` missing between the renames for microseconds; systemd restarts; if `bin` absent, the rollback marker restores `bin.prev` |
| update state | temp+rename of `update-state.json` written **before** the swap | a swap without state cannot happen; state without swap is cleared on next start when hashes match |
| captures | memory | lost |
| notifier delivery | at-most-once per webhook attempt with bounded retries; never blocks the caller | a notification may be lost; the event is also logged |

### AR10 · Notifier
A bounded `mpsc` queue drained by one task; each event fans out to its
configured webhooks; per webhook: render body template (minijinja) with
the event's fields, send with timeout, retry `retries` times with the
backoff helper, then the next in the fallback chain. Secrets only via
`${VAR}`. Presets are just pre-filled webhook entries (`kyu-topic` →
`POST <hub>/t/<topic>`, `ha-webhook` → `POST <ha>/api/webhook/<id>`).
**Code-enforced** (queue bound, timeout), delivery guarantee documented as
best effort.

### AR11 · Dashboard rendering and extension points
minijinja templates embedded with `include_str!`; `layout.html` defines
blocks `nav`, `content`, `explain`; kit pages extend it. A project
registers, through `App` methods (AR2): nav entries, extra pages (an axum
Router mounted under the kit's auth middleware), status sections
(`fn render(&self) -> Section` with title, explain text, rows), client
columns (`fn cell(&self, client) -> Cell`) and client actions. The
explain block is mandatory: a template lint test fails on a page without
one (K16). Static assets served at `/static/<file>?v=<fnv-hash>` with
`Cache-Control: public, max-age=31536000, immutable`. **Code-enforced.**

### AR12 · Metrics and health
`metrics` facade with the Prometheus exporter mounted at `/metrics` (open,
numbers only). Kit metrics use the app's prefix; a project may register
names under its own prefix (kyu keeps `kyu_*`). `/healthz` (open) returns
`{"status", "version", "subsystems": {name: {status, detail}}}`; a project
registers subsystem checks (`fn check(&self) -> SubsystemStatus`);
`status = degraded` and HTTP 503 only when a check reports it. Each kit
metric's docs carry a blind-spot sentence. **Code-enforced.**

### AR13 · Request-id and access log
`tower-http` `SetRequestIdLayer` (accept `x-request-id` from a trusted
proxy, else UUIDv4) + `PropagateRequestIdLayer`; one tracing span per
request carrying it; one access line at `info` per request (method, path,
status, duration, request_id, client name when authenticated by token).
**Code-enforced.**

### AR14 · Scaffold command (K23)
`chassis-cli` embeds the `scaffold/` tree as minijinja templates
(variables: name, prefix, repo owner, kp-themes version, toolchain).
`new` renders into a directory, `git init`, first commit, then shells out
to `gh repo create --public --source . --push`; branch protection is
applied by `chassis sync --protect` **after** the first CI run exists
(rule 6a: workflow on all branches). `sync` renders into a temp dir and
prints a unified diff per file (`similar`), `--write` applies. `release
<version>` edits `Cargo.toml` versions, commits `[meta]`, tags the merge
commit on main, pushes, polls the **tag's** check runs (rule 6b), downloads
`<name>` + `SHA256SUMS`, verifies, runs `minisign -S` locally, uploads
`.minisig` + `VERSION`, prints the four asset URLs. Requires `gh` and
`minisign` on the PC; missing tools are reported with a remedy.
**Code-enforced** by an E2E run against a scratch repository (drilled in
Phase 6, not in CI: CI has no minisign key).

### AR15 · Lifecycle: startup, readiness, shutdown
Order: parse args → control commands exit early (`--version` prints and
exits before config; `--check` loads config + secrets presence, opens
stores read-only, exits; `--print-config`) → config → logging → stores →
`handle_pending_update` → bind → `sd_notify(READY=1)` when
`NOTIFY_SOCKET` is set → serve. Shutdown per K5 with the project's flush
hook called after the HTTP server drained. The golden unit uses
`Type=notify` so `systemctl is-active` means "bound and serving", which is
what the homelab's update supervision measures. **Code-enforced** (E2E
tests for each control command's side effects: none may open a socket or
touch the state dir).

### AR16 · Release layout and CI/CD
Tag `v*` → CI job builds the glibc binary in `rust:1.97-slim-trixie`,
computes `SHA256SUMS`, builds and pushes `ghcr.io/kennypassenier/<name>:<version>` and `:latest` with `GITHUB_TOKEN` (permissions `contents: write, packages: write`), creates the GitHub release with binary + `SHA256SUMS`. `chassis release` adds `.minisig` + `VERSION` from Kenny's machine (AR14). The updater fetches `releases/latest/download/VERSION`; the four asset names are a contract (rule 27 exception). **Code-enforced** in CI; the signing half is a documented manual step by design (J2).

### AR17 · Golden systemd unit (scaffold)
From the homelab's answer, verbatim in `scaffold/systemd/<name>.service`:
`[Unit] Wants=network-online.target After=network-online.target
StartLimitIntervalSec=0 StartLimitBurst=0`; `[Service] Type=notify
User=<name> Group=<name> EnvironmentFile=/etc/<name>/<name>.env
WorkingDirectory=<state root> ExecStartPre=<bin> --check ExecStart=<bin>
Restart=always RestartSec=5s KillSignal=SIGTERM TimeoutStopSec=60
NoNewPrivileges=yes PrivateTmp=yes ProtectSystem=strict ProtectHome=yes
ProtectKernelTunables=yes ProtectControlGroups=yes RestrictSUIDSGID=yes
ReadWritePaths=<state root> <binary dir>`. An optional variant runs
`ExecStart=latch run --env prod -- <bin>` (M2). `systemd-analyze verify`
runs in the scaffold's tests. **Code-enforced** (verify) for syntax;
the paths are **configuration-dependent** and listed in `service.yml`.

### AR18 · Homelab `service.yml` (scaffold)
Rendered with `stack_name`, `vmid`, `hostname = <vmid>-app-<name>`,
`unit`, `binary`, `env_file`, `data_dirs = [<state root>]`, `update_cmd =
"<binary> update"` (reproducing the unit's user, working directory and
EnvironmentFile via `systemd-run --uid … --property=EnvironmentFile=…`, as
the homelab asked), `release_repo`, `release_asset`. **Configuration-dependent** by nature; the scaffold test renders it and checks every referenced path is also in the unit.

### AR19 · Backoff (W2, Desired)
`backon` 1.6 (exponential with jitter, async-native) is used internally by
the updater and the notifier from 1.0; re-exporting a configured builder
for projects is the W2 1.x item. Bounds (base, cap, attempts) come from
the knobs in AR3, never literals.

### AR20 · Version and what `--version` answers
`--version` prints `<name> <version>` from the file on disk and exits
without touching config, secrets or state (the homelab's finding on
Almanac). `/healthz` answers what is **running**. During a supervised
update they legitimately differ until the restart; the docs say which to
ask for what. **Code-enforced** (E2E: `--version` with no env and no
state dir succeeds).

---

## Freeze

Frozen at R4 (pending). Amendments are dated notes under the decision
they change, added by the mini-round that changed them.
