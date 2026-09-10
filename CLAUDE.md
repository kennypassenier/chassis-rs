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
| Current phase | **10 · Retrospective of batch 3 — held and committed 2026-09-10** (`dev-procedure 149b13d`: eight lessons, rule 37 made mechanical, a measured-figures rule, the ecosystem entry five releases stale brought current). Before it: round 5 built and landed (`b9ccbbb` and after) — client fields in the kit, `App::project_config`, `Counter`/`Gauge`, one assembly for tests, the public-surface snapshot with its check, `chassis upgrade`, static musl on distroless, the build-target amendment. Since then kp-themes 5.1.0 vendored (`c9393a0`). Fifteen entries sit under Unreleased; **the release of 1.9.0 is the open moment and it is Kenny's** |
| Last completed gate | **Phase 10, the retrospective of batch 3** (Kenny, 2026-09-10): the delivery reading Akkoord, eight lessons adopted, the splitting lesson replaced by his own answer (*"geef gewoon het hele formulier vanaf nu"*), the four silent rules deferred, the ecosystem entry updated, and CF-13 (three unmeasured claims) Klopt. Committed on his "nu committen" with the kp-themes session blocked on it |
| Next gate | **The release of 1.9.0** — batch 4, round 5 and kp-themes 5.1.0 all sit under `[Unreleased]` (15 entries) while the crate still says 1.8.0. Kenny's moment, and rule 39 applies: his own look at something live comes first. Open behind it: `scripts/drill-release.sh` builds against glibc unconditionally where it should follow the target's features — for the example that is correct, because `passkeys` pulls OpenSSL (deferred to the batch-5 report). `examples/inbox` now uses both a declared client field and its own `Counter`/`Gauge` (`e1769db`). Measurements still open in docs/PENDING_MINI_ROUNDS.md: CF-12, fix-3, CF-6(a), CF-10 |
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
