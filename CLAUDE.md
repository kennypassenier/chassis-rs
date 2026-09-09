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
| Current phase | **6 · Development loop — kp-themes 5.0.0 adopted** (2026-09-09). Release bundle `dist/kp-themes.css` + fonts + seven JS modules (effects.js since R2-b) under `/static/kp/`; dialog confirmations; CF-11 fixed. Kit at **1.7.1**; `[Unreleased]` holds batch 3 + kp-themes 5.0.0 — 1.8.0 waits for Kenny's word (R1); Kenny looked at CT 118 (L1 Akkoord). Next build: K34 (batch 4)
| Last completed gate | Mini-round D2 2026-09-09 (register bundle) after deep-dive R2-b (effects.js) and the adoption report (R1/R3/L1 Akkoord, CF-11 Klopt, D1 alle fonts) |
| Next gate | Kenny's word for 1.8.0 (`scripts/release-kit.sh 1.8.0`, Phase 9 report; his look at CT 118 is in); then K34 (batch 4) and the batch-3 retro with the four candidates in PENDING |
| AFK mode | **off** since 2026-09-07 (batch 3 reported). Rule 7a in force: the four consumer projects are touched only in their own sessions |
| Scratch resource | CT 118 `118-app-inbox` on 10.10.5.250, ip 10.10.10.18 — adopted by the homelab 2026-09-05 (stack `inbox`, backup only); runs inbox 0.1.3 (drill build) at /opt/inbox/bin under the hardened unit, supervised |

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
brackets (`[W12]`, `[L4b]`, `[meta]`). CI re-runs the same gates on
every push; red blocks merge.

## Context worth knowing before touching anything

- The scoping session (2026-09-05) inventoried kyu, Almanac,
  HTTPSwitchboard and kyu-runner; the decisions from it are listed at
  the end of `docs/SCOPE.md`. Almanac's `src/core/update.rs` and
  `src/shell/update.rs` are the starting code for self-update; kyu's
  `src/http/{auth,csrf,error}.rs` and `src/shutdown.rs` for the core.
- The Homelab Rust session answered eight questions about what the
  homelab expects (update_cmd contract, /healthz version field, state
  root, unit hardening); the answers are folded into SCOPE.md.
- Session title convention: `🏗️ chassis-rs - Fase <N> - <phase name>`.
