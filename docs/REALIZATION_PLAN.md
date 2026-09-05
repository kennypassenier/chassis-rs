# Realization plan — chassis-rs

Phase 5 output, drafted 2026-09-05 during the AFK run; ratified in round
**R5** (docs/PENDING_MINI_ROUNDS.md). Feature IDs: docs/FEATURES.md.
Decisions: docs/ARCHITECTURE_DECISIONS.md.

## Ground rules for this plan

- **Enforcement before feature code.** L0 ends with the git-native hooks
  live (`.githooks/` via `core.hooksPath`, `.claude/hooks/gates.sh` +
  `check-commit.sh`), CI green on `main`, and branch protection
  requiring the CI check (workflow runs on all branches, rule 6a).
  Hook configuration per Kenny's Q9 (2026-09-05): fmt, clippy with
  warnings as errors, full test suite, clean-tree check, IDs in the
  message, `--no-verify` forbidden; cargo-deny in CI only.
- **Scratch resource (rule 14):** CT 118 `118-app-chassis` on the Proxmox
  host 10.10.5.250, ip 10.10.10.18, Debian 13, unprivileged, disposable.
  Every milestone that touches systemd, files or the network runs at
  least one live drill there (L5 rule) and the drill's outcome is report
  evidence.
- **Credential-touching steps (rule 21):** none inside the AFK run. The
  minisign signing key stays with Kenny (release = deliberately not done);
  `gh` calls that create repositories are drilled with `--dry-run` only,
  the live `chassis new` remote drill waits for Kenny.
- **Assembly is its own milestone (L7):** the exit criterion is that the
  example service does its own job end to end, not that the parts exist.

## Milestones

| Milestone | Features | Exit criteria | Why this order |
|---|---|---|---|
| **L0 · Walking skeleton** | — | Workspace with `crates/chassis` (lib), `crates/chassis-cli` (bin), `examples/inbox` (bin); `rust-toolchain.toml`, `deny.toml`, `.gitignore`; CI (fmt · clippy · tests · deny · coverage-informational) green on `main`; hooks live and **proven by firing once** (rule 7d: a commit with a clippy warning is refused, a commit without an ID is refused); branch protection read back (rule 13a). | Nothing is built on an unenforced tree. |
| **L1 · Core lifecycle** | K2, K3, K4, K5, K11, W1, W9 (AR2, AR3, AR4, AR13, AR15, AR20) | `App::from_env_and_args` with the precedence table test (flag > env > file > default), `${VAR}` expansion, one state root; `--version`, `--check`, `--print-config` proven to open no socket and touch no state; access log with request-id; SIGTERM E2E against the real binary (exit 0, in-flight completes, second signal no-op); `sd_notify` READY after bind. **Drill:** the glibc binary copied to CT 118 runs `--version` and `--check` under the target OS. | Everything else mounts on this. |
| **L2 · Health, metrics, guards** | K6, K7, K10 (AR12) | `/healthz` with `version` and subsystem registry (503 on degraded); `/metrics` baseline + project registry with a name-preservation test; `--healthcheck` exits 0/1; body limit 413, in-flight 503 + Retry-After, rate limit 429, CSRF 403; shipped defaults pass their own validation. **Drill:** Prometheus text parsed by `promtool check metrics` on the PC. | Observability before state, so later drills can be measured. |
| **L3 · Stores, login, clients** | K8, K12, K13, K14 (AR5, AR6, AR7, AR9) | Encrypted file store v1 with N/N−1 read test; atomic writes; `ClientStore` trait with file + in-memory implementations under one suite (rule 7g); login/session/remember-me/logout E2E; two-secrets startup rules with generated candidates; client lifecycle over HTTP; captures ring with redaction, truncation, TTL, `last_used_at`; test-request endpoint. Plaintext-scan test over the whole suite's output. **Drill:** store files written on CT 118 survive a `systemctl restart` (sessions still valid). | Auth and state before any HTML. |
| **L4 · Dashboard** | K15, K16, K17, K9 (AR11) | kp-themes v3.1.0 vendored with checksum gate; layout blocks + registry (nav, pages, status sections, client columns/actions) exercised by a test project; explain-block lint; status page fields shown to take two values; clients page with the three buttons, arm-before-act and busy states; passkeys register/assert with a software authenticator over a simulated HTTPS request and 404 over plain HTTP. **Publish the visible surface** (PROCEDURE Phase 6): the dashboard runs on CT 118 behind its login so Kenny can open it on his return. | Chrome last among the in-process parts, on top of real data. |
| **L5 · Self-update and notifier** | K18, K19, K20, K21, K22 (AR8, AR9, AR10, AR19) | Update decision table unit tests (Almanac's nine cases ported); fake release server in `chassis::testing`; supervised: swap + exit 0, second run exit 0 untouched; autonomous: rollback after failed starts with a paused clock; hold; drill flag; state copy before swap; signature verified before any hash, pinned real vector; notifier fan-out, fallback chain, `${VAR}` secrets never logged. **Drill on CT 118:** supervised update from a release server on the PC (`<P>_UPDATE_URL`), then the autonomous rollback with a deliberately failing start. | The riskiest mechanism gets the most drill time, after the platform it updates exists. |
| **L6 · Scaffold CLI** | K23 (AR14, AR16, AR17, AR18) | `chassis new` renders a project that builds and passes its own gates; `sync` zero-diff after `new`, one diff after a template change; `release --dry-run` walks every step against a local fake `gh`; golden unit passes `systemd-analyze verify`; `service.yml` paths cross-checked against the unit; Dockerfile builds. **Drill on CT 118:** the scaffolded unit installed for inbox, `systemctl start` blocks until healthy (W9), `ExecStartPre --check` refuses a broken env. | Templates need the real binary's flags to exist first. |
| **L7 · Assembly and example** | K24, K25, K26 | `examples/inbox` uses every kit module: token login, client issued, `POST /v1/messages` with the token, message on the page, capture on the row, status section count, `message.received` notification received by a local webhook; `examples/minimal.rs` ≤ 40 lines with a line-count test; rustdoc lint (every public module opens with a sentence); `cargo semver-checks` informational in CI; CHANGELOG with a Migration heading rule. **Exit criterion in one sentence:** a person can go from `chassis new inbox` to a message visible on the dashboard following only the README. | The milestone HTTPSwitchboard forgot. |
| **L8 · Live drills for the release report** | C1–C4, M3 | On CT 118 with the real binary: supervised broken-release drill (verifies, fails at start, homelab-style restart + `is-active` polling, rollback restores `bin.prev`); autonomous broken-release drill; restore drill (destroy state, restore the tar, log in with an existing client token); C3 proof (kp-themes bump → kit release candidate → example rebuilt with a tag change); C4 read-through prepared for Kenny. Everything that needs Kenny (signing, `homelab adopt`, remote `chassis new`, passkeys behind Traefik) listed in the queue. | Proof before the release gate. |

## What waits for Kenny (deliberately not done in AFK)

See docs/PENDING_MINI_ROUNDS.md §Deliberately not done: signing and
publishing, `homelab adopt` of CT 118, the passkey test behind Traefik,
the live `chassis new` remote drill (creates a repository), and anything
that would change a frozen decision.

## Status

| Milestone | Status | Evidence |
|---|---|---|
| L0 | in progress | — |
| L1 | pending | — |
| L2 | pending | — |
| L3 | pending | — |
| L4 | pending | — |
| L5 | pending | — |
| L6 | pending | — |
| L7 | pending | — |
| L8 | pending | — |

## Gate log (from Phase 7 onward; earlier gates live in their documents)

| Gate | Date | Decision | Where it landed |
|---|---|---|---|
| — | — | — | — |
