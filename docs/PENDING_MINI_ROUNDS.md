# Pending rounds — chassis-rs

The queue for everything that waits on Kenny. Presented as ONE combined
ratification form on his return (PROCEDURE.md, AFK ratification pattern).
Rows are appended while the AFK run progresses; nothing is removed until
Kenny has answered it.

AFK mode: **off** since 2026-09-05 (Kenny returned and answered the
combined ratification form). It was on from the AFK start round (Q1 =
"Ja, zo doorwerken") until then: phase gates 1–5 became ratification
rounds R1–R5 below; Phase 6 milestone reports accumulated into one
combined report.

## Combined ratification form — answered 2026-09-05

R1–R5 all **Akkoord**; milestone reports L0–L8 all **Akkoord**.
Deviations: D4 (testing module → 1.x), D5 (first scaffold commit skips
the gates), D6 (pre-update copies beside the state root), D7 (kp-themes
`strings.js` vendored from the tag; relayed to the kp-themes project),
D8 (commit messages from a file, rule in the central memory) and N1 (the
waits-for-Kenny list) all **Klopt**. D1 (`/` = status page), D2
(request-id in the header only) and D3 (knob flags global) were answered
"meer info aub" → deep-dive round DD-1 (§3 of the form protocol), open.
Kenny also flagged an ambiguous "ik" in the D7 consequence line →
correction form CF-2, open (see below).

## Combined ratification AFK run 2 — answered 2026-09-05 (evening)

All 28 items answered. **R7** (Phase 7 close-out), **R9** (releases 1.0.0,
1.1.0, 1.2.0) and **MIG-1 … MIG-4** (the four migration branches):
**Akkoord**. **R8.1 … R8.6** (the six user documents): **Goedkeuren**, so
Phase 8 is closed as written. **CF-3** fields 1–9: **Klopt** — the
correction form is closed and its measurement (the 14:21 UTC re-drill) is
final. **H16** (the Kenny-only list), **HL-1** and **HL-2** (the two
announcements for the Homelab Rust session) and **CF-2.M**: **Klopt** — the
CF-2 loop is closed with the fallback lint in force as this project's
working method.

Three decision items came back **Opnemen**, and each is new work rather
than a ratification:

| ID | Decision | What it means |
|---|---|---|
| D-K1 | kyu adopts the kit dashboard as step 2 | A separate branch after this ratification: app tokens move from kyu's SQLite table to the kit's clients (every token re-issued to kyu-runner, newsflash and Home Assistant), `/apps` becomes `/clients`, the unprotected mode goes away, kyu's topics dashboard becomes a project page in the kit layout. The kit's FEATURES W6 note stands as written. |
| D-H1 | http-switchboard: one log stream | The switchboard's own JSON event lines go through the kit's logger, so `HTTP_SWITCHBOARD_LOG_FORMAT=json` yields one shape. Lands in the `chassis-migration` branch before the 2.0.0 release. |
| D-A1 | Almanac's update notifications return | Kit **1.3.0** gets `App::on_update_event(|event| …)` so a project routes the kit's update events into its own notifier; Almanac wires it onto `almanac-update` / `-reverted` / `-unverified`. Also useful for kyu and kyu-runner. |

**Standing rule 7a is back in force** now that Kenny has returned: D-K1
(kyu), D-H1 (http-switchboard) and Almanac's half of D-A1 are work in those
repositories and belong in sessions opened there. The kit's half of D-A1
(the `on_update_event` hook, release 1.3.0) is this project's work.

## Follow-up on the ratification — answered 2026-09-05 (late evening)

Kenny's answers to the four sequencing questions: **V1 Nu bouwen** (kit
1.3.0 with `on_update_event`), **V2 Deze sessie doet het nu** (D-H1 in
http-switchboard), **V3 Deze sessie doet het na V1** (Almanac's half of
D-A1), **V4 Aparte sessie in kyu** (D-K1).

Done in this session:

- **Kit 1.3.0** — `App::on_update_event`, `chassis::UpdateEvent`,
  `compose_sink` with a test; commit `3533047` on `main`, tag `v1.3.0`,
  GitHub release. *Live-found process fault on the way (CF-5 below): the
  first commit attempt was blocked by the gate (unstaged `Cargo.lock` after
  the version bump), my result check missed it, and the branch/tag/release
  were made on the ratification-docs commit. Caught when Almanac could not
  find the method; the wrong release and tag were deleted and re-created on
  the real commit within minutes. Nothing had consumed the wrong tag.*
- **D-H1 http-switchboard** — the three hand-built JSON emitters are
  structured tracing events (target `http_switchboard::events`); the k8
  log-scan test runs in json mode and asserts one shape; commit `97a0089`
  on `chassis-migration`, pushed.
- **D-A1 Almanac half** — `on_update_event` maps `update.installed` /
  `update.rolled_back` / `update.failed` onto `almanac-update` /
  `-reverted` / `-unverified` via the existing Notifier; the kit pin moved to
  `v1.3.0`. Commit: see the report item. AR24's "three verification failures
  before notifying" is NOT reproduced (the kit says it once) — known
  limitation, in the CHANGELOG.

### D-K1 · handover for the kyu session (V4: separate session)

kyu takes the kit's dashboard as a second migration step. What that session
needs to know, so it can start without this conversation:

- Branch `chassis-migration` in `~/Projects/kyu` is at 3.0.0 on kit
  `v1.2.0` (`1ca1e08`); bump to `v1.3.0` first (nothing in kyu needs 1.3.0,
  but one pin for all four projects is simpler).
- Read `docs/MIGRATION.md` §6 ("`ClientStore`: keeping your own client
  table") in chassis-rs: kyu's SQLite `apps` table can back the kit's
  clients through a `ClientStore` impl, which avoids re-issuing every token
  — the alternative is `clients.json.enc` and a re-issue to kyu-runner,
  newsflash and Home Assistant. **That choice is a form item for Kenny.**
- Enable the `dashboard` feature; kyu's `/`, `/login`, `/logout`,
  `/static/*` and `/apps` collide with the kit's routes — the topics
  dashboard becomes `dashboard_routes` project pages, `/apps` becomes
  `/clients` (`clients_label("Apps")` keeps the label), the unprotected
  mode goes away (the kit refuses to start a dashboard without
  `KYU_TOKEN` + `KYU_SECRET_KEY`), sessions move to the kit's sealed store.
- Tests to expect red: `p7_auth.rs` (unprotected-mode cases), `l7_dashboard.rs`,
  `w13_themes.rs` (kyu's templates → kit layout), `p7_security.rs` (cookie
  names), `p7_cli.rs` (`--help` mentions of `KYU_TOKEN` stay, via
  `help_extra`).
- kyu's FEATURES W2 (unprotected mode) and the kit's FEATURES W6 note both
  need a dated amendment in the same commit as the change (FORM_PROTOCOL §5.4).

## Report + correction forms CF-4/CF-5 — answered 2026-09-06 (00:50)

RP-1 (kit 1.3.0), RP-2 (http-switchboard D-H1), RP-3 (Almanac D-A1):
**Akkoord**. RP-4 (D-K1 handover for the kyu session): **Klopt**. CF-4 and
CF-5: all nine fields **Klopt** — both correction forms are closed; their
measurements are queued below (CF-4 at the Phase 10 retro form, CF-5 at the
next kit release). Phase 9 is closed; Phase 10 (retrospective) starts.

## Closing form after Phase 10 — answered 2026-09-06 (01:50)

**S6 Dichten**, **A2 Opnemen** (Almanac step 2, handover below), **A3
Opnemen** (kit 1.4.0: `update_notify_after_failures`), **A4 "Claude merget
drie nu, kyu wacht op stap 2"**. Kit 1.4.0 therefore carries S6 + A3 and
is the CF-5 measurement release. Before the merges, CI on two branch heads
turned out red (found by the fresh CI check A4 asked for, before any merge):
kyu-runner's cargo-deny refused the git source of the kit, two licenses its
rustls stack brings, and the version-less git dependency; http-switchboard's
container smoke test found the config under `/etc` while the kit looked in
`/var/lib`. Both fixed on the branches, through their gates, before the
fast-forwards.

**Report form of 2026-09-06 (R1 kit 1.4.0 + CF-5 measurement · R2 three merges after two CI fixes · R3 Almanac step-2 handover): R1 Akkoord, R2 Akkoord, R3 Klopt.** Recorded in the gate log; nothing further is scheduled for chassis-rs.

### A2 · handover for the Almanac step-2 session (kit dashboard)

Almanac takes the kit's dashboard as a second migration step, in a session
opened in `~/Projects/almanac`. What that session needs, without this
conversation:

- Branch `chassis-migration` is at 3.0.0 on kit `v1.4.0` after this
  session's bump; `main` is fast-forwarded to it (A4).
- Read `docs/MIGRATION.md` §§4–6 in chassis-rs first: the `/` ownership
  rule, assembling `main.rs` with `dashboard_routes`, and `ClientStore` for
  a project that keeps its own client table — Almanac's per-source ingest
  tokens live in `tokens.json` (sealed, XChaCha20) together with sessions;
  a `ClientStore` over that store avoids re-issuing every source's token
  (the alternative, `clients.json.enc`, means every source on the LAN
  reconfigures). **That choice is a form item for Kenny in that session.**
- Enable the `dashboard` feature. Collisions: Almanac's `/` (303),
  `/login`, `/logout`, nine explicit `/static/*` routes and `/dashboard/*`
  → kit-owned `/`, `/login`, `/logout`, `/static/*`; `/dashboard/sources`
  is the kit's `/clients` (`clients_label("Sources")`); `/dashboard`,
  `/dashboard/calendars`, `/dashboard/captures` become `dashboard_routes`
  project pages in minijinja (the current pages are Rust string-built
  Bootstrap HTML, 1 600 lines — a rewrite, not a port); `bootstrap.min.css`
  and `theme-bridge.css` go away with it (kit layout + kp-themes).
- Auth: `ALMANAC_BOOTSTRAP_TOKEN` (login AND admin bearer) splits into the
  kit's `ALMANAC_TOKEN` (login) and client tokens; the admin endpoints
  (`/v1/debug/*`) decide whether they take the login token as bearer (the
  kit allows it) or a client token. `ALMANAC_SECRET_KEY` maps 1:1. The
  capture-only token (S2) and `POST /v1/debug/capture/{label}` have no kit
  equivalent — keep them as project routes under the kit's client-token
  layer or as a public route with the own check; decide in that session.
- Tests to expect red: `tests/dashboard_http.rs` (49, asserts Bootstrap
  markup and the nine static routes), `tests/admin_http.rs` bearer shapes;
  `tests/ingest_http.rs` should stay green.
- FEATURES M12 (dashboard as built) and M11 (capture endpoint) need dated
  amendments in the same commit; the ECOSYSTEM entry's "How to integrate"
  (source id + token from the dashboard) stays true.
- The update notifications are wired via `on_update_event` (D-A1); the kit
  dashboard's update card then shows the same events.

## Correction forms CF-4 and CF-5 — ratified 2026-09-06, all fields Klopt

### CF-4 · a Dutch coinage slipped through the lint ("pomplussen") — **ratified, measurement open**

1. **What went wrong** — the explanation of the four migrations (Claude,
   2026-09-05 evening) called kyu-runner's route loops "pomplussen"; the code
   and docs say pump / route loop. Kenny: "is dat een gekke nederlandse
   vertaling voor wat een engelse term moet zijn?" — yes. Same fault as
   CF-1 (2026-09-05 morning).
2. **Gate that let it through** — CF-1's measure was a rule in the central
   memory plus a lint that checks a fixed word list (afbeelding, stapel,
   vergrendeling, …). A list only catches yesterday's coinages; this one
   was new. The reply was prose, not a form, so the lint did not even run.
3. **Where else** — every Dutch explanation this session wrote from
   memory of the code; not measured (transcripts). The property is "a
   Dutch word invented for a concept the code names in English", not the
   word list.
4. **Measure** — when a Dutch sentence names a code concept (a loop, a
   worker, a pump, a sink, a store, a guard), Claude uses the identifier's
   English word in the Dutch sentence and, first time, glosses it: "de
   pump loops (de lussen die per route de hub pollen)". The lint's word
   list stays as a backstop and gains each new find.
5. **Cost** — none in tooling; slightly more English in Dutch prose, which
   is Kenny's stated preference.
6. **Enforcement** — discipline-enforced (rule 24); visible to Kenny in
   every reply.
7. **Measurement** — at the Phase 10 retrospective form of this project:
   Kenny reads the retro's Dutch explanations and finds no coinage; Claude
   greps the retro text for words not in the code before sending.
8. **Fallback** — if another coinage is found: every Dutch reply that
   explains code goes through the form lint (word list + a check that each
   backticked identifier in the source paragraph appears in the Dutch text).
9. **Review** — Phase 10 retro.

### CF-5 · a blocked commit went unnoticed; tag and release landed on the wrong commit — **ratified, measurement open**

1. **What went wrong** — kit 1.3.0: `git commit` was blocked by the
   pre-commit gate (the version bump left `Cargo.lock` modified and
   unstaged, so the tree fingerprint failed). Claude's check grepped the
   output for `BLOCKED|error|FAILED` and printed `git log -1` without
   comparing it to the expected new commit; the chain went on to push the
   branch (at the old commit), wait for CI (green, trivially), fast-forward
   `main` (no-op), tag `v1.3.0` and create a GitHub release — all on the
   ratification-docs commit. Evidence: `git log --oneline -1` printed
   `365266d docs: ratification …` right after the "commit"; Almanac's build
   then failed with "no method named `on_update_event`".
2. **Gate that let it through** — none in the procedure: `chassis release`
   (the CLI) does this chain with checks, but Claude ran the steps by hand
   in a shell chain without asserting each step's postcondition. The same
   fault class as the AFK-morning "background commit jobs failed silently"
   note, corrected once by hand, never written down as a rule.
3. **Where else** — every hand-run commit→push→tag chain this session (kit
   1.1.0, 1.2.0 went right by luck: no unstaged file). The property is "a
   multi-step publish chain whose steps are not each verified".
4. **Measure** — Claude publishes kit releases with `chassis release
   <version>` (which bumps, commits through the gates, waits for the
   commit's CI, fast-forwards, tags and refuses to continue on any failed
   step) instead of a hand-typed chain. For other repos' commits: every
   commit step is followed by `[ "$(git rev-parse HEAD)" != "$before" ]`
   before anything is pushed, and a tag is only ever created from a
   verified `origin/main` SHA that contains the expected file change
   (`git show --stat`).
5. **Cost** — `chassis release` is already built and tested (L6); the SHA
   guard is one line per chain.
6. **Enforcement** — code-enforced for the kit (`chassis release`);
   discipline-enforced for other repos until their scaffold gains the same
   command.
7. **Measurement** — the next kit release (1.4.0 or 1.3.1): it must go
   through `chassis release`, and the tag must point at a commit whose
   `git show --stat` lists the feature files — checked before the GitHub
   release is created.
8. **Fallback** — if a wrong tag ever ships again: the release is deleted
   and re-created within the same session (as today) AND the standing
   rules get a "publish only through the release command" rule.
9. **Review** — Phase 10 retro.

## Phase 10 retrospective — answered 2026-09-06 (01:35)

All nine items **Opnemen**: L1 verified publish chain (standing rule 36),
L2 code concepts keep their English word (rule 1), L3 the form lint as the
standard (FORM_PROTOCOL §7 + `hooks/form-lint.py`), L4 "and the next tick?"
(critic + auditor briefs, rule 9), L5 bare-machine control commands
(auditor brief), L6 absolute `cd` (rule 37), L7 FEATURE COMPLETE is Kenny's
own rename (PROCEDURE, rule 22, digest), L8 multi-repository AFK runs
(PROCEDURE ground rules), E1 chassis-rs registered in ECOSYSTEM.md with its
six contracts and "Migration pending" lines on the four consumers.
Committed in dev-procedure as `0cad95c`; procedure linter clean. CF-4's
measurement (this form) passed — closed above.

Kenny's questions with the form, answered in the reply of 2026-09-06: is the
kit done, and are the four projects fully migrated. The honest list of what
is still open lives in §Open items after Phase 10 below.

## Open items after Phase 10 (2026-09-06)

The kit itself is complete as scoped (Phases 0–10 done, 1.3.0 released).
What remains is either a live proof only Kenny can give, an open
measurement, or a decision put to him in the closing form:

| Item | Kind | Who / when |
|---|---|---|
| S6 · unauthenticated exhaustion of the passkey ceremony table | **closed** — Dichten in the closing form; shipped in kit 1.4.0: bounded `Ceremonies` table (cap, TTL and per-IP share as knobs), an IP evicts only its own oldest ceremony, `/passkeys/login/*` behind the `/login` IP limiter; three unit tests + a 429 check in the passkeys E2E | done 2026-09-06 |
| CF-5 measurement · next kit release through the release command, tag checked before the GitHub release | **measured, passed** — 1.4.0 went out through `scripts/release-kit.sh` (the kit is a workspace, so this script is its release command in the sense of rule 36); tag `v1.4.0` → `3e0a41e` = `origin/main`, read back before `gh release create` ran | done 2026-09-06 |
| C2 · broken-release drill in both modes with a release signed by the ecosystem key | **done 2026-09-06** on CT 118 with Kenny's `scripts/drill-release.sh 0.1.4` (trusted comment `kennypassenier/chassis-rs v0.1.4`, verified against the compiled-in key; the `INBOX_UPDATE_PUBKEY` drill override removed for good): supervised swap 0.1.3 → 0.1.4 through the `systemd-run` contract ("installed 0.1.4 over 0.1.3; restart to run it", `.prev` kept, restart `active` NRestarts=0, `--healthcheck` alive=true version=0.1.4, second run "already current"); back to 0.1.3 by hand; autonomous rollback with `INBOX_UPDATE_DRILL=broken`: install, `DRILL` exit 1, revert on the second start, `update.held` for 0.1.4 afterwards (`update-skip.json` = ["0.1.4"], the CF-3 marker), NRestarts=3, 0.1.3 running; env restored to supervised. Broken-after-ready stays with the homelab (V12) | done |
| H7 · passkey success path (register/login) live behind Traefik with Bitwarden (A4) | **Homelab Rust session makes the route, Kenny drills** (V10): announced below under "Open with the Homelab Rust session" | after the route exists |
| Remote `chassis new` + `sync --protect` live (creates a repository) | **done 2026-09-06** (V11): `kennypassenier/chassis-smoke-20260906` created and pushed by `chassis new` (CLI 1.4.1), CI green 4/4, `chassis sync --protect` set protection on `main` requiring `fmt · clippy · tests`, `cargo-deny (advisories · licenses · bans)` and `container build` (read back through the API: strict, enforce_admins), repository deleted afterwards. The first attempt with CLI 1.4.0 was red on cargo-deny (git dependency without a version requirement) → kit 1.4.1 | done |
| Homelab binary reinstall + broken-after-ready re-run on CT 118 | Homelab Rust session | announced (HL-2) |
| AR24 · "three failed verifications before notifying" has no kit equivalent | **closed** — Opnemen; kit 1.4.0 knob `update_notify_after_failures` (default 3): one `update.failed` event at the N-th consecutive failed check, one `update.ok` on recovery; Almanac pins 1.4.0 | done 2026-09-06 |
| The four `chassis-migration` branches | **three released up to the signature** 2026-09-06 (V1–V4): after `.chassis.toml` + changelog preparation in each repo (kyu-runner `115c517`, http-switchboard `c630914`, almanac `480b7e1`), `chassis release` (CLI 1.4.1) tagged and built kyu-runner **v0.2.0** (re-tagged at `f48916a` after the first Release run failed for the missing Dockerfile), http-switchboard **v2.0.0** (`52a654e`) and almanac **v3.0.0** (`096af8d`); each release holds the binary and `SHA256SUMS` and is inert until Kenny runs `scripts/sign-release.sh v<version>` in that repo (one password prompt each). kyu stays on `chassis-migration` `1ca1e08` until step 2 (V7, this session) | Kenny signs; then V5/V6 |
| kyu D-K1 step 2 (kit dashboard) | **done 2026-09-06, merged to kyu `main` (`7b7428c`, unreleased)**: K2-1 kit clients file with the 2.x app tokens imported unchanged on first start (`kyu::kit::import_app_tokens`) · K2-2 `/topics` project page + Topics section on `/` · K2-3 `/apps` → `/clients` redirect, docs in kyu and kyu-runner (`3663b39`) · K2-4 kyu requires the token (W2 amended), the kit gained the opt-in open dashboard (**kit 1.5.0**, `AppSpec::open_dashboard`). kyu 3.0.0 on kit 1.4.1: 181 tests, `tests/k2_dashboard.rs` through the real `chassis::App`; CI needed `deny.toml` (git source, two licenses) and the container smoke test with the door | Kenny: release + deploy later |
| Almanac step 2 (kit dashboard, V8) | **decision form rendered 2026-09-06** (A2-1 source tokens · A2-2 pages · A2-3 bootstrap/capture tokens · A2-4 version); inventory measured on `main`: 15 UI routes with a per-handler cookie check, `tokens.json` (sealed per-source tokens + sessions, reversible), 1 559 lines of string-built HTML, 49 + 21 + 12 tests, pin v1.4.0 | Kenny answers |
| Almanac 3.0.0 on CT 112, first 3.x by hand (V5) | **done 2026-09-06 11:09 UTC**: signed assets verified locally (minisign + SHA256SUMS), binary pushed to `/opt/almanac/bin/almanac`, unit replaced with CT 112's real paths (state root `/appdata/almanac/almanac-config`, `latch run --`, `Type=notify`, `ExecStartPre --check`, `ALMANAC_UPDATE_MODE=supervised`), 2.4.0 unit kept as `almanac.service.2.4.0` and the 2.4.0 binary at `/opt/almanac/almanac`; `--check` ok under the real environment before the switch; after restart `active`, NRestarts=0, `/healthz` `{"status":"ok","version":"3.0.0"}`, profiles loaded (job-tracker), authenticated against Google. One warning to hand to the homelab: `trusted_proxies` is empty while listening on 0.0.0.0. Almanac's own docs corrected to the measured layout (`31b7f49`) | done |
| Almanac step 2 (kit dashboard) | **handover written** — §A2 below; Kenny opens a session in `~/Projects/almanac` when it fits | done 2026-09-06 |

## Ratification rounds (gates crossed during AFK)

| Round | Gate | Status | Document | What Kenny ratifies |
|---|---|---|---|---|
| R1 | Phase 1 · build-vs-buy | **ratified 2026-09-05 (Akkoord)** | docs/SCOPE.md §Build vs buy | per concern: use crate / build own / hybrid (17 rows; five "build our own") |
| R2 | Phase 2 · features + freeze | **ratified 2026-09-05 (Akkoord)** | docs/FEATURES.md | IDs, ratings, test expectations, mandatory items 1–4. **Note for Kenny:** W2's clap half moved into K2 (a parser is needed for `--version`/`--check` anyway); only the backoff helper stays Desired. New W9 proposed: systemd `Type=notify` readiness (AR15), rated Essential by Claude because the homelab's update check is `systemctl is-active`. |
| R3 | Phase 3 · tech choice | **ratified 2026-09-05 (Akkoord)** | docs/ARCHITECTURE_DECISIONS.md T1–T8 | libraries, license, MSRV, platforms, environment differences; release target glibc/trixie because webauthn-rs needs OpenSSL |
| R4 | Phase 4 · architecture + freeze | **ratified 2026-09-05 (Akkoord)** | docs/ARCHITECTURE_DECISIONS.md AR1–AR20 + §Critic pass | AR decisions; 6 blocking + 13 should-fix objections, all adopted with a resolution (table at the end of the document); the added knobs |
| R5 | Phase 5 · realization plan + hooks | **ratified 2026-09-05 (Akkoord)** | docs/REALIZATION_PLAN.md | milestones L0–L8, standing rules, hook config (Q9); hooks proven by firing (rule 7d) in the L0 commit |

## Phase 7 hardening form — answered 2026-09-05

23× Dichten (H1–H6, H8–H17, S1–S5, S7, S8), H7 Later, S6 accepted for now
(re-raise at the Phase 10 retro), S9 accepted as known limitation. Kenny's
additions: H4 → log rotation must be available where the service runs (LXC
journald, docker); H16 → Kenny provides the first kit tag, the signed drill
release, the go for the remote `chassis new` and a hostname for the Traefik
passkey test. Open remark: explain the minijinja dashboard model with
Almanac examples (answered in the session, to land in docs/DASHBOARD.md in
Phase 8).

## AFK round 2 — answered 2026-09-05 (Kenny AFK until the evening)

- A1 **Drill key**: Claude generates a separate password-less minisign key for
  drills; the kit gets `<P>_UPDATE_PUBKEY` (logged at start, shown on the
  update card as an overridden trust root); the live update drills on CT 118
  run with it. Production releases still need Kenny's signature.
- A2 **Kit plus four branches**: finish chassis-rs through the v1.0.0 tag,
  then a `chassis-migration` branch per repo for kyu-runner,
  http-switchboard, kyu and almanac (gates green, no release, no deploy).
  A7: kyu-runner and http-switchboard switch self-update ON in their branch.
- A3 **Adopt CT 118 only if it does not stall the AFK run**.
- A4 Passkeys behind Traefik: Later (Kenny).
- A5 **Tag v1.0.0** after green Phase 7 + 8 and the live drills (this answer
  is the rule-13 go).
- A6 AFK mode on: Phase 7 close-out, Phase 8 and Phase 9 gates become R7–R9.
- Kenny's remark: standing rule 7a (a session touches only its own project)
  is suspended until he returns; "big, tangible progress by tonight".

## Phase 7 build status (2026-09-05, AFK run 2)

Done in code and tests: H2, H3, H4, H5, H6, H8, H9, H10, H11, H12, H13,
H15, H17, S1, S3, S4, S5, S7, S8, S2 (templates; CT 118 redeploy pending),
H14 (loop test; the two update_cmd drills pending), K16 project pages.
Pending live work (drill key, A1): H1 + H14 drills on CT 118 with
`/opt/inbox/bin` and the hardened unit; A3 adopt if it does not stall.
Later/accepted: H7, S6 (retro), S9. H16 waits for Kenny's tag/go per item.

**Announcements for the Homelab Rust session (rule 7a, when it next runs):**
the scaffold's install path moved from `/usr/local/bin/<name>` to
`/opt/<name>/bin/<name>` (S2) — `service.yml`'s `binary:` and `update_cmd`
follow; the unit now carries the hardening set (`UMask=0077`,
`CapabilityBoundingSet=`, `SystemCallFilter=@system-service`,
`MemoryDenyWriteExecute=yes`, `ProtectProc=invisible`, …) and
`Environment=<P>_TIMEOUT_STOP_SECS` mirroring `TimeoutStopSec`; the kit's
`--check` refuses a missing or unwritable state dir (provision it before
`ExecStartPre`).

## Phase 8 (docs) — written 2026-09-05 by the doc-writer, awaiting R8

Six documents from code and tests: docs/GETTING_STARTED.md, CONFIGURATION.md,
DASHBOARD.md, SELF_UPDATE.md, OPERATIONS.md, MIGRATION.md (200 quoted strings
verified against their source files, 95 cited test names verified against
`cargo test -- --list`). The writer's honesty-pass findings and what happened
to them: (1) the Clients page carried an inline `<script type="module">` that
the new CSP would block in a browser — **fixed** (moved into chassis.js; E2E
now asserts no inline script on /login, /, /clients, /messages); (2)
`data-kp-busy` had no reader — **fixed** (`data-busy-label`, handled by
chassis.js); (3) `--help` claimed a config-file key for `state_dir`/`config`
— **fixed** (help text); (4) AR4/AR5 name `IntoApiError` and a different
`ClientStore` sketch than the code — **dated notes added**, docs follow the
code. R8 = one approval item per document (Goedkeuren · Aanpassen ·
Herschrijven) with the three strongest claims each, on Kenny's return.

## Phase 9 (release) — crossed AFK 2026-09-05, awaiting R9

Version 1.0.0 (kit + CLI), CHANGELOG [1.0.0] with the Migration notes for
services built against the 0.1.x tree, tag `v1.0.0` on main after green CI,
GitHub release created with `gh` (A5 was the go). **Followed the same
afternoon by 1.1.0** (`on_start`, `knob_keys`, public `spec` — found by the
kyu-runner migration) **and 1.2.0** (`help_extra`, `needs_project_config`,
`update_gate`, `--help` exit 0, the `assets` feature — found by the
http-switchboard, kyu and Almanac migrations); each release: bump + CHANGELOG
+ green CI on a release branch + fast-forward of the protected `main` + tag +
GitHub release. The four migration branches pin `tag = "v1.1.0"` (kyu-runner,
http-switchboard) and `tag = "v1.2.0"` (kyu, Almanac); the two 1.1.0 pins can
move to 1.2.0 whenever those branches are touched next. Consumers pin
`tag = "v1.0.0"`; `chassis new` defaults to it. Not part of this release:
a signed service binary (the kit is a library; services sign their own
releases with Kenny's key), the passkey live test (A4), the homelab's
broken-after-ready re-run (their binary).

## Migration branches (A2) — reports for Kenny, one per project

### kyu-runner · branch `chassis-migration` (0.2.0, unreleased, undeployed)

On chassis v1.1.0 with `core` + `self-update`. Pump unchanged; kit owns
CLI, config layers, logging, `/healthz`, `/metrics`, shutdown, self-update.
Decisions Kenny ratifies in the kyu-runner session: hub token env renamed to
`KYU_RUNNER_HUB_TOKEN`; the socket always listens (default `127.0.0.1:8082`);
`/healthz` in the kit's shape with 503 on `hub-down`/`auth-denied`/
`circuit-open`; `--check` (exit 1 on refusal) replaces `--check-config`; a
state dir is required; second SIGTERM ignored; `/opt/kyu-runner/bin` +
hardened unit; glibc release + signing; musl script retired. Suite: 69
green. Found on the way and fixed in the kit: no post-start hook for pumps
(→ `on_start`, chassis 1.1.0) and no way to strip kit keys before a
`deny_unknown_fields` parse (→ `knob_keys()`). Deploy follows only after
Kenny's go: homelab `stacks/kyu/kyu-runner/service.yml` (binary path, env
file, `update_cmd`), a signed 0.2.0 release, Uptime Kuma's probe address.

### http-switchboard → `chassis-migration` (2.0.0, commit ddbe11e, pushed 2026-09-05)

**Built, tests green under the project's own gate (with the kyu image), no
release, no deploy (A2).** `cargo test --all` with `KYU_IMAGE` set: every
suite green, incl. the docker E2E and the hard-kill test.

What changed for the operator (CHANGELOG 2.0.0 → Migration):
- CLI: positional `<config.toml>` → `--config`; `--check-config` → `--check
  --config`; `--healthcheck` kept (503 = alive now); `test …` dry-run kept
  (dispatched before the kit's parser). Unknown flag exits 1.
- A state dir is required (`/var/lib/http-switchboard`); it holds only the
  self-update state.
- `/healthz` = kit shape with one subsystem per profile; **503 whenever a
  profile is failing/denied/hub-down** — the old `?strict=1` behaviour is
  the only one (Uptime Kuma already probes with `?strict=1`).
- Inbound webhooks stay PUBLIC routes with the per-path `inbound_token`
  door; each inbound path is exempt from the kit's request timeout (a
  delivery may take retries × timeout + settle).
- Self-update ON (A7); FEATURES M1 amended; `deploy/homelab-preset/` retired
  in favour of the scaffold's unit + `deploy/service.yml` (vmid 109).
- Switchboard's own JSON event lines still go to stdout; the kit's lines go
  to stderr — folding them is a follow-up decision (item for the form).

Live-found faults while migrating:
- **`--healthcheck` read the project's config before probing** (both in
  http-switchboard and kyu-runner): a box without the file failed the probe
  with a config error. Fixed in both (`Control` match: only a real start and
  `--check` read the project's part); kyu-runner commit e674eb1. Kit-side
  question for the form: should `App` expose "does this control need
  project configuration?" so each project cannot get this wrong?
- The l7 hard-kill E2E only runs with `KYU_IMAGE` (the gate sets it, a bare
  `cargo test` does not) — it still used the old argv and was caught by the
  gate at commit time, not by my runs. Nothing to change in the kit.

Kenny-only afterwards: first signed 2.0.0 release, homelab `service.yml`
update + Uptime Kuma probe address, deploy (port 8083 on CT 109).

### kyu → `chassis-migration` (3.0.0, commit 1ca1e08, pushed 2026-09-05)

**Scope decision taken AFK (A3: adopt only what does not stall the AFK
run):** kyu runs on the kit's **core + self-update + assets**; its own
door policy (W2 unprotected/token + sealed app tokens in SQLite), sessions
and minijinja dashboard stay kyu's. The kit's FEATURES W6 note ("kyu loses
unprotected mode when it migrates") assumed kyu would take the kit's
dashboard too — that is a second step with real consequences (apps →
clients, every app token re-issued, `/apps` → `/clients`, unprotected mode
gone, kyu's SQLite `apps` table vs `clients.json.enc`) and is an item for
the form, not an AFK call.

What changed (CHANGELOG 3.0.0 → Migration): `KYU_DATA_DIR` → `KYU_STATE_DIR`
(alias with warning until 4.0); `/healthz` kit shape with `store` and
`sweeper` subsystems (503 semantics kept, flat fields gone); refusals exit 1
(was 2), `--help` exits 0 and lists kyu's own env via `help_extra`; `--check`
opens the store and prints the door mode; long polls under `/t/` exempt from
the request timeout; the no-flash snippet is the kit's `theme-boot.js` and the
fonts come from the kit's vendored set (CSP-clean, offline); `Type=notify`
unit at `/opt/kyu/bin` on the CT 109 layout (`/appdata/kyu/kyu-config`);
`deploy/service.yml` with `update_cmd`; glibc trixie image, same `/data`
volume and uid 65532; the kit's release workflow replaces `release-image.yml`
(image still pushed); AR6 and AR10 amended.

Kit gaps this migration found and closed in **1.2.0**: `help_extra`,
`needs_project_config()`, the `assets` feature, `--help` exit 0
(`Control::Help`); `update_gate` was added for Almanac in the same release.

Kenny-only afterwards: first signed 3.0.0 release; homelab
`stacks/kyu/service.yml` (binary path, `update_cmd`, `KYU_STATE_DIR` in the
env file); Uptime Kuma probe unchanged (`/healthz` still 503 when degraded);
the docker `HEALTHCHECK` now counts 503 as alive (kit decision) — a degraded
hub is visible in Uptime Kuma, not in `docker ps`.

### Almanac → `chassis-migration` (3.0.0, commit 6e36b7f, pushed 2026-09-05)

**Scope decision taken AFK (A3):** Almanac runs on the kit's **core +
self-update + assets**; its own dashboard (Bootstrap + string-built HTML),
auth (bootstrap token + session cookie in the encrypted store), per-source
ingest tokens and Home Assistant notifier stay Almanac's. Almanac's own
updater (1 900 lines, the ancestor of the kit's) is deleted; the kit's
replaces it with the version-bound signature, the skip-after-rollback and —
new in kit 1.2.0 for exactly this — the **update gate** that keeps AR25
("never restart while captures are retained").

What changed (CHANGELOG 3.0.0 → Migration): `ALMANAC_BIND` → `ALMANAC_LISTEN`,
`ALMANAC_SELF_UPDATE` → `ALMANAC_UPDATE_MODE` (unset = off now), the
`/releases` URL shape completed to `/latest/download`, `RUST_LOG` →
`ALMANAC_LOG` — all four as aliases with a warning; `ALMANAC_STATE_DIR` must
exist (probe); `/healthz` = kit shape with one `journal` subsystem (still
Google-blind, 503 only on an unreadable journal); `almanac_build_info` is the
kit's series; startup binds first and authenticates against Google after
(the unit no longer waits minutes for READY on a cold network); the
dashboard's inline scripts became files (`/static/almanac-*.js`, kit's
`theme-boot.js`, fonts from the kit's vendored set) because of the kit's
CSP; `Type=notify` latch unit at `/opt/almanac/bin` with state root
`/opt/almanac` (nothing moves); `deploy/service.yml` with `update_cmd`
through latch; the kit's release workflow + signing script.

**Regressions to decide on (form):** the `almanac-update` / `-reverted` /
`-unverified` Home Assistant notifications are not sent by the kit (core has
a logging-only notifier; the `notify` feature needs `[[notify.webhook]]` in
a config file Almanac does not have); `VERIFY_FAILURES_BEFORE_NOTIFYING=3`
(AR24) has no kit equivalent yet; the `ExecStartPre --check` under latch
needs `--env prod` to match how CT 112 runs latch — verify at deploy.

**Hard blocker for self-update, Kenny-only:** every existing Almanac release
(≤ 2.4.0) is signed with minisign's default trusted comment; the kit refuses
them. The first 3.x release must be signed with `scripts/sign-release.sh`
(`-t "kennypassenier/almanac v3.0.0"`) and installed once by hand or via
`homelab install-native`; from then on `almanac update` works.

## Open with the Homelab Rust session (announce, do not fix here — rule 7a)

- **Broken-after-ready drill ran on 2026-09-05 14:24 UTC against CT 118
  (stack `inbox`, adopted the same afternoon)** — the kit's half works: the
  new binary sent READY and exited 1 five seconds later. The homelab's
  `update-native` declared "healthy" right after `systemctl restart` saw
  `active`: the INSTALLED `~/.cargo/bin/homelab` is v3.48.0 (05:33), older
  than F300 (commit 1ed72e3, 08:39) — the window/NRestarts supervision was
  never exercised. What the homelab session needs to do: `cargo install
  --path` (or its release flow), then re-run `homelab update-native inbox`
  with CT 118 serving the drill: on the PC `scripts/drill-release.sh 0.1.4
  --drill-key --serve 9000` (or any newer drill version), on CT 118
  `INBOX_UPDATE_DRILL=broken-after-ready` and `INBOX_UPDATE_MODE=supervised`
  in `/etc/inbox/inbox.env`, and the skip list `/var/lib/inbox/update-skip.json`
  removed if present. Expected: DIED_IN_WINDOW → rollback to `.homelab-prev`.
- `update_cmd` was removed from `stacks/inbox/service.yml` after the drill so
  the nightly run does only the backup until a real release pipeline exists
  (the drill server on the PC is not a release host).

- ~~Critic #18~~ **resolved by the Homelab Rust session the same day**
  (homelab commit `1ed72e3`, F300): the `is-active` loop was effectively
  dead code (a `Type=exec` unit is active the moment it is exec'd, so the
  first iteration always passed). The supervision now requires `active`
  over the window AND an unchanged `NRestarts` counter, waits up to 20 s
  for the first `active` (room for `Type=notify`), names its failure
  (`NEVER_ACTIVE`, `DIED_IN_WINDOW`, `RESTART_LOOP`), and stops the unit
  before the rollback copy. They wait for the kit's `broken-after-ready`
  drill mode (K20) on CT 118 to prove it live.
- Alloy JSON stage for structured logs (K4) — once the kit ships JSON.
- Quiesce call in the nightly backup (W4) — once the kit ships it.

**Added 2026-09-06 (follow-up form "de overgebleven items", V6 and V10):**

- **V6 · stack files and the CT 109 rollout.** The three services carry the exact
  proposal for their homelab stack file in their own `deploy/service.yml`;
  the homelab copies are behind: `stacks/almanac/service.yml` names
  `binary: /opt/almanac/almanac` and the 2.x `update_cmd` (3.0.0: binary
  `/opt/almanac/bin/almanac`, `update_cmd` through `systemd-run --wait --pipe
  --collect` + `latch run -- … update`; **the state root on CT 112 is
  `/appdata/almanac/almanac-config`, measured 2026-09-06, not `/opt/almanac`
  as the project's file says — take the paths from the box, then fix the
  project's file**); `stacks/kyu/kyu-runner/service.yml` and
  `stacks/kyu/http-switchboard/service.yml` name `/usr/local/bin/<name>` and,
  for kyu-runner, the asset `kyu-runner-x86_64-linux-musl` (kit releases:
  asset `<name>`, install path `/opt/<name>/bin`, `Type=notify` unit from
  `deploy/<name>.service`). Then roll out kyu-runner 0.2.0 and
  http-switchboard 2.0.0 on CT 109 (both `active` there today under
  `/usr/local/bin`, measured 2026-09-06) once Kenny has signed their releases.
- **V10 · H7 passkeys behind Traefik.** Add a Traefik route
  `inbox.kp-soft.dev → http://10.10.10.18:8080` (CT 118, the kit's example
  service) in the gateway stack's `traefik-routes.yml`, with Cloudflare Access
  in front as everywhere; Kenny then registers and logs in with a passkey from
  Bitwarden; the route can go again afterwards. Nothing in production depends
  on it.

## Mini-rounds and deep-dives (deviations from a frozen decision)

| ID | Item | Status |
|---|---|---|
| DD-1 | Deep-dive on D1 (`/` = kit status page), D2 (request-id header vs body, AR4 wording), D3 (knob flags global after a subcommand) | **answered 2026-09-05: all three Klopt** — README "Conventions worth knowing", AR4 amended, dated note on the dashboard AR |

## Open measurements (correction forms, rule 29) and drills that must happen

| ID | Measure | Measured at | Status |
|---|---|---|---|
| CF-1 | No Dutch coinage for a technical concept in user-facing text (list + rule in the central memory) | The Phase 4 architecture form of this project — which the AFK run turned into R4 of the combined ratification form: zero such words, counted before sending | measured at the combined form (see its leeswijzer) |
| M3 | Restore from the backup regime restores the full state | Before the 1.0 release, on CT 118 with the real binary | **done 2026-09-05** — state root tarred, destroyed, restored; existing client token and session valid afterwards (REALIZATION_PLAN L8) |
| C2 | Broken-release drill in both modes | Before the 1.0 release, on CT 118 | waits for a release signed with the ecosystem key (Kenny) |
| CF-3 | After an autonomous rollback the same version is never reinstalled (skip list in the state root) | The first autonomous-mode drill after the fix on CT 118: install → crash → revert → the next check reports `Held` ("rolled back earlier"), zero further restarts in the following interval | **CLOSED 2026-09-05: measured at 14:21 UTC on CT 118 (one install/crash/revert, then Held twice across the next interval, NRestarts=3) and ratified the same evening — all nine fields Klopt** |
| CF-2 | Text read on its own (consequence lines, pill labels, card subtitles) describes actions as "Claude doet…" / "Kenny doet…" — never a bare ik/jij | The Phase 7 hardening form of this project: Claude counts bare pronouns in those surfaces AFTER writing it by habit and BEFORE sending, reports the raw count, then fixes; Kenny finds none | **measured 2026-09-05 at the Phase 7 form: 26 consequence boxes, 104 pills, raw count = 1 bare "jij" (H17), fixed before sending.** Field 8 (fallback) therefore applies: from now on every form of this project is written to a file, run through the pronoun/coinage/gloss count and rendered only at 0 (the lint), and consequence lines start with Claude / Kenny / an article. Kenny's own reading of the Phase 7 form is the second half of the measurement. **CLOSED 2026-09-05 (evening): the combined ratification form ran through the lint (28 items, 196 loose text lines, 0 bare pronouns, 0 Dutch coinages) and Kenny answered CF-2.M Klopt — the fallback lint is this project's working method from here on.** |
| CF-4 | A Dutch sentence that names a code concept uses the code's English word, glossed on first use; the lint word list grows with each find | The Phase 10 retrospective form of this project: Kenny finds no coinage in its Dutch explanations; Claude checks each code concept carries its English identifier before sending | **CLOSED 2026-09-06** — measured at the Phase 10 retro form: the lint reported 0 bare pronouns over 81 loose lines and 1 coinage hit, which was the quoted counter-example "pomplussen" itself; Kenny found no coinage and adopted all nine lessons. The rule is now STANDING_RULES §1 (dev-procedure 0cad95c). |
| CF-5 | Kit releases only through `chassis release`; every hand-run commit step guarded by a HEAD-changed check; a tag only from a verified `origin/main` SHA whose `git show --stat` lists the feature files | The next kit release (1.3.1 or 1.4.0): it runs through `chassis release`, and the tag's commit is checked before the GitHub release exists | **closed** — measured 2026-09-06 at kit 1.4.0: released through `scripts/release-kit.sh` (rule 36 chain), tag `v1.4.0` → `3e0a41e` verified against `origin/main` before the GitHub release existed |

### CF-2 · correction form, answered 2026-09-05

1. **What went wrong** — ratification form, D7 consequence line "Klopt — zo
   blijft het; ik meld het aan de kp-themes-sessie": "ik" ambiguous next to
   a button Kenny clicks. Measured over the session: 7 forms, 91 consequence
   boxes, 128 bare ik/jij/jouw/je (140 hits minus 12× the fixed option name
   "Toon mij dit"), 0 in pill labels. *(Klopt)*
2. **Gate that let it through** — the mandatory FORM_PROTOCOL re-read: the
   rule (§7, 2026-09-03) was read but the pre-send check counted only Dutch
   coinages (CF-1); a rule that is only read is discipline. *(Klopt)*
3. **Where else** — every form of this session; other projects' forms since
   2026-09-03 not measured (their own transcripts). The fault is the
   property "text read on its own with an unnamed actor", not the D7 line.
   *(Klopt)*
4. **Measure** — Kenny's own words (Eigen antwoord): describe actions as
   "Kenny doet…" / "Claude doet…" instead of ik/jij. A template, not a ban;
   saved as a central memory (`feedback_name_actor_claude_kenny.md`) and as
   one sentence in FORM_PROTOCOL §7. No script. The lint Claude proposed is
   demoted to the fallback (field 8).
5. **Cost** — none in tooling (Kenny: "zie mijn opmerking"); the cost is
   the risk that habit fails again, which field 7 measures and field 8
   catches.
6. **Enforcement** — discipline-enforced (standing rule 24), visible to
   Kenny in every form he reads. *(Klopt, adjusted from "script" to match
   field 4)*
7. **Measurement** — the Phase 7 hardening form: Claude writes it by habit,
   counts bare pronouns in consequence lines/labels/subtitles before
   sending and reports the raw count; Kenny finds none. Loop stays open
   here until then. *(Klopt)*
8. **Fallback** — if the count is not zero or Kenny flags one: consequence
   lines go on the fixed template (start with Claude/Kenny/an article) AND
   the form-lint script becomes mandatory before every form. *(Klopt)*
9. **Review** — at the chassis-rs Phase 10 retrospective. *(Klopt)*

### CF-3 · correction form — **CLOSED 2026-09-05, all nine fields Klopt**

1. **What went wrong** — autonomous rollback drill (CT 118, 2026-09-05,
   drill release 0.1.2 with `update_drill=broken`): the rollback itself
   worked (install → exit 1 before READY → second start reverted to 0.1.1),
   but the restored 0.1.1 re-checked after `startup_delay` (3 s in the
   drill), saw 0.1.2 as newer and installed it AGAIN. Journal: three full
   install/crash/revert cycles, `NRestarts=6` in 45 s. With the default
   interval the production shape is the same churn every six hours.
2. **Gate that let it through** — the architecture (AR8/AR9) named the
   rollback and stopped there; the critic pass (19 objections) did not ask
   "and the next tick?"; the unit tests drove one revert and never a
   second check afterwards. Only a live loop showed it.
3. **Where else** — the same silence exists in Almanac's updater (the
   ported design); its live rollback drill has not run either (homelab
   docs: "the live broken-release drill is pending").
4. **Measure** — `update-skip.json` in the state root: the reverted
   version is recorded at revert time and `check_once` answers `Held`
   for it (event `update.held`, detail "rolled back earlier"); a newer
   release is installed normally; the read-only watch says "skipped".
   Test `a_rolled_back_version_is_never_reinstalled` reproduces the churn
   and fails on the old code (rule 8).
5. **Cost** — one small JSON file; an operator who WANTS to retry the same
   version deletes the file (documented in SELF_UPDATE.md) — no knob, on
   purpose: retrying a version that just crashed is the exception.
6. **Enforcement** — code-enforced (the test and the skip file).
7. **Measurement** — the autonomous drill re-run on CT 118 right after the
   fix: one install/crash/revert, then `Held` and no further restart in
   the next interval.
8. **Fallback** — if a retry ever happens anyway: refuse autonomous mode
   at start when `update-skip.json` names the latest release (fail closed
   into supervised behaviour) until an operator clears the file.
9. **Review** — at the Phase 10 retro; and in Almanac's migration branch
   the same skip logic arrives with the kit.

## The visible surface (PROCEDURE Phase 6: published as soon as there is something to see)

The example service `inbox` with the L4 dashboard runs on the scratch
container **CT 118** under a `Type=notify` systemd unit
(`/etc/systemd/system/inbox.service`, user `inbox`, state in
`/var/lib/inbox`), reachable on the LAN at **http://10.10.10.18:8080**.
The login token is the `INBOX_TOKEN` line of `/etc/inbox/inbox.env` on
that container (mode 0640, root:inbox) — read it with
`ssh root@10.10.5.250 pct exec 118 -- cat /etc/inbox/inbox.env`. It is a
drill secret on a disposable container and is deliberately not written
anywhere in this repository. Kenny: open the URL, log in, issue a client,
click Reveal / Copy token / Copy command / Last requests / Send test —
this is what every service on chassis-rs will look like.

## Deliberately not done (waits for Kenny, AFK start round Q10)

1. **Signing and publishing a release** — needs Kenny's minisign key and
   his explicit "go". Builds and tags are prepared; nothing is published.
2. **`homelab adopt` of the scratch container** — writes into the
   homelab's state; Kenny runs it or gives the go in this session.
3. **Passkey test behind Traefik** — needs a hostname and certificate
   Kenny manages. What is ready: set `INBOX_PUBLIC_URL=https://<host>` and
   `INBOX_TRUSTED_PROXIES=<traefik ip>` in `/etc/inbox/inbox.env` on
   CT 118, point Traefik at 10.10.10.18:8080, open `/passkeys` after a
   token login, register with Bitwarden, log out, log in with the passkey.
   Everything up to the browser ceremony is covered by tests.
4. **Anything that would change a frozen decision of 2026-09-05** —
   becomes a mini-round above instead of being built.
5. **The live update drills on CT 118 (L8, C2)** — the kit trusts only
   the ecosystem minisign key, so a drill release must be signed by Kenny.
   Ready when he is: `chassis` will ship `scripts/drill-release.sh` that
   builds the trixie `inbox`, writes `VERSION`/`SHA256SUMS`, and stops at
   `minisign -S -m SHA256SUMS` for him; the PC then serves that directory
   over HTTP and CT 118 runs `inbox update` (supervised) and the
   autonomous rollback with `update_drill=broken`.

## Decisions taken in the AFK start round (2026-09-05)

- Q2 GitHub repo public, created via gh; branch protection once CI exists.
- Q3 Platforms: Linux x86_64 only — Debian LXC (glibc) and static musl
  binary; distroless container optional; dev on Kenny's Garuda PC; CI on
  GitHub Actions Ubuntu. No Windows, macOS or ARM.
- Q4 Scratch resource: CT 118 on the Proxmox host (10.10.5.250), created
  by Claude, disposable.
- Q5 Dependency policy: pragmatic — well-known crates, cargo-deny as
  gatekeeper, one-line reason per crate in ARCHITECTURE_DECISIONS.md.
- Q6 Example service: `inbox` (clients POST JSON messages, dashboard page
  lists them).
- Q7 License: MIT OR Apache-2.0.
- Q8 kp-themes vendored at v3.1.0.
- Q9 Hooks: fmt + clippy (-D warnings) + full suite + clean-tree check per
  commit, IDs in the message, `--no-verify` forbidden, cargo-deny in CI.
