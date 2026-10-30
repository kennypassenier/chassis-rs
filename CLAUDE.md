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
| Current phase | **3.4.0 released 2026-10-02** (tag `v3.4.0` = `f815cc6`) on Kenny's release-340 answer: optional kit pages (`App::disable_kit_page`), the grid issue form, `tests/kenny_rules.rs`, `scripts/test-carry.sh`; suite 1 min 40 s, release 2 min 28 s (measured). **3.3.0** (`2ebce28`): `chassis release` builds no container image for a native service (`.chassis.toml` `image`, default from `deploy/service.yml` naming a `binary:`), and keeps 3 image versions on ghcr when it does build one. CLI only. **3.2.0** (`2481d72`): fix-15 `App::brand_title`. **3.1.0** (`cd9dee8`): feat-backup-1 + feat-pages-1. A kp-themes-only update may be released without a form (Kenny, 2026-09-29). History in docs/PENDING_MINI_ROUNDS.md |
| Last completed gate | **3.4.0 form 2026-10-02** (Kenny): release-340 "Nu uitbrengen als 3.4.0" |
| Next gate | **Unblock**, when the first consumer report lands. Awaited: kyu's first live supervised update once Kenny signs their v3.2.0 and the signed release reaches CT 109 (fix-3's measurement); Almanac's half of CF-12 landed 2026-09-26 and closed it. Batch 5 opens after that, because its heaviest candidate — narrowing the public surface for 3.0.0 — needs a count of what the four consumers import through `chassis::core::` and `chassis::shell::`, which only their own sessions can give (rule 6a). The four consumers adopt in their own sessions; fix-3 closes on kyu's report. The design question about a moved item is answered (Kenny, 2026-09-10): the contract keeps reading declaration paths, and the surface is narrowed at the next major instead — `pub mod core` and `pub mod shell` become `pub(crate)`, so a refactor moves nothing a consumer can name. Written down as the 3.0.0 candidate in docs/PENDING_MINI_ROUNDS.md; the refusal message now says when a break is only a move |
| Next action | **3.14.0 released 2026-10-30** (tag `v3.14.0` = `4e1d3a3`): kp-themes 11.3.0 vendored (213 files, sequencer); login/logout keep their native POST (11.3.0 stops a valid data-kp-form submit, `data-kp-form-native-submit`); Storage refreshes every 5 min by default; tokio 1.54.1 (RUSTSEC-2026-0386); suite 454 tests in 113 s, release 5 min 32 s (measured). Kenny dropped the kit-bar/language wish ("elke app regelt dat zelf"); Cloudflare DNS-edit token saved by Kenny 2026-10-30. **Waiting on the homelab thread** for the home route (OPNsense *.kp-soft.dev to 10.10.10.4, Traefik Let's Encrypt DNS-01 on 443, apps' TRUSTED_PROXIES with 10.10.10.4). The chassis part (trusted admins through a trusted proxy) is built on branch `trusted-via-proxy` (`6843353`) and ships as 3.14.1 only once that route works (Kenny's rule, fix-16). Before: **3.13.0 released 2026-10-22** (tag `v3.13.0` = `bea0848`): `<P>_TRUSTED_ADMINS` (exact addresses, TCP peer only, default empty; Kenny confirmed in form trusted-admins and asked it to work for 10.10.10.10, locked by a test) and the reload-flush fix in prefs-boot.js (unconfirmed writes plus 30 s after confirmation win over the snapshot); suite 452 tests in 143 s, release 5 min 41 s (measured). homelab 4.0.0 sets the knob from host.toml `trusted_sources`. Before: **3.12.0 released 2026-10-21** (tag `v3.12.0` = `88cd21b`): user preferences move from the browser into the app database per login (`App::sync_browser_keys`, `/api/kit/prefs`, `prefs-boot.js` before first paint, any key name, `PrefStore` port with sqlite + memory adapters, arch-22), a Preferences kind on /storage, homelab gaps 139/140/141; suite 446 tests in 80 s, release 3 min 46 s (measured). Kenny approved the helper's defaults (form chassis-rs-3-12-0-uitbrengen). Only homelab 4.0.0 moves on it first. Queued for kp-themes: kp-gaps/chassis-rs.md 11-20. Before: **3.11.0 released 2026-10-21** (tag `v3.11.0` = `b4a3482`): storage on sqlite (feature `storage`, two files `<name>.db` + `<name>-kit.db`, clients/sessions/passkeys imported once, backup pause checkpoints, budget 50/40 MB warn-only and editable on the page, only finished-by-definition rows auto-pruned, Storage kit page as approved in research/chassis-storage); design in docs/STORAGE_DESIGN.md. Kenny: only the admin dashboard moves on first; the other apps wait. Before: **3.10.0 released 2026-10-21** (tag `v3.10.0` = `83f4ca7`, kp-themes 11.2.0): vocabulary article ("an app"), html-only sections without an empty rows list, `data-chassis-owned` + cancelable `chassis-settle`, refresh-bar rules scoped to the kit header, token variable named after the vocabulary (`Vocabulary::token_var`), webpki-roots 1.0.10 + rustls-webpki 0.103.16 (RUSTSEC-2026-0381/0382); Kenny chose each in a form. Before: **3.9.0 released 2026-10-19** (tag `v3.9.0` = `d479c19`, kp-themes 11.1.1): every kit page rebuilt on kp-themes components as Kenny approved them over three demo rounds (research/chassis-kit-pages in kp-themes), consumer wishes (passkeys current + rename, section assets, toast region + `chassis:ready`, flash section actions, all modules under `dashboard`), `chassis release` reruns only previously failed tests. Kenny passes it to the consumers himself (2026-10-19). Open items: docs/KIT_ROUND_KP11.md. Before: **3.8.0 released 2026-10-19** (tag `v3.8.0` = `c14675b`, kp-themes 11.0.0 — terminal, phantom, light, grotesk gone, 12 themes; 132 JS modules under `webapp`); passed to the consumers via the coordinator. Round 2 open: kp-themes 11 components on the kit pages (shell, login, status, /clients) per almanac docs/KP_THEMES_11_ADOPTION.md "Wishes for the kit pages", each visual change a demo on the kp-themes review Agenda. Before: **3.7.1 released 2026-10-15** (tag `v3.7.1` = `4f8374f`, kp-themes 10.1.1 — high-contrast, sepia, retro gone, 16 themes — and rustls 0.23.46 for RUSTSEC-2026-0346..0349); passed to the dashboard via the coordinator (prepare only). Before: **3.6.3 released 2026-10-04** (tag `v3.6.3` = `3e02802`, kp-themes 9.2.1); **3.6.2** (`eb687a5`, kp-themes 9.2.0: actions, attention, chart, kpi; leave()). Consumers stay on 3.6.1 (rollout on Later, Kenny). **3.6.1** (tag `v3.6.1` = `7c56b2d`, kp-themes 9.1.0, motion.js); consumers on 3.6.1 published the same day (almanac 4.1.6, kyu 4.2.6, http-switchboard 3.3.6, kyu-runner 1.1.6), waiting on Kenny's signature; admin dashboard via the coordinator. Before that: **3.6.0** (tag `v3.6.0` = `4e1de9e`): `chassis release` runs suites side by side under cargo-nextest; test-carry gates the scaffold E2E on its inputs. Consumers released on 3.6.0 the same day (almanac 4.1.5, kyu 4.2.5, http-switchboard 3.3.5 with its fix-8, kyu-runner 1.1.5), waiting on Kenny's signature; admin dashboard + JobTracker via the coordinator. Open measurements: fix-7, fix-8, fix-10, fix-12 runtime half, fix-13, fix-15, the unit-stop fallback, the first nightly on a paused chassis service. Still blocked: batch 5, fix-3, helper units, h7 passkeys |
| AFK mode | **off** since 2026-09-07 (batch 3 reported). Rule 7a in force: the four consumer projects are touched only in their own sessions |

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
- **New infrastructure on Kenny's PC needs his approval first** (Kenny,
  2026-10-02): a second WSL distro, a VM, a Windows or systemd service, a
  scheduled task, kernel / binfmt / mount / network settings: one form saying
  what, why and the risks, nothing before his answer (workstation
  CORRECTIONS.md ws-1, ws-2).
- **Every test run reports its measured duration** (Kenny, 2026-10-02):
  `scripts/test-carry.sh` and `scripts/release-kit.sh` print it; a reply that
  mentions a test run says how long it took.
- **Web layouts use CSS grid wherever elements sit side by side** (Kenny,
  2026-10-02): elements align and always take the same space. The kit's
  shell and pages (status cards, the client issue form) are grid-based, so
  every consumer gets it.
- **Anything Kenny ever said must hold gets a locking test right away**
  (Kenny, 2026-10-02: "Als we altijd in cirkels blijven gaan en fouten
  terugkomen…"). A correction lands with a test that fails if it regresses.
- Session title convention: `🏗️ chassis-rs - Fase <N> - <phase name>`.

## When tests run (Kenny, 2026-10-04, test report)

A commit runs fmt and clippy only, and skips them when their input did not
move. The whole suite runs once, at the release (`chassis release`, or
`scripts/release-kit.sh` in chassis-rs), side by side under cargo-nextest
when it is installed; suites that share ports or fixtures are grouped in
`.config/nextest.toml`. When Kenny says a release goes without tests, it
does. A test that waits on the clock gets a short test value instead of the
production one; no test may cost development time it does not need.
