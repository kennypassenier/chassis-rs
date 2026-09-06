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
| Current phase | **6 · Development loop — kit batch 3 (L9) built**, AFK. K25 harness, K27–K32 landed on `main` from five worktrees (G1, G5, G4, G3, G2); CHANGELOG `[Unreleased]` and MIGRATION 1.8.0 composed; the report form (with CF-9 for the GIT_DIR hook fault and the gates.sh ratification) is the next gate. Kit at **1.7.1**, 1.8.0 waits for Kenny's word (R1). The kp-themes hold still stands as a separate Unblock step
| Last completed gate | Deep-dive form 2026-09-07: F3 Later (K33), P1 Parallel in worktrees, A1 AFK Aan, R1 "zie ik zelf nog wel"; weighing form 2026-09-06: F1, F2, F4–F8 Onmisbaar |
| Next gate | Report form for batch 3: R-rows per group with evidence, registry coverage K25/K27–K32, CF-9 (nine fields), gates.sh ratification, the decisions listed in PENDING §Kit batch 3 → then Kenny decides the 1.8.0 moment. Deferred: R1 (three turns), D6, H1; Unblock kp-themes |
| AFK mode | **on since 2026-09-07 for batch 3 (A1)**: milestone gates accumulate into one report; a deviation from a ratified design is quarantined and queued as a mini-round, never built silently. Rule 7a stays in force: the four consumer projects are touched only in their own sessions |
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
