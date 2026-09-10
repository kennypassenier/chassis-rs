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
| Current phase | **9 · Release — 2.0.0 released 2026-09-10** (tag `v2.0.0` = `1190876`). Batch 4, round 5, kp-themes 5.1.0 and round 6. A major, not by plan: the release chain refused it as 1.9.0 because a public field on `Client` broke two consumers (CF-15). `Client` is sealed now and made through `Client::adopted`. Rule 46 was rewritten the same evening — the frozen contract refuses a release, the consumer build informs it. The four adopt in their own sessions with `docs/ADOPT_2.0.0.md` (rule 7a) |
| Last completed gate | **Release 2.0.0** (Kenny, 2026-09-10): his go after the look-drill on CT 118, then four decisions in one evening as the chain kept finding things — seal `Client` rather than patch the instance, make the recorded surface a contract frozen per major, let the consumers inform instead of veto, and keep the hash as the contract's name rather than its judge |
| Next gate | The four consumers adopt in their own sessions; CF-12 and fix-3 close on their reports. The design question about a moved item is answered (Kenny, 2026-09-10): the contract keeps reading declaration paths, and the surface is narrowed at the next major instead — `pub mod core` and `pub mod shell` become `pub(crate)`, so a refactor moves nothing a consumer can name. Written down as the 3.0.0 candidate in docs/PENDING_MINI_ROUNDS.md; the refusal message now says when a break is only a move |
| AFK mode | **off** since 2026-09-07 (batch 3 reported). Rule 7a in force: the four consumer projects are touched only in their own sessions |
| Scratch resource | CT 118 `118-app-inbox` on 10.10.5.250, ip 10.10.10.18 — adopted by the homelab 2026-09-05 (stack `inbox`, backup only); runs **inbox 0.1.7** (drill build of the 1.9.0 kit, installed 2026-09-10 through the promised `update_cmd`) at /opt/inbox/bin under the hardened unit, supervised. While Kenny looks, `INBOX_UPDATE_URL` points at a localhost drill server in the container (`drill-serve.service`, /tmp/drill-0.1.7) and `INBOX_UPDATE_PUBKEY` trusts the drill key; the original env is at /etc/inbox/inbox.env.pre-drill-0.1.7 |

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
