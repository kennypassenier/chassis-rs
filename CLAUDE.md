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
| Current phase | 10 · Retrospective — done 2026-09-06 (dev-procedure `0cad95c`, all nine lessons adopted). Phases 0–10 complete; the kit is at 1.3.0. Open: see docs/PENDING_MINI_ROUNDS.md §Open items after Phase 10 (S6, AR24, Almanac step 2 and the branch merges were put to Kenny in the closing form; CF-5 and C2 wait for the next signed release). Kenny renames the session when the project rests. |
| Last completed gate | Phase 10 retrospective (2026-09-06): L1–L8 + E1 all Opnemen |
| Next gate | None scheduled. Closing form of 2026-09-06 (S6, Almanac step 2, AR24 knob, branch merges) decides the follow-ups; a kit 1.4.0 would re-enter Phase 6–9 as a mini-cycle. |
| AFK mode | **off** since Kenny returned 2026-09-05 evening. Standing rule 7a (a session touches only its own project) is back in force: D-K1 (kyu dashboard adoption), D-H1 (http-switchboard log stream) and Almanac's half of D-A1 belong in sessions opened in those repositories. |
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
