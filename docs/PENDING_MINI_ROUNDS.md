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

## Closing form of the batch — answered 2026-09-06 (17:50)

**Report:** R1 kit 1.4.1 + 1.5.0 Akkoord · R2 three releases + Almanac
3.0.0 live: **Eigen antwoord** (see the live fault below) · R3 remote
scaffold + C2 Akkoord · R4 kyu step 2 Akkoord · R5 Almanac step 2 + 4.0.0
Akkoord. **CF-6** (the kit/migration faults found live on 2026-09-06):
all nine fields **Klopt** — ratified below, measures a/b become kit 1.5.1.
**D1** http-switchboard's webhook door: *Stap 2 plannen* (inventory +
its own form, last in the order below). **D2** the Almanac 4.0.0 install:
*Eigen antwoord* — Claude manages the latch env itself (create the
gitignored `.env` in the project with latch if absent, edit it if present,
push to latch); standing instruction from Kenny: "als je zelf met latch
iets kan doen zodat ik het niet hoef te doen, dan mag dat en heeft het
zelfs de voorkeur" (asking first is fine too).

**Kenny's order for everything that is still open** (his remark): all
answers stand, but the work runs **chassis-rs first, fully; then almanac;
then kyu; then kyu-runner; last http-switchboard** — "als er dan iets in
chassis-rs gewijzigd moet worden, dan moeten we niet altijd alle andere
projecten aanpassen".

**Live fault reported in R2** (Kenny, on almanac.kp-soft.dev = CT 112,
almanac 3.0.0 on kit 1.4.0, and on 10.10.10.12:8080): deleting the calendar
`almanac-test` answered `{"error":"cross-origin request from null
refused", …}` on a bare JSON page; logging in at the IP gave the same
refusal instead of the dashboard. Measured: `curl -X POST -H "Origin: null"
http://127.0.0.1:8080/login` on CT 112 → 403 with that body; every kit
response carries `referrer-policy: no-referrer`, and per the Fetch
standard a browser sends `Origin: null` on a navigation POST (a form
submit) under that policy — so **every form in every kit dashboard is
refused from Chrome**, login included, and the refusal is a JSON page
outside the layout. Kit fault since 1.0 (`shell/guards.rs::csrf_guard` +
`shell/http.rs::security_headers`); correction form **CF-7** below.
Kenny also asked whether the Captures page was not supposed to disappear
into the Sources page — he is right: the kit's FEATURES K13 says "replaces
Almanac's captures page"; the A2-2 form of this session offered the
contradicting option. Both go to the next form (CF-7 + the A2-2 revisit).

**v4.0.0 signed by Kenny 2026-09-06 ~17:55** (`SHA256SUMS.minisig` on the
release) — **not installed**: it carries the same fault (kit 1.5.0). The
CT 112 install waits for almanac 4.0.1 on kit 1.5.1, in almanac's turn.

## Hold — 2026-09-06 (23:35 local): waiting for kp-themes

Kenny skipped the report/D6/H1 form on purpose: first a kp-themes update
(layout utilities, the theme-revert report, the destructive-confirm dialog
— prompt handed over earlier tonight), which chassis-rs implements first;
the other projects then take it in **their own sessions** (rule 7a back in
force; the three lifts of today are over). kyu v3.0.0 is signed
(`SHA256SUMS.minisig` + `VERSION` on the release); its deploy on CT 109 is
the Homelab Rust session's (V6). The form's items stay open in this file:
R1 (kyu/kyu-runner/http-switchboard turns), D6 (kyu-runner 0.2.1), H1
(http-switchboard's inbound door: kit client tokens / drop / keep — measured:
no inbound profile live).

## Kit 1.7.1 — released 2026-09-06 (22:05 local)

Found by kyu's first sync: `service.yml` came back with `vmid: 0` and
hostname `0-app-kyu` (Almanac's first sync had done the same, unnoticed).
`.chassis.toml` gains `vmid`; both projects record theirs (109, 112) and
re-synced. Released through `scripts/release-kit.sh` at `da6a45e`; CLI
1.7.1 installed.

## kyu's turn — 2026-09-06 (22:10 local, this session, rule 7a lifted)

Measured on CT 109: `User=kyu`, `EnvironmentFile=/appdata/kyu/kyu-config/kyu.env`
(KYU_TOKEN, KYU_SECRET_KEY, KYU_LISTEN, KYU_DATA_DIR, KYU_LOG), state root
`/appdata/kyu/kyu-config`, binary still `/usr/local/bin/kyu` (2.4.1,
`Type=simple`), no latch; kyu's own `service.yml` already targets
`/opt/kyu/bin/kyu` for 3.0.0 (the V6 deploy moves it), so the scaffold's
binary layout stands. Done: `.chassis.toml` (measured paths, vmid 109),
kit 1.4.1 → 1.7.1 (CF-7 fix), `chassis sync --write` (kit CI/hooks/deny/
Dockerfile/deploy), SQL guard + CI-only container smoke in
`gates.project.sh`, ignore rules under the marker, CHANGELOG folded for the
release; 181 tests, cargo-deny clean without exceptions. Release 3.0.0 runs
to Kenny's signature; the deploy on CT 109 stays with the Homelab Rust
session (V6).

## Report form kit 1.6.0/1.7.0 + almanac 4.0.2 — answered 2026-09-06 (21:35 local)

R1 kit 1.6.0/1.7.0 **Akkoord** · R2 almanac 4.0.2 live + CF-8 closed
**Akkoord** · **K1** kyu's turn *in this session, rule 7a lifted for kyu*
(the third lift today: V7, V8, now kyu's release turn). Almanac's turn is
closed; its open items live in almanac's PENDING (`backoff`, `latch push`,
kp-themes).

## Almanac 4.0.2 — signed and live on CT 112 2026-09-06 (19:01 UTC)

Kenny signed v4.0.2; assets verified locally (minisign, SHA256SUMS,
trusted comment `kennypassenier/almanac v4.0.2`), binary staged as
`almanac.4.0.2`, `--check` ok through `latch run` under the real
environment, swap, restart: `active`, NRestarts=0, `/healthz` 4.0.2,
`/sources` → 303 `/calendars`, calendar cache primed without a warning.
4.0.1 kept as `bin/almanac.4.0.1`. Kenny's half of the CF-8 measurement
(Chrome on almanac.kp-soft.dev: one Sources page with the calendar column,
Calendars page with the id toggle, no horizontal scroll) is the next gate.

## Almanac 4.0.2 — released to the signature 2026-09-06 (23:05)

One Sources page on the kit (S1), Calendars page, deny exceptions, scaffold
on 1.7.0: almanac main `86b7573` = tag `v4.0.2`, Release workflow green,
`sign-release.sh` waits for Kenny. Look-drill done locally (CF-8 c): one
"Sources" in the nav, name + calendar on the issue form, no horizontal
scroll; the glued "Make and share it" stays with kp-themes. Almanac's
branch protection still required the old check name `gates`; set to the
kit's three checks with `chassis sync --protect` (read back). Lesson (rule
37 again, 2026-09-06 evening): two background chains in the same worktree
(a docs commit while the release chain merged) lost a commit — one
git-writing chain per repository at a time.

## Kit 1.7.0 — released 2026-09-06 (22:20)

S1 as ratified: `App::client_form_field` (text/select, options at render
time), `on_client_issued` (before the token; may refuse) and
`on_client_deleted` (before the delete; may refuse — Almanac keeps a source
while its events wait), `POST /api/clients` takes the fields; `deny_ignore`
in `.chassis.toml`; the units set `<PREFIX>_STATE_DIR` explicitly (found by
the Almanac sync). E2E `tests/client_form_hooks.rs`. Released through
`scripts/release-kit.sh` at `5ca3712`; CLI 1.7.0 installed.

## Form S1/S2 — answered 2026-09-06 (21:30)

**S1** *Eigen antwoord*: fields on the issue form + hooks (the recommended
option), minus the "schema" column — Kenny: "wat is die schema 2 en waarom
zouden we dat tonen?" — it is the profile file's format version, an
internal detail; the row shows name, calendar, token, last requests, Send
test, Delete. **S2** kit 1.7.0 first, then one Almanac 4.0.2 (merge +
calendar names + hidden ids + scaffold sync). Found on the way: the
scaffold-synced Almanac branch was red on cargo-deny (RUSTSEC-2023-0071 rsa
Marvin via jsonwebtoken, RUSTSEC-2024-0384 instant, RUSTSEC-2025-0012
backoff) with nowhere to record a reviewed exception → `deny_ignore` in
`.chassis.toml` (1.7.0); replacing `backoff` (unmaintained) is an Almanac
item for its next turn.

## Kit 1.6.0 — released 2026-09-06 (21:05)

M1–M3 as ratified: `gates.sh`/CI run `.claude/hooks/gates.project.sh` when
present; `.chassis.toml` `env_file` and `latch_env` reach the deploy
templates; `.gitignore` entries under the marker survive a sync. Released
through `scripts/release-kit.sh` at `9ffb423`; CLI 1.6.0 installed.

## Correction form CF-8 + T1/N1/Q1/V1 — answered 2026-09-06 (20:40)

**CF-8** (Almanac 4.0.1 dashboard layout: calendar IDs in tables, buttons
glued to fields, double "Sources" nav; no page was ever looked at in a
browser): fields 1–3 and 5–9 **Klopt**; **field 4 Eigen antwoord** — Kenny:
layout affordances are kp-themes' business; the kp-themes session will
build test pages to find layout faults, so the kit gets NO stopgap layout
classes (4a dropped). What stays of the measure: 4b minus the spacing
(calendar names instead of IDs, IDs behind a reveal, nav per N1) and 4c
(the look-drill). **T1** the theme-revert report happens on
almanac.kp-soft.dev — handed to kp-themes with the measurement (not
reproducible in Chromium 148 on either address). **N1 Eigen antwoord** —
Kenny: merge the two Sources pages; Almanac's per-source extras (a token
belongs to a name AND a calendar) should ride on the kit's dynamic page
extension — "dat was toch het hele concept van kit?" → a design form on the
kit's clients-page extension points follows (chassis-rs first). **Q1** —
Kenny pastes the kp-themes question himself; Claude delivered the prompt in
the reply (layout utilities or a Bootstrap base, the theme revert, the
confirm-by-relabel UX). **V1** — logged in and deleted `almanac-test`:
**CF-7 measured and closed**; but the kit's destructive-confirm (relabel the
button for a few seconds, click again) is bad UX in Kenny's words — a
dialog belongs there; kp components' behaviour → in the kp-themes prompt.
Kenny's order: everything not theming-related first, here; theming in the
kp-themes session in parallel.

## Mini-round form M1–M4 + D5 follow-up — answered 2026-09-06 (19:40)

The D5 trial (`chassis sync --write` on a throwaway Almanac branch, discarded)
showed three kit gaps; Kenny: **M1 Opnemen** (kit `gates.sh` and `ci.yml` run
`.claude/hooks/gates.project.sh` when present — Almanac keeps AR13 and M8,
kyu its SQL guard), **M2 Opnemen** (`.chassis.toml` knobs `env_file` and
`latch_env`, used by the deploy templates, so the rendered unit and
`service.yml` equal the measured CT 112 layout), **M3 Opnemen** (sync keeps
the `.gitignore` block under `# --- project additions below ---`), **M4**
kyu has no `.chassis.toml` — Claude adds it in kyu's turn with CT 109's
measured paths, dry-run before the 3.0.0 release. **D5 follow-up:** kit
1.6.0 first, then the Almanac sync on a branch (CI green, report item), then
kyu-runner (390 drift lines), http-switchboard (443), kyu. All three M items
are dated amendments to FEATURES (K25 scaffold/sync) once built.

## Report form kit 1.5.1 + almanac 4.0.1 — answered 2026-09-06 (18:55)

R1 kit 1.5.1 **Akkoord** · R2 almanac 4.0.1 **Akkoord** · **D4** latch rename:
*Claude hernoemt op CT 112 met latch edit* (done, see the open-items table) ·
**D5** scaffold files for Almanac: *Eigen stap na de 4.0.1-installatie* —
Claude applies `chassis sync --write` on a branch, fixes what the kit CI
turns red (the login token in the container check), reports with a report
item; the same step joins kyu, kyu-runner and http-switchboard in their
turn. Kenny signed v4.0.1 during the form.

## Kit 1.5.1 — released 2026-09-06 (19:20)

CF-6 a/b, the CF-7 fix, and three faults the release chain itself surfaced
in the kit gates on three consecutive runs (each fixed with a test, not
retried): the updater's `--check` probe hit `ETXTBSY` right after staging
(now retried, 40 × 50 ms); the inbox E2E reused a pooled connection the
server had closed after a streamed 413 (fresh client); and `/healthz`'s
"last write" slot was cleared by any successful write — a real health
fault (a broken store directory read as healed the moment another file
was written) that also raced parallel writers in the tests; failures are
now kept per path. Released through `scripts/release-kit.sh` at
`149d4fa`; CLI 1.5.1 installed on the PC.

## Correction form CF-7 — ratified 2026-09-06 (18:40), all nine fields Klopt

### CF-7 · kit dashboard forms refused from Chrome; refusals as bare JSON tabs — **ratified, measurement open**

1. **What went wrong:** every form in every kit dashboard was refused
   from Chrome, login included, and the refusal was a JSON document on
   its own tab. Evidence: on CT 112 `curl -X POST -H "Origin: null" -d
   token=x http://127.0.0.1:8080/login` → 403 `cross-origin request from
   null refused`; every response carried `referrer-policy: no-referrer`,
   under which the Fetch standard makes a browser send `Origin: null` on a
   form submit (a navigation). Kit fault since 1.0 (`csrf_guard` +
   `security_headers`); live on CT 112 since 11:09 (almanac 3.0.0 on kit
   1.4.0), also in kit 1.5.0 and thus in the signed almanac v4.0.0.
2. **Gate:** the Phase 7 test plan — every dashboard test posts without
   `Origin` (the "scripts pass" branch), the CT 118 drills used curl, no
   browser ever submitted a kit form (H7 deferred to V10). Rule 35 again.
3. **Where else:** one guard, one header, in the core every project
   loads: almanac 3.0.0 live, almanac v4.0.0 signed, kyu 3.0.0 main, inbox
   0.1.3 on CT 118. kyu-runner and http-switchboard have no dashboard.
   The JSON-tab half sits in every `Error` the kit answers to a browser.
4. **Measure (kit 1.5.1):** (a) `referrer-policy: same-origin`; (b) the
   guard reads `Sec-Fetch-Site` first (`same-origin`/`none` pass,
   `cross-site`/`same-site` refused, `Origin` vs `Host` only without it,
   `null` stays refused); (c) refusals to browser navigations render in
   the layout (`templates/error.html`); (d) tests sending exactly Chrome's
   headers (`tests/browser_forms.rs`, guard and HTML-error unit tests) plus
   the Chrome drill in TEST_PLAN §5 before every dashboard-touching kit
   release.
5. **Cost:** ~2 h kit work in the same release as CF-6 a/b; five minutes
   of drill per dashboard release; projects only bump the kit tag.
6. **Enforcement:** a–d code (tests, CI); the Chrome drill discipline
   (TEST_PLAN §5), marked as such.
7. **Measurement moment:** the almanac 4.0.1 install on CT 112 — Kenny
   logs in from Chrome and deletes calendar `almanac-test`; Claude measures
   beforehand with the fingerprint tests and the Chrome drill on CT 118.
8. **Fallback:** if Chrome still refuses, a synchronizer token in every
   form (kyu 2.x's approach), kit 1.5.2.
9. **Review:** with CF-6 at the first project retro on the kit or the next
   kit major; the drill goes when the fingerprint tests catch everything.

**Decided in the same form:** A2-2 revisited — *Captures op de Sources-rij
(K13), /captures verdwijnt*: Almanac drops its own capture store, the
`/v1/debug/capture` path and the Captures page in 4.0.1; the kit's
per-client captures on the Sources row (K13) replace them, FEATURES gets
the dated amendment. D3 — *Wachten op 4.0.1*: CT 112 stays on 3.0.0 (the
ingest keeps working; only the browser dashboard is unusable) until the
4.0.1 install.

## Correction form CF-6 — ratified 2026-09-06 (17:50), all nine fields Klopt

### CF-6 · three faults found live in the release chain — **ratified, measurement open**

1. **What went wrong:** the scaffold wrote the kit git dependency without
   `version` (first remote project red on cargo-deny, run 34028203294);
   `chassis release` refused this PC because `minisign --version` exits 2;
   the migrations lacked `.chassis.toml` (×3), kyu-runner lacked the
   Dockerfile the Release workflow expects, and the migration note claimed
   CT 112's state root was `/opt/almanac` (measured:
   `/appdata/almanac/almanac-config`).
2. **Gate:** each mechanism was proven only in the kit's own environment,
   never where it had to work (rule 35): the generated-project drill never
   ran cargo-deny or a real CI; `chassis release` was dry-run/unit-tested
   only; the migration branches were reported "gates green" without
   `chassis release --dry-run` or a Release run; the CT 112 claim was never
   measured (protocol §5.6a).
3. **Where else:** measured — all three repos lacked `.chassis.toml` (now
   added), kyu's `deny.toml` lacked the git source (fixed in step 2); NOT
   yet measured: kyu-runner's and http-switchboard's deploy files against
   CT 109 — that measurement belongs to V6 before their deploy.
4. **Measure:** (a) the kit's scaffold E2E runs `cargo deny check` on the
   generated project (in CI; skipped locally when absent) — kit 1.5.1;
   (b) `chassis release --dry-run` checks the workflow's preconditions
   (Dockerfile when release.yml builds an image, `.chassis.toml`, a
   Migration heading on a major) — kit 1.5.1; (c) MIGRATION.md §10 closing
   check: dry-run green + one Release run on a test tag before "gates
   green" is reported; (d) deploy files: measure the target's paths first
   (`systemctl cat`, `ls`), then write the unit/stack file.
5. **Cost:** one kit release (~1 h), a few CI minutes for cargo-deny on the
   generated project; two checklist sentences; per migration one dry-run
   and one test tag.
6. **Enforcement:** a/b code (tests, CI); c/d discipline (MIGRATION.md
   checklist), marked as such.
7. **Measurement moment:** the next fresh `chassis new` project with a
   remote — first CI run green at once (a); the next release of one of the
   four projects — the dry-run catches a missing Dockerfile/Migration
   before the tag (b); the next migration/step 2 (http-switchboard) — the
   checklist ticked in that project's PENDING (c, d).
8. **Fallback:** a/b fail → red kit test then fix, CF-6 reopened with the
   case; c/d fail → `chassis sync` refuses a repository without
   `.chassis.toml` and a passed dry-run marker.
9. **Review:** at the retro of the first project built on the kit, or at
   the next kit major, whichever comes first.

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
| kyu 3.0.0 release (kyu's turn) | **released to the signature 2026-09-06 22:50 local**: `.chassis.toml` (CT 109 measured: state root + env file `/appdata/kyu/kyu-config`, vmid 109, no latch), kit 1.4.1 → 1.7.1, scaffold synced, SQL guard + CI-only container smoke in `gates.project.sh` (the smoke's volume moved to the kit image's `/var/lib/kyu` — found by the first kit-CI run), 181 tests, cargo-deny clean; tag `v3.0.0` = `37d4af3`, Release workflow green | Kenny signs; deploy = Homelab Rust (V6) |
| kyu-runner's turn | **done 2026-09-06 23:20 local** (main `01858c3`): kit 1.1.0 → 1.7.1 (69 tests unchanged), `.chassis.toml` with CT 109's measured config dir/token env/vmid 109, scaffold synced, ignore rules under the marker; the E2E's docker fallback now pins the published 2.0.0 kyu image (1.0.0 was never on GHCR — first kit-CI run red); protection = kit checks. 0.2.1 release is form D6 | Kenny: D6 |
| http-switchboard's turn | **done 2026-09-06 23:15 local** (main `461e7e8`): kit 1.1.0 → 1.7.1 (97 tests unchanged), `.chassis.toml` with CT 109's measured config dir/token env/vmid 109, scaffold synced, the real-kyu E2E (`KYU_IMAGE`) as project gate; protection = kit checks. Measured for D1: one live profile (`alertmanager`, kyu → webhook), no inbound `http_path` profile, no `inbound_token` in use — form H1 | Kenny: H1 |
| Almanac step 2 (kit dashboard, V8) | **done 2026-09-06, merged to almanac `main` (`7cb6104`, 4.0.0 unreleased)**: A2-1 kit clients file with the 3.x source tokens imported on first start · A2-2 Journal + Sources sections on `/`, `/sources` and `/captures` project pages, `/dashboard*` redirects · A2-3 captures take any client token, `ALMANAC_CAPTURE_TOKEN` gone · A2-4 4.0.0 with the hard rename `ALMANAC_BOOTSTRAP_TOKEN` → `ALMANAC_TOKEN`. Kenny's deep-dive ruling: every project works like a new `chassis new` project (the kit file is the standard, `ClientStore` the escape hatch). 251 tests; CI needed the login token in the container check. `chassis release 4.0.0` ran to the signature; **v4.0.0 signed by Kenny 2026-09-06 ~17:55**. **Not installed:** it carries the Chrome form fault (CF-7, kit 1.5.0) and the A2-2 captures contradiction; **almanac 4.0.1 (kit 1.5.1, captures per K13) signed by Kenny and installed on CT 112 2026-09-06 16:52 UTC** (D4: Claude renamed the token in CT 112's latch clone via `latch edit` as user almanac — `ALMANAC_TOKEN` in, `ALMANAC_CAPTURE_TOKEN` out, the plaintext working copy shredded; `--check` ok through `latch run` before the swap; `active`, NRestarts=0, `/healthz` 4.0.1, "imported 2 source token(s)"; 3.0.0 kept as `bin/almanac.3.0.0`). Live proof with Chrome's headers: same-origin form → 200, cross-site → 403 as a page, script → 403 JSON. **Open:** the GitHub copy of the secrets (kennypassenier/secrets, project almanac/dev) is behind CT 112's clone until a machine with a PAT runs `latch push` (Kenny); Kenny's half of the CF-7 measurement (log in from Chrome, delete calendar `almanac-test`) | Kenny: CF-7 measurement + latch push |
| http-switchboard's own webhook door (`inbound_token` per path) | **new, from Kenny's rule at the Almanac deep-dive** ("alle vier zoals een nieuw project"): the switchboard still authenticates inbound webhooks with its own per-path token instead of kit client tokens — a step 2 of its own. **D1 answered 2026-09-06: Stap 2 plannen** — inventory of today's webhook senders + its own form; **last** in Kenny's order (chassis-rs → almanac → kyu → kyu-runner → http-switchboard) | after kyu-runner |
| Almanac 3.0.0 on CT 112, first 3.x by hand (V5) | **done 2026-09-06 11:09 UTC**: signed assets verified locally (minisign + SHA256SUMS), binary pushed to `/opt/almanac/bin/almanac`, unit replaced with CT 112's real paths (state root `/appdata/almanac/almanac-config`, `latch run --`, `Type=notify`, `ExecStartPre --check`, `ALMANAC_UPDATE_MODE=supervised`), 2.4.0 unit kept as `almanac.service.2.4.0` and the 2.4.0 binary at `/opt/almanac/almanac`; `--check` ok under the real environment before the switch; after restart `active`, NRestarts=0, `/healthz` `{"status":"ok","version":"3.0.0"}`, profiles loaded (job-tracker), authenticated against Google. One warning to hand to the homelab: `trusted_proxies` is empty while listening on 0.0.0.0. Almanac's own docs corrected to the measured layout (`31b7f49`) | done |

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
| CF-6 | (a) scaffold E2E runs cargo-deny on the generated project, (b) `chassis release --dry-run` checks Dockerfile/`.chassis.toml`/Migration, (c) migration closing check, (d) measure target paths first | (a) first CI run of the next fresh remote project; (b) the next release of kyu/kyu-runner/http-switchboard/almanac; (c, d) http-switchboard's step 2 | **built, kit 1.5.1 released 2026-09-06** (`149d4fa`); **(b) measured 2026-09-06 at kyu 3.0.0**: `chassis release --dry-run` ran before the tag and reported the three checks green; (c, d) measured at kyu-runner's and http-switchboard's turns (paths measured on CT 109 before the deploy files were written); (a) still open until the next fresh remote project |
| CF-8 | Dashboard layout: calendar names instead of ids, ids behind a toggle, one Sources page (S1), the look-drill before dashboard releases; layout affordances (spacing) with kp-themes | the almanac 4.0.2 install on CT 112: Kenny opens the pages from Chrome | **CLOSED 2026-09-06 21:15 (local)** — Kenny on almanac 4.0.2 live: "alles lijkt hier te werken"; Claude's look-drill beforehand on the local 4.0.2 (one Sources in the nav, name + calendar on the issue form, no horizontal scroll) |
| CF-7 | CSRF guard reads `Sec-Fetch-Site` first, `referrer-policy: same-origin`, refusals to navigations render in the layout, browser-fingerprint tests, Chrome drill before dashboard-touching kit releases (TEST_PLAN §5) | the almanac 4.0.1 install on CT 112: Kenny logs in from Chrome and deletes calendar `almanac-test`; Claude measures the same beforehand with the fingerprint tests and the Chrome drill on CT 118 | **CLOSED 2026-09-06 20:40** — Claude's half 16:53 UTC on CT 112 (Chrome-header form → 200, cross-site → 403 page, script → 403 JSON); Kenny's half the same evening: logged in from Chrome on almanac.kp-soft.dev and deleted calendar `almanac-test` |
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

## Kit batch 3 (F1–F8) — forms of 2026-09-06 23:50 and 2026-09-07 (AFK)

**Forms.** F1–F8 weighing (Kenny: F1, F2, F4–F8 Onmisbaar; F3 "meer
info nodig, is dat niks dat homelab zou moeten doen? is dit wel binnen de
scope van dit project? geef voorbeelden"; remark: "kunnen we daar taken
parallel van developen? Ik heb nog veel tokens over"). Deep-dive form:
F3 Later (the homelab's `stacks/<stack>/service.yml` already holds the
measured facts; the read variant is K33), P1 Parallel in worktrees, A1 AFK
Aan, R1 Eigen antwoord "zie ik zelf nog wel" (release timing is Kenny's).

**Groups and branches** (worktrees under `.claude/worktrees/`, all cut
from `main` `04ecbeb`):

| Group | Branch | IDs | Scope |
|---|---|---|---|
| G1 | `kit-f1-testing` | K25 | `chassis::testing` harness behind a `testing` feature; the kit's in-process suites moved onto it |
| G2 | `kit-f4f5-dashboard` | K28, K29 | vocabulary + row/section actions |
| G3 | `kit-f6-clients-cli` | K30 | `chassis clients` subcommand |
| G4 | `kit-f2f7-kit-docs` | K27, K31 | knob docs + `--knobs` + `docs/KIT.md` from sync |
| G5 | `kit-f8-sync-drift` | K32 | sync drift: kit tag, kp_themes, protection checks (`--remote`) |

**Merge order** G1, G5, G4, G3, G2 (least shared files first; G4 and G5
both touch the CLI's `main.rs`, G2 touches the templates alone). Claude
resolves the overlaps, runs the full gates on the merged tree, composes
the CHANGELOG `[Unreleased]` from the groups' reports, then presents one
report form.

**Deliberately not done in this batch:** K33 (Later); the kp-themes
adoption (waits for the kp-themes release — the Unblock item stands);
any release (R1: Kenny decides when 1.8.0 goes out); adoption in the four
projects (rule 7a, their own sessions, after kp-themes).

**Discipline-only measures suspended for the AFK run (rule 7h):** the
"drill a new test red once and note it in a comment" habit is asked of
every subagent in its brief and reported per group; Claude spot-checks it
at merge instead of trusting the report.

**Outcome (2026-09-07, night).** All five groups delivered and went green in
their own CI: G1 `19db404` (K25, 146→155 tests), G2 `b363770` (K28+K29,
146→152), G3 `9d98c70` (K30, 147→158), G4 `ef17738` (K27+K31, 146→153), G5
`884abd7` → rebased `99507d5` (K32, 146→159). Landed on `main` as G5 first
(rebased over the hook fix) and then the stack G1, G4, G3, G2 on
`batch3-merge`; every group's rule-7e drill list is in its commit message or
report and spot-checked at merge. The CHANGELOG `[Unreleased]` and
MIGRATION "1.8.0 additions" were composed from the five reports.

**Live-found during the batch (→ correction form CF-9 at the report):**
1. *GIT_DIR hijack.* Git exports `GIT_DIR` (absolute in a linked worktree)
   and `GIT_INDEX_FILE` to hooks; the pre-commit gate runs the suite that
   runs `chassis new`, whose git children inherited them and committed the
   scaffold onto the committer's branch — four of five worktrees got a
   "Project created with chassis new" commit (all reset with
   `git reset --mixed`, `main` never touched) and one `git init` set
   `core.bare = true` on the shared `.git/config`, which made the main
   checkout unusable until reset. A plain `.git` checkout never showed it.
   Fixed test-first on `main` `e0285a2` (CLI drops the variables for every
   child; both `gates.sh` unset them). **Enforcement changed** (gates.sh) →
   ratification item in the report form (PROCEDURE ground rule L9).
2. *Shared scratchpad.* Five agents wrote bare filenames into one scratchpad
   directory and overwrote each other's commit messages and baselines; two
   agents moved to subdirectories. Brief template fix: a per-agent
   subdirectory.
3. *Refusals on dashboard buttons were invisible* (G2, chassis.js) — shipped
   as a Fixed line; measured by G2 in a browser.
4. *sync ordering* (combined suite): `--write` corrected `kp_themes` after
   rendering `docs/KIT.md` from the stale record, so the next sync drifted
   again; reordered in the G4 cherry-pick (`dcc7fe9`).

**Decisions for the report form:** G5's exit semantics (`sync --write` with
drift it cannot fix, e.g. the kit tag, exits 0 today — exit 1 instead?);
G3's 401-for-wrong-bearer (a behaviour change on admin routes, additive but
visible); G1's `as_browser()` sending Chrome's current headers (the CF-7
`Origin: null` case kept as an override in one test); the unratified extras
each group added (`start_with_env`/`start_open`, `Action::method/busy_label`,
`reveal` verb, `Knob.feature`); the release moment (Kenny's, R1).
