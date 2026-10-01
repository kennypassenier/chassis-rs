# chassis-rs

Shared foundation for Kenny's Rust web services: a library crate with
feature flags (core, dashboard, self-update, notify) plus a `chassis`
scaffold command for everything a crate cannot carry.

This project follows the dev procedure in `~/Projects/dev-procedure/`
(`/project-flow`). Standing rules apply to every change:
`~/Projects/dev-procedure/STANDING_RULES.md`.
Enforcement is **git-native** (`.githooks/` via `core.hooksPath`), so
gates hold from any session or terminal. After a fresh clone, run:
`git config core.hooksPath .githooks`.

## Procedure status

| Field | Value |
|---|---|
| Current phase | **3.0.2 released 2026-09-30** (tag `v3.0.2` = `1687dde`) under the kp-themes standing go: kp-themes 8.1.0 vendored (`.kp-page` max(80vw, 64rem); chassis.css caps only `.explain`). **3.0.1** (`3fa5200`) on Kenny's release-301 answer: fix-14 (`.chassis.toml` `unit_service`; `sync --write` never drops a project's own unit directive). **3.0.0** (2026-09-29, `18be026`, released by the local-builds thread): releases and gates run locally only, no GitHub Actions. **2.4.1** (`6336481`): kp-themes 8.0.0, fix-13. **2.4.0**, **2.3.0**: `request-guard`, `webapp`, `live`; docs/WEBAPP.md. A kp-themes-only update may be released without a form (Kenny, 2026-09-29). History in docs/PENDING_MINI_ROUNDS.md |
| Last completed gate | **3.0.1 form 2026-09-30** (Kenny): release 3.0.1, fix-14 ratified. Before that, release-241 |
| Next gate | **Unblock**, when the first consumer report lands. Awaited: kyu's first live supervised update once Kenny signs their v3.2.0 and the signed release reaches CT 109 (fix-3's measurement); Almanac's half of CF-12 landed 2026-09-26 and closed it. Batch 5 opens after that, because its heaviest candidate — narrowing the public surface for 3.0.0 — needs a count of what the four consumers import through `chassis::core::` and `chassis::shell::`, which only their own sessions can give (rule 6a). The four consumers adopt in their own sessions; fix-3 closes on kyu's report. The design question about a moved item is answered (Kenny, 2026-09-10): the contract keeps reading declaration paths, and the surface is narrowed at the next major instead — `pub mod core` and `pub mod shell` become `pub(crate)`, so a refactor moves nothing a consumer can name. Written down as the 3.0.0 candidate in docs/PENDING_MINI_ROUNDS.md; the refusal message now says when a break is only a move |
| Next action | **feat-backup-1 built 2026-10-01** (`ca12b85`, backup-pause/backup-resume over /run/<name>/backup.sock; widened the same day on Kenny's answer to modes writes/full plus a unit-stop fallback with a dead-man timer; docs/OPERATIONS.md §7): tests written, not run; waiting on Kenny's release go for 3.1.0, which runs them. Then the consumers bump + `chassis sync --write`, and the homelab switches from a unit stop. Open measurements: fix-7, fix-8, fix-10, fix-12 runtime half, fix-13; fix-14 closed on http-switchboard `073154c`. The CLI follows releases through workstation `bin/ws-tools`. Still blocked: batch 5, fix-3, helper units, h7 passkeys |
| AFK mode | **off** since 2026-09-07 (batch 3 reported). Rule 7a in force: the four consumer projects are touched only in their own sessions |
| Scratch resource | CT 118 `118-app-inbox` on 10.10.5.250, ip 10.10.10.18 — adopted by the homelab 2026-09-05 (stack `inbox`, backup only); runs **inbox 0.1.10** (measured 2026-09-26 with `inbox --version`; installed 2026-09-10 03:55 UTC through the promised `update_cmd`) at /opt/inbox/bin under the hardened unit, supervised. `INBOX_UPDATE_URL` points at a localhost drill server in the container (transient `drill-serve.service`, /tmp/drill-0.1.10) and `INBOX_UPDATE_PUBKEY` trusts the drill key; the pre-drill env is at /etc/inbox/inbox.env.pre-drill-0.1.7 and points at `http://10.10.10.10:9000`. Kept on purpose (Kenny, 2026-09-26). **A restart of CT 118 removes the drill server** (transient unit, files in /tmp), after which every update check of inbox fails until it is recreated |

<!-- Update this block after every completed gate. -->

## Project documents

| Doc | Purpose |
|---|---|
| docs/SCOPE.md | goals, non-goals, success criteria, constraints (Phase 0) |
| docs/FEATURES.md | rated feature list with permanent IDs (Phase 2) |
| docs/ARCHITECTURE_DECISIONS.md | frozen AR decisions incl. tech choice (Phases 3-4) |
| docs/REALIZATION_PLAN.md | milestones + status table (Phase 5) |
| docs/TEST_PLAN.md | what is proven where + accepted limitations (Phase 7) |
| docs/PENDING_MINI_ROUNDS.md | ratification rounds, mini-rounds, open measurements |

## Gates (enforced)

Commits are blocked by `.claude/hooks/check-commit.sh` unless
`.claude/hooks/gates.sh` passes and the message carries IDs in
brackets (`[W12]`, `[L4b]`, `[meta]`). There is no GitHub Actions CI
(3.0.0, Kenny 2026-09-29: tests and builds run locally); `scripts/release-kit.sh`
runs the full gate — fmt, clippy, the whole suite, cargo-deny, the API
contract, the `--version` smoke — before it tags.

## Context worth knowing before touching anything

- The scoping session (2026-09-05) inventoried kyu, Almanac,
  HTTPSwitchboard and kyu-runner; the decisions from it are listed at
  the end of `docs/SCOPE.md`. Almanac's `src/core/update.rs` and
  `src/shell/update.rs` are the starting code for self-update; kyu's
  `src/http/{auth,csrf,error}.rs` and `src/shutdown.rs` for the core.
- The Homelab Rust session answered eight questions about what the
  homelab expects (update_cmd contract, /healthz version field, state
  root, unit hardening); the answers are folded into SCOPE.md.
- **Standing go (Kenny, 2026-09-29):** a request that is ONLY a kp-themes
  update may be vendored and released without a release form. Anything
  else in the same release still needs his go; a bump that forces a change
  a consumer can feel stops and asks.
- Session title convention: `🏗️ chassis-rs - Fase <N> - <phase name>`.
