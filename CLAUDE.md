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
| Current phase | 10 · Retrospective — done 2026-09-06. Phases 0–10 complete; the kit is at **1.5.0**. Follow-up batch of 2026-09-06 done on the build side: three releases signed by Kenny, Almanac 3.0.0 live on CT 112, kyu step 2 on kyu `main` (3.0.0 unreleased), Almanac step 2 on almanac `main` (4.0.0, release to the signature), remote scaffold proven, C2 drilled with the real key; handovers in docs/PENDING_MINI_ROUNDS.md §Open items after Phase 10 |
| Last completed gate | CF-7 form, 2026-09-06 18:40: all nine Klopt; A2-2 revisit → captures on the Sources row (K13), /captures goes; D3 → CT 112 waits on 4.0.1 |
| Next gate | Report form after kit 1.5.1 (CF-6 a/b + CF-7 fix, branch `kit-1.5.1`) and almanac 4.0.1 (kit bump, captures per K13, token rename in latch by Claude, install on CT 112 = the CF-7 measurement: Kenny logs in from Chrome and deletes calendar `almanac-test`). Then kyu 3.0.0, kyu-runner, http-switchboard step 2, in that order |
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
