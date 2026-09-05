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
| Current phase | 7 · Hardening — building the 23 Dichten items (H1–H6, H8–H17, S1–S5, S7, S8) + drills with the drill key; then TEST_PLAN, Phase 8 docs, Phase 9 tag v1.0.0, then migration branches in kyu-runner, http-switchboard, kyu, almanac |
| Last completed gate | Combined ratification R1–R5 + L0–L8 (2026-09-05, all Akkoord); DD-1 D1–D3 Klopt; CF-2 answered (measurement pending) |
| Next gate | Phase 7 close-out report (R7), Phase 8 docs (R8), Phase 9 release (R9) — all as ratification rounds on Kenny's return |
| AFK mode | **on** again since 2026-09-05 afternoon (AFK round 2: A1 drill key, A2 kit + four migration branches, A3 adopt CT 118 only if it does not stall, A4 passkeys later, A5 tag v1.0.0 after green Phase 7+8 and drills, A6 gates → R7–R9). Rule 7a (one session, one project) suspended by Kenny until his return. |
| Scratch resource | CT 118 `118-app-chassis` on 10.10.5.250, ip 10.10.10.18 (disposable) |

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
