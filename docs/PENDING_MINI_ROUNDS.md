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
(re-raised at the Phase 10 retro and CLOSED there — Dichten in the closing
form, shipped in kit 1.4.0), S9 accepted as known limitation. Kenny's
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
Later/accepted: H7, S6 (raised at the retro and closed there; see §Open items
after Phase 10), S9. H16 waits for Kenny's tag/go per item.

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
| CF-12 | `TestApp` reads token and state directory from the environment the app actually starts with (the `extra_env` overlay wins, as `start_with_env` documents) | The moment kyu adopts the kit version with this fix: kyu's 2.x import scenario drops its hand-written login POST for `TestApp::login()` and is green; Almanac pins `<PREFIX>_TOKEN` instead of reading `app.token()` back. Both report from their own sessions (rule 7a) | **kyu's half measured 2026-09-10** on chassis 2.0.0 (`459d1c0`, released as kyu 3.2.0): their `spawn_kit_in` overrides `KYU_TOKEN`/`KYU_SECRET_KEY` through `extra_env` to prescribe a known key for the 2.x import fixture — exactly the scenario the fix describes. The hand-rolled login POST is gone, `TestApp::login()` is used directly, and `k2_app_tokens_issued_by_2x_keep_working_after_the_import` stays green. **Open on Almanac's half.** |
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

**Report form answered 2026-09-07 (morning):** R1–R7 Akkoord; CF-9.1–9.9 all
Klopt; CF-10 Klopt; E1 Klopt (gates.sh change ratified); CH Goedkeuren;
D1 exit 1 on unresolved drift (built the same morning, red-first, [K32]);
D2 Houden (401 for a wrong Bearer); D3 Houden (`as_browser()` = Chrome's
current headers); D4 Alles houden (the extras stay, recorded as FEATURES
amendments); D5 Opnemen (K34, batch 4); D6 Bij de retro. **AFK off** again.

**CF-9 — CLOSED 2026-09-07.** Field 7's measurement already happened
(three worktree commits after the fix without a stray commit) and the
regression test is in every gate; review at the batch-3 retro (field 9).

**CF-10 — measurement queued:** at the next parallel build, no agent reports
an overwritten scratch file (the brief gives each agent its own subdirectory).

**Retro candidates for this batch (D6, Kenny: at the retro):**
1. `hooks/gates.example.sh` in dev-procedure unsets `GIT_DIR GIT_WORK_TREE
   GIT_INDEX_FILE GIT_PREFIX GIT_COMMON_DIR` after resolving the toplevel
   (CF-9.3: the template has no GIT_DIR handling).
2. A brief template for parallel subagents in worktrees: the GIT_* warning,
   a scratch subdirectory per agent (CF-10), one new module per group in
   shared files, "never touch main", the repository's real number of
   required checks, and "hold your commit until the coordinator says so"
   as a first-class instruction.
3. Rule 37 (absolute `cd`) slipped six times in one night in this session
   (one `git rebase main` in the wrong worktree, one memory note written
   into the dev-procedure repo and removed). A mechanical guard — a
   PreToolUse check that a Bash command starts with `cd /` or `git -C /` —
   is the candidate measure.
4. Rule 7d for worktrees: "a gate proves itself by firing once" should fire
   once FROM A LINKED WORKTREE when a project uses them (CF-9.2).

**Open for chassis-rs after batch 3:** the 1.8.0 release (Kenny's word,
then `scripts/release-kit.sh 1.8.0`); K34 (batch 4); the `Clock` trait of
K25 (open, unrated); the kp-themes adoption (Unblock item); deferred form
items R1 (three turns), D6 (kyu-runner 0.2.1), H1 (http-switchboard door).

## kp-themes 5.0.0 adopted (Unblock clicked 2026-09-09)

Kenny relayed the kp-themes release brief and clicked Unblock. Built the same
morning on `main`: the kit vendors kp-themes 5.0.0 under the package's own
paths (`/static/kp/{css,js,fonts}/`) — 25 themes, `layout.css` +
`utilities.css` (the templates' 28 inline layout styles are gone; two
remain, both CSS anchor positioning), all 25 registers loaded per active
theme by `theme-boot.js`/`chassis.js`, kp-themes' fonts (73 faces, 5 MB),
the six-module JS closure; `js/effects.js` and the minified `dist/` twins
left aside (why: docs/DASHBOARD.md). Stored `topo`/`tazhib`/`nishiki` are
migrated to `forest`/`lapis`/`woodblock` before first paint. Assets without
the `?v=` hash are cached a day, not a year. Confirmations are kp-themes'
native `<dialog>`.

**Browser drill (local inbox, Chromium):** login, status (autogrid cards,
"kp-themes 5.0.0"), the "Clear messages" dialog, theme picker with 25
themes, cyberpunk (Rajdhani / Big Shoulders loaded from `/static/kp/fonts`),
the register list `formal, woodblock, cyberpunk` growing per pick, `topo` →
`forest` on reload, clients page on forest, a client issued, the Delete
dialog; no 404 in the network log. **Live-found:** the client-name `pattern`
invalid under the `v` flag → CF-11 (docs/CORRECTIONS.md), fixed test-first.

**CF-11.7 — MEASURED AND CLOSED 2026-09-10.** The drill happened in the
http-switchboard session on a real 3.0.0 with the dashboard, in Chromium:
logging in through the form, the Recheck button, the Revoke confirmation
dialog and a theme switch to Cyberpunk. Outcome: zero console messages, every
network request 200, no 404 — including the kp-themes fonts under
`/static/kp/fonts/`. The name pattern under the `v` flag does what it should.
Measured by a consumer rather than here, which is the stronger form of the
same check: that project runs the kit's dashboard as a consumer would.

**For the report form:** the live look on CT 118 (rule 39) before the
release-go; the 1.8.0 release now carries batch 3 and kp-themes 5.0.0
together (R1: Kenny's word).

**Report form answered 2026-09-09:** R1 Akkoord (taken), R3 Akkoord (two
asks for kp-themes: a consumer bake asset; a documented per-theme register
loader), L1 Akkoord (Kenny looked at http://10.10.10.18:8080 — nothing
blocks 1.8.0, rule 39 satisfied), CF-11 Klopt (record in
docs/CORRECTIONS.md), D1 Alle fonts houden (73 faces stay in the binary).
R2 came back as a question — "the terminal caret is used on active fields,
isn't it?" — measured (effects.js prototyped locally: `--kp-col` written,
block cell painted; binding only at load, terminal shows a once-per-session
BIOS arrival) and put to Kenny as deep-dive R2-b.

**R2-b (2026-09-09): Opnemen met her-attach.** `js/effects.js` is vendored;
`chassis.js` attaches it at load and once more the first time a caret theme
becomes active (measured: `detach()` keeps its bound fields in a WeakSet, so
detach-and-reattach cannot rebind). Gate test
`vendored_javascript_imports_only_vendored_modules` keeps the seven-module
import graph closed (drilled red once).

**kp-themes' answer to R3, relayed by Kenny:** (1) the release-asset gap is
real (their count 33, ours 36) — the ask stands; (2) `dist/kp-themes.css`, a
release asset, already carries all 25 registers scoped per theme, so a
theme switch needs no loading — the kit had built machinery for a problem
the package solves and does not document; (3) `dist/kp-themes.js` exports
only `attachAll`, which is why a consumer that bakes modules had to pluck
them — not our concern. Measured on our side: the per-theme loader also had
a race (`--kp-caret` unknown at `kp-theme-change` until the register
loaded), which broke R2-b's re-attach.

**D2 (2026-09-09): Bundel dist/kp-themes.css.** The 30 stylesheets are
replaced by the release bundle (1.3 MB, one file, a year cached per hash);
the register loader is gone from `theme-boot.js` and `chassis.js`; the
manifest lists 115 files. Asks for kp-themes now: (a) a consumer bake asset
(or the modules and registers as release assets); (b) document
`dist/kp-themes.css` as the consumer path for the registers; (c)
`detach()` should forget the fields it bound (or the caret binding should
re-evaluate `--kp-caret` on focus), and `effects.js` belongs in
`check-closure.mjs`'s VENDORED list for this consumer.

## Release 1.8.0 (2026-09-09)

Kenny's go in chat after his look at CT 118 (L1 Akkoord, rule 39). Released
through `scripts/release-kit.sh 1.8.0` — tag `v1.8.0` = `b067f65`,
https://github.com/kennypassenier/chassis-rs/releases/tag/v1.8.0. Contents: batch 3 (K25 harness, K27–K32) and
kp-themes 5.0.0 (bundle, fonts, effects.js, dialog confirmations, CF-11 fix,
D1 exit code). Kenny received one adoption prompt for kyu, kyu-runner,
almanac and http-switchboard (their own sessions, rule 7a). Open here: K34
(batch 4), the retro of batch 3, and the kp-themes asks (PENDING §D2).

## Consumer feedback on 1.8.0 (2026-09-09, three sessions)

kyu, Almanac and kyu-runner adopted 1.8.0 the day it was released and each
relayed findings through Kenny. Recorded here so nothing is lost between
sessions; the decisions Kenny took on them are noted per item.

**Landed the same day.** kyu and Almanac independently hit the same
`TestApp` fault (the harness ignored an `extra_env` override of
`<PREFIX>_TOKEN`). Kenny answered D1 **Opnemen** and CF-12 **Klopt**: fix and
two tests on main, record in `docs/CORRECTIONS.md`, measurement queued above.

**Answered 2026-09-09 (evening):** K35, K36, K37 **Onmisbaar**, K38
**Gewenst**, HK5 **Allebei**. Built as milestone L10; the ratings and the
test bars are in `docs/FEATURES.md` §Round 4.

Two things came out of the building that Kenny has not seen yet and that
belong in the batch-4 report form:

- **The clients protocol now has two implementations** (K38). `chassis
  clients` (blocking, in the CLI) and `chassis::admin::AdminApi` (async, in
  the library) both speak the same four routes, and standing rule 7g wants
  one suite driving both. They are driven by two suites today
  (`crates/chassis-cli/tests/clients_cli.rs` and
  `crates/chassis/tests/admin_api.rs`), each against a real service. Making
  the CLI use the library's implementation means giving the CLI an async
  runtime; that is a bigger change than this item was rated for, so it is
  named here rather than done quietly.
- **The live drill found more than the form did** (K35). Generating a
  project and making it headless showed that the door section, the
  "sealed stores" phrase and the pre-update bullet also describe features a
  headless binary lacks — the form only named the dashboard sections and the
  knob table. All of it is now conditional.

- **`chassis sync` does not compare the dev-dependency's kit tag** (found
  while building K34). `drift::kit_dependency` reads `[dependencies].chassis`
  only, and the scaffold now names the kit twice — the dependency and the
  dev-dependency carrying the test harness. A project that bumps one and not
  the other builds against two kit versions and nothing says so. The template
  comment warns; nothing enforces. Unrated: it belongs in the batch-4 report
  as a candidate rather than in this batch.
- **The scaffold E2E now pins the kit tag to the real version** (K34). It used
  `v0.0.0-test`; with the dev-dependency also pointing at the local checkout,
  cargo has to satisfy the version requirement, so the test uses the crate's
  own version. Slight loss of signal, named here: a regression in
  `with_chassis_path` could be masked by the real tag existing on GitHub.

**Originally reported (kept for the retro).** kyu-runner is the
first headless consumer to go through a kit batch (`default-features = false`,
features `core` + `self-update`; measured on the running binary: `/healthz`
200, `/metrics` 200, `/login` 404, `/clients` 404, `/api/clients` 404) and
reported four points; kyu reported one retro question. See the round below.

- **HK1** — generated `docs/KIT.md` is titled "What <project> gets from
  chassis" but describes the whole kit, including a dashboard a headless
  consumer does not build. kyu-runner wrote the disclaimer into its own
  handbook by hand because `chassis sync` overwrites the generated file.
- **HK2** — `--knobs` prints the full table, including dashboard and passkey
  knobs the binary does not carry.
- **HK3** — `docs/MIGRATION.md` tells every project to rebuild
  `tests/common/mod.rs` on `TestApp`; for kyu-runner that was not possible
  (feature `testing` implies `dashboard`, and 45 assertions read the child
  process's log, signal it, or check its exit code). Adopting it literally
  would have cost 29 tests; Kenny decided against it and the reason is fixed
  in kyu-runner's `docs/TEST_PLAN.md`. Measured reassurance from that
  session: the dev-dependency does not leak into the built binary (`/login`
  and `/clients` stayed 404).
- **HK4** — no library equivalent of `chassis clients issue` against an
  *external* service: kyu-runner hand-wrote ~30 lines (POST `/api/clients`,
  then GET the reveal) to get a token from a real kyu hub in its E2E suite.
- **HK5** (kyu, for the batch 3 retro) — a kit migration changes observable
  facts in files the kit does not own (kyu's README still named the
  pre-3.0.0 workflow `release-image.yml`, its runbook still claimed kyu ships
  no self-updating binary, both false since 3.0.0 and undetected for months).
  `chassis sync` only tracks drift in files it renders. Question: does
  `docs/MIGRATION.md` carry a per-version "check these claims in your own
  docs" list, or is that squarely each project's own Phase 8 honesty pass?

kyu-runner also reported what worked: `chassis sync` as a drift detector
(sharp `kp_themes` line, the `gates.sh` fix carried along, second run "in
sync") and `chassis release --dry-run` printing the whole chain with a reason
per step before anything happened.

## Live-found: `update_cmd` drops the unit's own `Environment=` lines (2026-09-09, from Almanac)

Reported by the Almanac session after a real misdiagnosis on CT 112 during
its 4.0.3 rollout, with Kenny's approval to relay it here. Verified in this
repository the same evening, and the finding is WIDER than reported.

`scaffold/deploy/service.yml.tmpl` says in its own comment that `update_cmd`
"reproduces the unit line for line — same user, working directory and
EnvironmentFile". The `systemd-run` invocation sets `--uid`, `--gid`,
`--property=EnvironmentFile` and `--property=WorkingDirectory`, and nothing
else. Meanwhile `scaffold/deploy/service.tmpl` — the kit's OWN unit, the one
every scaffolded project starts from — declares two `Environment=` lines:
`<PREFIX>_STATE_DIR` and `<PREFIX>_TIMEOUT_STOP_SECS`. So the gap is not
limited to projects that added lines of their own: it is in the pair of
templates the scaffold ships.

What it produced on CT 112: `almanac update --check` ran without the state
directory the unit sets, looked for profiles at the binary's compiled-in
default, and failed with "the new version cannot start with this machine's
configuration" and a remedy pointing at a missing secret. No secret was
involved; the diagnosis pointed at the wrong layer entirely. The Homelab
Rust session worked around it in its own copy, Almanac fixed its checked-in
`deploy/service.yml`, and `chassis sync` reported no drift before that fix —
because the template's output was what it expected.

The shape Almanac already runs with (its commit `346ce21`), relayed so the
kit's fix does not diverge from it: one `--property=Environment=KEY=VALUE`
per line the unit declares, in the same order as the unit's own
`Environment=` lines, between `--property=WorkingDirectory=…` and the binary
path. Homelab Rust's workaround on CT 112 is that session's own copy and was
not compared; ask there if the wording matters.

This is a live-found fault in a kit artefact, so it needs a correction form
(rule 29) with the fix beside it: the two `Environment=` lines the unit
template declares must be reproduced as `--property=Environment=…`, and the
comment must stop promising more than the command does. Queued for the next
form; nothing is fixed yet.

## Live-found: every release binary needs a glibc the fleet does not have (2026-09-09, from Homelab Rust)

Reported by the Homelab Rust session after it blocked three rollouts in one
day, and verified here the same evening. It is the more serious of the two
findings that arrived this evening, because it invalidates a frozen decision
rather than a template line.

**What they measured.** Every current release binary of the four consumers —
kyu 3.1.0, kyu-runner 0.2.1, http-switchboard 3.0.0, almanac 4.0.3 — requires
`GLIBC_2.39` (`objdump -T`). CT 109 runs Debian 12 with glibc 2.36, so the
binary does not start there at all: `version 'GLIBC_2.39' not found`, followed
by a restart loop under `Restart=always`; kyu was rolled back to 2.4.1 inside
ninety seconds. Almanac worked only because CT 112 runs Debian 13. The
fleet's golden template is Debian 12, so every container made from it has the
same problem.

**Where it comes from, measured here.** `scaffold/.github/workflows/release.yml`
builds the asset in `rust:<toolchain>-slim-trixie`, and `scaffold/Dockerfile`
does the same. That is decision **T8** in `docs/ARCHITECTURE_DECISIONS.md`
("Release build target"), which chose `x86_64-unknown-linux-gnu on Debian
trixie", said in so many words "not static musl", and justified it with: "every
target environment (T7) runs glibc >= 2.41 anyway".

**That justification is the fault.** It is an assumption about the homelab's
machines that was never measured against the fleet — the exact shape standing
rule 6a forbids (a choice may not rest on an unmeasured assumption about
someone else's system). T7's environment table lists CT 118 (Debian 13) and
the container image; the Debian 12 golden template appears nowhere in it.

**Two things this leaves open regardless of the direction chosen.** No document
of the kit states a minimum glibc as a supportability contract, and the release
asset is named `<name>` with no architecture or libc suffix (AR16 calls the four
asset names a contract), so nothing about the download says what it links
against.

**Three facts that arrived after the first record, and that the mini-round
needs.** All three came back from the Homelab Rust session once it had this
project's measurement:

1. **Debian 12 left ordinary support on 11 July 2026 and is in LTS.** That is
   an argument against pinning the build base to bookworm forever: it buys the
   whole fleet today, and it ties the kit to a base that is already on its way
   out. Whatever is chosen, the decision text says how long the base is meant
   to hold and what triggers moving it.
2. **A partial answer does not fix CT 109.** kyu-runner and http-switchboard
   need no passkeys and could build musl today, as T8's own escape hatch says
   — but the three services share CT 109 and kyu, which does have the door, is
   the reason the container exists. So "musl for the headless ones" leaves the
   blocking case untouched.
3. **The homelab wants a glibc floor it can check against.** That session is
   adding a deploy-side refusal: `objdump -T` on a staged binary before it is
   installed, rather than discovering the mismatch through a restart loop. It
   can only compare against a number the kit publishes. That makes the second
   gap above (no stated minimum, no libc in the asset name) a dependency of
   somebody else's gate, not only a tidiness point.

**Kenny decided (relayed 2026-09-09 by the Homelab Rust session): the whole
fleet moves to Debian 13**, golden template first, then container by
container with his go per container, gateway and media last. That decision is
his and belongs to that project; what it means HERE is that T8's premise
becomes true by making it true rather than by argument. No build change is
needed: no musl, no bookworm base, the templates stay as they are.

**So the mini-round on T8 is about its text, not its templates**, and it has
two jobs:

1. **Say that the premise is a dependency, not a fact.** "Every target
   environment runs glibc >= 2.41" was untrue for about a year and nothing
   noticed. Written as a dependency on the fleet, with what happens when a
   machine falls behind it, it stops being a claim that can quietly rot.
2. **Publish a glibc floor with the release.** The homelab's own task T87
   makes its deploy refuse a staged binary that demands more than the target
   container offers. Without a published floor that check must run `objdump
   -T` and reason for itself; with one it reads what the kit promises. That
   makes the floor a dependency of somebody else's gate. Whether the asset
   name should carry the libc is part of the same round, because AR16 calls
   the four asset names a contract.

**Status: nothing changed here.** T8 is frozen, so this needs a mini-round, and
the direction is Kenny's — he has a form open in the Homelab Rust session with
three of them (static build, older build base, or move the container to Debian
13). Input relayed to that session because it changes the options: T8 rejected
musl for a measured reason, namely that `passkeys` pulls webauthn-rs and with
it OpenSSL, so a static build means vendoring OpenSSL on every release or
dropping passkeys — while a headless consumer (kyu-runner, http-switchboard)
could build musl today. The cheapest kit-side change is the third direction:
`slim-bookworm` instead of `slim-trixie` in two templates, which links against
glibc 2.36 and runs on both Debian 12 and 13 with passkeys intact.

## Two findings from the Homelab Rust session that touch this project (2026-09-09)

Neither is this project's work; both are recorded because they change what a
drill here will see, and because the second is retro material.

- **Security updates were refused fleet-wide, CT 118 included.** The rule
  matched on the archive name, and Debian renames those as a release ages
  (`trixie-security` becomes `stable-security`). That session fixed it in the
  guards that run on every container, matching on the codename instead. CT 118
  has no backlog only because it is new — worth knowing before the next drill
  there reads its update state.
- **A verb built a template because `--help` was read as a positional
  argument** and the fallback to a default turned it into a real build on a
  running host. Measured here for the same shape: this project's CLI parses
  everything through clap, including the `clients` verbs, and its only
  positional is a client name whose absence is refused with a remedy rather
  than defaulted (`chassis clients issue <NAME>`). No instance of the shape in
  this repository. The general lesson — an input nobody parsed being treated
  as consent — is a candidate for the batch 3 retrospective.

## Round 5 — rule 46, the consumer reports and the name Clients (answered 2026-09-10)

Kenny's message of 2026-09-10 brought three things together: standing rule
46 (a shared foundation proves its consumers before a release, guards its
public surface, and lets a new shape stand beside the old for one version),
the four consumer reports, and his own requirement that the kit be plug and
play with **Clients** as the fixed name. Sixteen items went to him in one
form, six of which came back asking for a proper explanation; those were
answered in two follow-up forms with the measurements in them.

**Decided, and what it means here:**

| Item | Decision | What it is |
|---|---|---|
| Batch 4 | Akkoord | Closed with its four deviations as reported. |
| feat-ci-1 | Trigger terugzetten | CI runs on every branch again; landed as `734079f`. The narrowing had locked main shut (measured: zero checks on a branch push, "Required status check … is expected" on the push to main, a dispatched run not counting for main). |
| feat-clients-2 | Onmisbaar | The kit stores the extra client fields itself: in the sealed store, shown as columns, in the API and in `chassis clients`, cleaned up on delete. The hook stays for refusal, not storage. Clients-store format goes up one version. |
| feat-build-1 | Overal statisch | The scaffold builds a static musl binary on a distroless image, with the `ldd` check kyu drilled. Measured first: a static build needs a musl C compiler because `ring` compiles C; passkeys additionally needs OpenSSL built for musl — and **no consumer builds passkeys** (kyu, almanac, http-switchboard use core + self-update + dashboard, kyu-runner core + self-update). So passkeys leaves the scaffold's default feature list, with the reason written down. |
| arch-1 | Allebei | A dated amendment rewrites the premise as a dependency, and the release publishes a glibc floor the homelab's deploy check can read. Note: under feat-build-1 a static binary has no glibc floor, so the two interact — the floor applies to whatever the scaffold still builds against glibc. |
| feat-sync-1 | Onmisbaar | `chassis upgrade <version>` aligns the three places the kit version appears (`.chassis.toml`, the dependency, the dev-dependency), updates cargo and runs the gates. `sync` keeps its hands off Cargo.toml. |
| feat-api-1 | Onmisbaar | A public-surface snapshot in the repository with a check that fails when the code drifts from it without a version bump. Local and in the release script, never at a commit (Kenny's condition). Measured surface today: 194 public functions, 85 structs, 11 enums, 6 traits. |
| feat-api-2 | Gewenst | The transition window, built at the first breaking change rather than now. |
| feat-dep-1 | Eigen registry | Claude investigates what an own registry costs on Kenny's infrastructure and presents it separately; nothing built yet. Measured for the decision: the repository is already public, the package would be 6.9 MiB over 171 files with no secrets in it (the one long hex is a SHA-256 test vector, the release key is public by design), the name `chassis` is taken on crates.io (0.2.0, 5202 downloads), and publishing would not remove the need for the consumer check — it makes it more important, because `cargo update` then moves a consumer without anyone touching the kit line. |
| feat-config-1 | Onmisbaar | The kit hands a project its own part of the config file, table sections included. Today every project writes the same nineteen lines, one of which (`remove("notify")`) rests on knowledge that is written down nowhere. |
| feat-metrics-1 | Onmisbaar | A small counter and gauge in the kit so a project stops formatting Prometheus text by hand; an unescaped label value invalidates the whole scrape, the kit's own metrics included. |
| feat-testing-1 | Onmisbaar | The harness takes the project's assembly as a whole, and ships usable test secrets. http-switchboard's own test setup had forgotten one registration, so its health page saw no subsystem at all. |
| feat-docs-1 | Onmisbaar | The feature chain with its weight in the generated document, and the secrets each feature makes mandatory in the migration guide. |
| ask-1 | Allebei | The badge that breaks "active" across two lines: relayed to kp-themes with the measured selector (`overflow-wrap: anywhere` on `.kp-badge` in their bundle), plus one line here that keeps the state column whole. |
| feat-clients-3 | Laten staan | `Caller` keeps its name; the generated document gains one line saying a client is one of its two shapes. |
| fix-3 | Klopt | Recorded in `docs/CORRECTIONS.md`. The measurement is the first live supervised update on any consumer whose unit declares `Environment=` lines — which is all four, since field 3 was corrected on 2026-09-10. kyu expects to be first: its v3.2.0 release go is with Kenny, and the signed release going to CT 109 is that run. |

**Already built and landed on 2026-09-10 before the decisions came back,
because none of it needed one:** the `update_cmd` fix with its two-file test
(fix-3), and the Clients naming sweep (feat-clients-1) — four sentences on
the clients page, the Revoke confirmation, the login page, two generated
documents, two of the kit's own documents and the CLI's help text said
"caller", which no project's `vocabulary()` could follow. The guard that
should have caught it read only the literal "client" and stripped
attributes, which is exactly where the Revoke confirmation lives; it now
forbids "caller" too and reads every confirmation text.

## ask-1 answered by kp-themes: a knob, not a changed default (2026-09-10)

kp-themes measured the request back and kept their default, which their own
measurement justifies: without `overflow-wrap: anywhere` a badge holding one
unbroken value was 485 px wide in a 360 px viewport and pushed the page
sideways. Both cases are real, so 5.1.0 adds an escape hatch instead of
flipping the default: `.kp-badge` reads `overflow-wrap: var(--kp-badge-wrap,
anywhere)`.

Their instruction for using it, which is better than what this kit does now:
set the property on the COLUMN, not on the badge — custom properties inherit,
and the place that knows its cells hold short labels is the status column, not
the component.

**Not adopted yet, deliberately.** 5.1.0 is committed and pushed in that
project but NOT tagged; the tag waits on Kenny's own verify run. The kit
vendors kp-themes by tag and its manifest gate compares every file against the
release, so adopting before the tag exists would break that gate. Until then
the kit keeps `.state-badge` from `fix(dashboard)` (2026-09-10), which is
scoped to the kit's own five badges and leaves a consumer's badges protected.

When the tag lands: bump `kp_themes` to 5.1.0, re-vendor, replace the
`.state-badge` rule with `--kp-badge-wrap: normal` on the clients table's
state column, and keep the test that pins the state cell does not wrap.

## Left open by the static build, on purpose (2026-09-10)

The scaffold builds static musl now; two things in this repository still build
glibc and were not swept along, because they are the kit's own tooling rather
than what a project ships:

- `scripts/drill-release.sh` builds the `inbox` drill artefact for Debian
  trixie with `pkg-config libssl-dev`. The drill proves the updater, not the
  linkage, and CT 118 runs Debian 13, so it works — but it no longer matches
  what a consumer ships, and a drill that differs from the real artefact is
  the shape standing rule 9 warns about. Decide at the batch-5 report.
- `scripts/check-consumers.sh --image` builds each consumer's container, which
  now means their own Dockerfiles; those are theirs to move, and each project
  does that in its own session when it adopts 1.9.0 (rule 7a).

Also recorded from the build: `drift::KIT_FEATURES` still lists `passkeys` on
purpose. It left the scaffold's DEFAULT list, not the kit; a consumer that
enables it must still be read correctly by `chassis sync`.

## Ready for the retrospective of batch 3 (gathered 2026-09-10)

The candidates are spread over four sections and two files, so they are
listed here once, with what each one still needs. Four are candidates for the
shared procedure, three are this project's own, and three measurements decide
whether a correction can close.

**For the procedure (dev-procedure):**

1. The gates template unsets `GIT_DIR` and its four siblings after resolving
   the toplevel. The template has no such handling, which is how a worktree
   hijacked a commit here (CF-9.3).
2. A brief template for parallel subagents in a worktree: the GIT_* warning,
   one scratch subdirectory per agent, one module per group in a shared file,
   never touch main, the repository's real number of required checks, and
   "hold your commit until the coordinator says so". Three agents ran that way
   on 2026-09-10 and all three reported usable work, so the template has real
   material behind it now.
3. A mechanical guard for standing rule 37: a check that a shell command starts
   with an absolute `cd` or `git -C`. The rule slipped six times in one night
   in this project, and twice more on 2026-09-10 (a subagent worktree landed in
   the wrong repository because the session's own cwd had drifted — the same
   fault one level out, and the strongest argument the candidate has).
4. Rule 7d for worktrees: a gate proves itself by firing once FROM A LINKED
   WORKTREE when a project uses them (CF-9.2).

**This project's own:**

5. HK5's other half: whether a kit migration's effect on a consumer's own
   documents belongs in a per-version list in MIGRATION.md (built) or in each
   project's Phase 8 honesty pass (the question for the retro).
6. kyu-runner's four headless findings, kept as the record of what the first
   headless consumer hit, now that all four are built.
7. "An input nobody parsed treated as consent" — from the Homelab Rust
   session, measured absent from this repository's CLI. Whether it generalises
   is the retro's call.

**Measurements that decide a closure:**

- **CF-11** — closed 2026-09-10 by http-switchboard's drill (above).
- **CF-12** — waits on kyu swapping its hand-written login POST for
  `TestApp::login()` on a kit that carries the fix, and on Almanac pinning
  `<PREFIX>_TOKEN` instead of reading `app.token()` back.
- **fix-3** — waits on the next supervised update on a machine using the
  scaffold's unit and `service.yml` pair.
- Two older ones are recorded here rather than in `docs/CORRECTIONS.md`, which
  is why they are easy to miss at the retro: **CF-10** (the next parallel build
  reports no overwritten scratch file — three agents ran on 2026-09-10 and none
  did, so this can close at the retro) and **CF-6 (a)** (the first CI run of
  the next fresh remote project runs cargo-deny green).

**Not batch 3, keep separate:** CF-6 and CF-7 point at the first retro of a
project built ON the kit, not at this one; the `drill-release.sh` linkage
question is for the batch-5 report; and the "re-raise S6 at the retro" notes
from Phase 7 are stale — it was raised there and closed.

## Retrospective of batch 3 — held 2026-09-10

**The delivery reading Kenny agreed with (m1: Akkoord).** `hooks/delivery-metrics.sh`
over the fleet, 2026-09-10:

| project | released | lead (d) | fix % | repair (h) |
|---|---|---|---|---|
| chassis-rs | 12 | 3 | 8 | 0 |
| kp-themes | 13 | 3 | 15 | 0 |
| almanac | 23 | 7 | 21 | 1 |
| kyu | 14 | 12 | 7 | 0 |
| homelab | 219 | 9 | 10 | 0 |
| latch-rs | 20 | 29 | 35 | 56 |

Twelve releases, a median lead time of three days — the shortest of the
fleet together with kp-themes — an eight percent fix share and no repair
over an hour. What the table does not explain, and what the lessons were
about: three rollouts blocked by an assumption nobody had measured, a
subagent that landed in the wrong repository, and two forms that asked
Kenny to decide something that was not his to decide.

**What went up to the procedure** (the diff on `~/Projects/dev-procedure`):
rule 16a gained its second half (a form holds a real choice), 7d now wants
a gate proven from a worktree, 11b names a foundation upgrade as a moment
the honesty pass runs, 45 refuses an unparsed input instead of defaulting
it, 24a covers every figure in a sentence to Kenny, FORM_PROTOCOL §1.1
forbids splitting or shortening a form, `hooks/check-cwd.sh` makes rule 37
mechanical (14 drills), `hooks/gates.example.sh` drops the inherited git
variables, and `templates/parallel-agent-brief.md` is new.

**Silent rules (l9: Later beslissen).** The four rules with no citation by
number — 16a, 17, 18 and 44 — stay as they are, with no note; the question
returns at the next retrospective.

**Ecosystem entry (e1: Bijwerken).** The chassis-rs entry in ECOSYSTEM.md
had stood at "released 1.3.0, consumers ratified but not released" for five
releases. It now reads 1.8.0 with all four consumers measured on that pin,
the current configuration idiom instead of the withdrawn `knob_keys()` one,
and the two new promises a consumer can build on: the snapshotted public
surface with its release check, and a removed shape that keeps working for
one version.

## kp-themes 5.1.0 vendored — ask-1 closed (2026-09-10)

The knob kp-themes promised at ask-1 shipped in their 5.1.0, announced by
their session with the measurements attached. Adopted the same evening.

**What was verified before anything was copied.** `gh release download
v5.1.0 -p consumer.tar -p SHA256SUMS`, then `tar -xf consumer.tar &&
sha256sum -c --ignore-missing SHA256SUMS` — 92 files, exit 0. The
`--ignore-missing` is not optional: the manifest also names the fonts the
tarball deliberately leaves out, and this kit vendors those.

**What actually moved.** Of the 115 files under `static/kp/`, three:
`dist/kp-themes.css`, `js/effects.js`, `js/theme-registry.js`. The other
112 hash identically to 5.0.0. Every one of the 115 was compared against
the 5.1.0 manifest after the copy, and `KP_THEMES.sha256` was rewritten
from those lines. Our file count differs from the tarball's on purpose —
we take the fonts and leave the minified twins — and their session
confirmed the manifest is per-file, not a list.

**The badge.** `.state-badge` is gone from `chassis.css`, `status.html`
and `clients.html`; `.state-cell { --kp-badge-wrap: normal; }` sits on the
`<dd>` and the `<td>` instead. Three assertions in
`vocabulary_and_actions`, two of them drilled red (dropping `state-cell`,
and putting `state-badge` back).

**Their session also answered our warning about unmeasured time claims**
(CF-13): they searched their own documents for the property and found
nothing — seven uses of "forever" that are guarantees rather than
durations, and one count that already carries its figure.

**A measured figure against D2, from their session.** Five of the package's
thirty stylesheets changed in this release, so a consumer loading per file
re-fetches about 20 kB where this kit re-fetches its whole 1.3 MB bundle —
its content hash moves, and the year-long cache with it. Offered as a number,
not as advice, and D2 stands: the per-file route cost thirty stylesheets plus
a loader, which is what it was abandoned for. Recorded here so a future
reopening of D2 weighs a measurement instead of an estimate.

**Where our count needed a clause.** The first report to their session said
"three of the 115 files changed", which reads as a claim about their release;
five changed in the package. The three are what changed inside what this kit
vendors. Their check was the right one to run — `css/components.css` (which
holds the knob) and `css/themes.css` (which holds the version string) are not
in our tree at all since D2, so there is no 5.0.0 stylesheet being served
beside a 5.1.0 bundle. Confirmed: our `css/` holds only `fonts.css`, and the
knob sits in `dist/kp-themes.css` (hash `2e75416426dd`, twice `--kp-badge-wrap`,
`--kp-themes-version: '5.1.0'`). Same family as CF-13: a number without the
clause that says what it counted.

## Look-drill for 1.9.0 on CT 118 (2026-09-10)

Kenny asked for 1.9.0 on the scratch container so he can look before the
release go (rule 39). Built as inbox 0.1.7 with `scripts/drill-release.sh
0.1.7 --drill-key`, delivered into the container and installed through the
exact `update_cmd` the scaffold promises — including the two
`--property=Environment=` lines fix-3 added. Result: `installed 0.1.7 over
0.1.6`, exit 0, then a restart.

Live: `http://10.10.10.18:8080`, `/healthz` reports
`{"status":"ok","version":"0.1.7","subsystems":{"store":{"detail":"writable","ok":true}}}`.
Claude's own look-drill first: the login page renders 200, the vendored
kp-themes 5.1.0 bundle is served at `?v=01ba11a88e8b58cd` with
`cache-control: public, max-age=31536000, immutable`, and `state-badge`
appears zero times.

**Why the drill build is glibc and not the static musl 1.9.0 ships.** The
example enables `passkeys`, and `cargo tree -p chassis --features passkeys -i
openssl-sys` confirms the chain `webauthn-rs → webauthn-rs-core →
webauthn-attestation-ca → openssl → openssl-sys`. That is exactly what the
frozen build-target decision already says, and what the release workflow's own
refusal message names. So today's drill matches what this service would
actually ship. The open item narrows rather than closes: `drill-release.sh`
builds glibc unconditionally, where it should follow the target's features —
a passkeys-free service would get a glibc drill of a musl release. Still
deferred to the batch-5 report.

**To undo the drill wiring** when the look is over: `systemctl stop
drill-serve` in the container, restore `/etc/inbox/inbox.env` from
`inbox.env.pre-drill-0.1.7`, restart.

## Kenny's verdict on the 1.9.0 look-drill (2026-09-10)

**"Alles lijkt te werken … voor zover ik kan zien is de test geslaagd."** The
live look on CT 118 (inbox 0.1.7, http://10.10.10.18:8080) is the rule-39
half that precedes a release go.

Three working points, explicitly **not** to be acted on now — they go into the
next development round as `feat-clients-4`, `feat-clients-5` and `feat-ui-1`
in docs/FEATURES.md §Round 6:

1. The Clients table is too wide and its rows too tall, because two columns
   each hold several buttons that wrap. Kenny's own proposal: keep Name,
   Issued, Last used, State and the declared columns, add one unlabelled
   column with a single button that opens a modal, and put everything else in
   that modal laid out as a form. Claude builds a mockup of the modal first;
   if kp-themes' components are not enough, that project is asked for what is
   missing.
2. Clicking `Send test` re-flows the row while the button is busy. A control
   reporting that it works may not move the layout around it.
3. Timestamps render as `2026-09-10T02:16:47Z`. They must follow the browser
   locale, with date and time as separate readable parts. The house-wide half
   is queued in dev-procedure's IMPROVEMENTS_QUEUE.md, because a search found
   date formatting written down nowhere — not here, not in the procedure, not
   in ECOSYSTEM.md's norms.

## Round 6 built (2026-09-10)

Kenny chose to build the three working points from his look before releasing
1.9.0, and approved the modal's shape and its scrolling body from a mockup
before any code was written.

- **feat-ui-1** — `shell::time::human_time` plus the `human_time` filter and
  `localiseTimes()` in chassis.js. Six render sites. The gate reads the page
  the way a reader does (`visible_text` strips the `datetime` attribute) and
  was made to fail first by rendering `{{ c.issued_at }}` without the filter,
  which reported `2026-09-10T02:42:50Z`.
- **feat-clients-5** — `pinWidth`/`unpinWidth` around every label change.
  Browser behaviour with no gate that can see it; the proof is the next look
  on CT 118. One case it deliberately does not hold: a refusal flashes a whole
  remedy sentence and is wider than any rest label, and narrowing it would
  hide the remedy.
- **feat-clients-4** — one button per row, everything else in a
  `<dialog class="kp-dialog client-dialog">` per row. Two things worth
  remembering: `display` on a dialog belongs to the browser, so the flex
  column is scoped to `[open]` or the dialog lays itself out while closed;
  and `min-height: 0` on the body is what lets it scroll instead of pushing
  the foot off-screen. The gate counts buttons inside `<tbody>` — the
  assertion that survives a project registering its own actions — and was
  made to fail twice.

Landed as `42735fe` and `9bc432f`, CI green. Built as inbox 0.1.7 → 0.1.8 in
`dist/drill-0.1.8`, signed with the drill key; **not installed**: standing
rule 13c (new, same evening) makes a write to a machine outside this
repository a per-occasion permission, so the install waits on a form.

## Round 6 proefdraaien on CT 118 (2026-09-10)

Asked and given per standing rule 13c, which was written the same evening:
the form named the machine and everything that would change on it. Nothing
outside that list was touched.

Installed through the `update_cmd` the scaffold promises, including the two
`--property=Environment=` lines fix-3 added: `inbox: installed 0.1.8 over
0.1.7; restart to run it`, exit 0. After the restart, `--healthcheck` reports
`alive=true status=ok version=0.1.8`. The previous binary sits beside it as
`inbox.prev`. The helper server inside the container was restarted to serve
`/tmp/drill-0.1.8`; the update URL and the trusted key are unchanged.

Claude's own check on the live page before handing it over: five column
headings (Name, Issued, Last used, State, Messages), exactly one button
inside `<tbody>`, `<dialog class="kp-dialog client-dialog">` present, the
token carrying `class="secret token-line"`, dates rendering as
`2026-09-05 07:56`, and no RFC 3339 string anywhere in the visible text.

What only Kenny can judge, because no test here can see it: that the row no
longer changes shape while `Send test` is working, and that revealing the
token moves nothing beside it (feat-clients-5, feat-clients-4).

## CF-14 closed, and the modal's width (2026-09-10)

**CF-14's measurement, Claude's half, is done.** On the live 0.1.9 on CT 118,
wrapping `document.execCommand` reported `activeTag: TEXTAREA`,
`inDialog: true`, `selLen: 64` (a client token is 64 hex characters) and
`returned: true`, where 0.1.8 in the same probe reported `BODY`,
`inDialog: false` and an empty selection while still returning true. The
browser tooling separately noticed that the page had written to the OS
clipboard, which is the half no session can read for itself.

**The width took two goes, and the second one taught the better lesson.**
0.1.9 set `width: min(42rem, …)` and changed nothing on screen.
`getComputedStyle` on the open dialog reported `width: 512px` and
`max-width: 512px` where the rule asked for 672 — a width above a lower
max-width is a rule that looks applied and is not. 0.1.10 added the matching
`max-width` and measured 672px, viewport 1280.

Then the honest check on a claim made along the way. Both the commit message
and the form said "kp-themes caps `.kp-dialog` at 512px", which was never
measured. `Gezocht met:`
`grep -o '[^{};]*max-width:[^;}]*32rem[^;}]*' crates/chassis/static/kp/dist/kp-themes.css`
— and what it actually writes is
`max-width: var(--kp-dialog-max-width, min(32rem, calc(100vw - 2rem)))`. So
32rem is a **default behind a knob**, exactly like `--kp-badge-wrap` from
ask-1, and not a cap. Setting the knob is the right move; overriding their
`max-width` works but would stop working the day they compose that property
differently. `chassis.css` now sets `--kp-dialog-max-width`.

Same family as CF-13: a figure asserted without the command that produced it.
The number was right, the sentence around it was not.

CT 118 runs 0.1.10, which already renders at 672px. The knob change makes no
visible difference, so it rides along to the next install rather than costing
another permission round.

## The example now shows what round 5 built (2026-09-10)

`examples/inbox` is what a new project copies from, and it used neither of the
two facilities round 5 added for exactly that reader. Measured before writing:
`grep -c 'Counter\|Gauge\|client_form_field' examples/inbox/src/main.rs` was 0.

It now declares a `topic` field — the kit stores it, renders it as a column
and returns it from the API, and `on_client_issued` refuses an empty one with
`Error::invalid` (a 400, not the 503 a `config` error gives, because a blank
form field is the caller's input rather than this service's configuration).
And it registers a `Counter` for messages accepted, labelled by the client
name the admin chose so the label set cannot grow without bound, plus a
`Gauge` that follows the Clear button back down where the counter does not.

Proven by `the_declared_field_and_the_project_series_are_what_a_consumer_sees`,
made to fail first twice: `on_client_issued` returning `Ok(())` turned the 400
into a 201, and dropping the gauge update left it at 1 after a clear.

Landed as `e1769db`, CI green. Remaining on the open list: `drill-release.sh`
choosing its target by feature rather than always glibc (deferred to the
batch-5 report; for this example glibc is the correct build because
`passkeys` pulls OpenSSL), and the four measurements that wait on the consumer
sessions — CF-12, fix-3, CF-6(a) and CF-10.

## kyu adopted 2.0.0 — what its report measures (2026-09-10)

kyu took chassis 2.0.0 (`459d1c0`, released as kyu 3.2.0) and reported from
its own session, which closes half of one open measurement and adds an
instance to another.

**CF-12, kyu's half: measured.** Their harness had precisely the shape the fix
describes — `spawn_kit_in` overrides `KYU_TOKEN` and `KYU_SECRET_KEY` through
`extra_env` so the 2.x import fixture can be written with a known key. Before
the fix they had to hand-roll a login POST; that is gone and `TestApp::login()`
is used directly, with `k2_app_tokens_issued_by_2x_keep_working_after_the_import`
still green. Almanac's half — pinning `<PREFIX>_TOKEN` rather than reading
`app.token()` back — is still open.

**fix-3: a fourth instance, and a gap in its own field 3.** That correction
searched the property "two templates that together describe one machine, never
compared with each other" and answered that http-switchboard and Almanac
confirmed the shape in their checkouts. kyu was not in that answer, and kyu had
it too: `deploy/kyu.service` had been setting
`Environment=KYU_STATE_DIR=/appdata/kyu/kyu-config` and
`Environment=KYU_TIMEOUT_STOP_SECS=60` while its `service.yml`'s `update_cmd`
carried neither. The search had looked inside this repository for a second pair
of scaffold files; it never asked each consumer whether its own unit declared
`Environment=` lines. That is the honest reading: the property was right and
the search was narrower than the property.

`chassis sync --write` corrected it for them. The formal measurement stays
open, because kyu verified that the generated `--property=Environment=` lines
match what the unit already said — a file comparison, not a live supervised
update. Almanac and http-switchboard remain the named reporters.

**Two things that needed nothing from here.** `chassis sync --write` also took
kyu's own musl/distroless release pipeline back into the kit's templates, so
the Dockerfile, `release.yml` and `rust-toolchain.toml` are kit-owned again and
kyu carries no copy; 184 tests green and the container smoke green against the
new scaffold image. And the CI template triggers on every branch push again,
which is what kyu needed — a narrowed trigger there had forced a pull request
for a one-line change because branch protection had no check to wait for. That
is feat-ci-1 doing what Kenny decided it should.

## What the contract writes down: place or name (answered 2026-09-10)

The judge reads a line as the path that *declares* an item, so moving
`chassis::shell::time::now_rfc3339` to `chassis::core::time::now_rfc3339`
without touching the function reads as a removal plus an addition. Measured
before asking: rewriting every `chassis::shell::time::…` path in a copy of the
contract and judging it as a minor refused four lines as "gone or changed",
while `crates/chassis/src/lib.rs` re-exports 7 names at the crate root — which
is what a consumer actually writes.

**Kenny, 2026-09-10: Oppervlak versmallen bij de volgende major.** The contract
keeps reading declaration paths; the refusal is strict but not untrue, because
those long paths really are nameable today. What changes is the surface, at the
next major, not the reading of it.

**Candidate for 3.0.0 — make the internal modules private.** `pub mod core` and
`pub mod shell` are public because the kit grew that way, not because a service
was meant to reach through them: the crate doc already says "a service normally
needs neither directly". Narrowing them to `pub(crate)` and keeping the
crate-root re-exports as the only public path would take those 823 recorded
items down to what the seven `pub use` lines and the public modules expose —
after which a refactor inside `shell` moves nothing a consumer can name, and
the question dissolves instead of being answered by a looser judge.

Not started, on purpose: doing it now would itself be the breaking change it is
meant to prevent. It is written here so the next major picks it up, with the
measurement to repeat first — count what the four consumers import through
`chassis::core::` and `chassis::shell::` before deciding how far to narrow.

## feat-api-2 built, because its trigger fired (2026-09-10)

↳ feat-api-2 = the transition window: a replaced shape stands beside the new
one with a deprecation marker, a list of what goes when, and a check that the
list and the code agree.

It was rated **Gewenst** in round 5 with a trigger instead of a place in the
queue — "built at the first breaking change, not before" — and 2.0.0 was that
change. Half of it shipped with the release (the `#[deprecated]` marker on
`ClientsFile::issue`); the list and its check were still missing, so nothing
held the promise the marker makes. Built now rather than queued, because the
rating was the decision and the trigger had already fired.

Two things it found while being built, both in the released 2.0.0:

- the marker said `since = "1.9.0"`, a version that never existed — the chain
  refused it as a mislabelled minor and it went out as 2.0.0;
- its doc comment promised removal "in the version after the one that
  introduces `issue_with_fields`", which the frozen contract forbids. A
  deprecated item can only go at the next major. `docs/REMOVALS.md` now says
  3.0.0 and the check refuses a `Goes at` naming a minor.

Landed as `b9ce464`, CI green. Nothing here waits on Kenny.

## Blocked on the consumer reports, by choice (2026-09-10)

Asked at the end of the evening: open batch 5 now, or wait. **Kenny: wachten op
de rapporten.** The session is renamed `🏗️ chassis-rs - BLOCKED BY 📬 kyu` and
carries one standing form whose single button resumes the work.

What is awaited, and why waiting is not idleness:

- **fix-3's measurement** — the first live supervised update on a consumer whose
  unit declares `Environment=` lines. kyu is first in line: their v3.2.0 release
  go is with Kenny, and the signed release reaching CT 109 is that run.
- **CF-12's other half** — Almanac pinning `<PREFIX>_TOKEN` instead of reading
  `app.token()` back. kyu's half is measured.
- **The count batch 5 needs.** Narrowing the public surface for 3.0.0 is the
  heaviest candidate in the queue, and how far it can go depends on what the
  four consumers actually import through `chassis::core::` and
  `chassis::shell::`. That count lives in their repositories, not this one, so
  opening the round first would rest the decision on an assumption about
  someone else's system — the shape rule 6a exists to refuse.

The other two candidates stay where they are: `scripts/drill-release.sh`
choosing glibc unconditionally where it should follow the target's features,
and the trigger that would reverse feat-dep-1.

Nothing in the kit is half-finished at this point: main is green, the contract
reports 823 items unchanged, and the transition window has its list and its
check.

## kyu-runner's adoption report, and what it found (2026-09-10)

kyu-runner took 2.0.0 and reported from its own session. `App::project_config`,
`Counter` and `AdminApi` each removed hand-written code there, the static musl
build took the glibc question out of their deployment, 69 tests green with no
change to the suite. Two faults came with it, both built here the same evening
because neither needed a decision.

**fix-4 / CF-16 — the scaffold wrote over a hook another source owns.** Three
files are distributed by dev-procedure's `sync-hooks.sh` as well, and the kit's
copies were a generation behind, so `chassis sync` proposed replacing the
canonical hooks with older ones every run and kyu-runner restored them by hand
each time. They are project-owned in the scaffold now: written once at
`chassis new`, reported but never rewritten after that.

**fix-5 / CF-17 — a release waited for checks that could not start.**
`chassis release` pushes `release-<version>` and waits for its checks;
kyu-runner's workflow only triggered on `main`, so nothing ever appeared and
the wait ran to its 1800-second timeout. `check_release_files` now reads the
workflow before anything is pushed.

**One thing in their report needed correcting, and they should hear it.** They
listed `.github/workflows/ci.yml` beside the two hooks as a file where the
scaffold is behind. Measured here: `scaffold/.github/workflows/ci.yml` line 9
reads `branches: ["**"]`, which is the current shape — feat-ci-1 restored it on
2026-09-10. In that diff the kit was ahead and their project behind, which is
also why their release found no checks. Taking the kit's workflow is the fix
for their second finding.

**Two measurements queued, both on the next consumer to reach them:** the first
`chassis sync` run after a hook generation moves (the three files appear as `~`
lines and the exit code stays 0), and the first `chassis release` run on a
project whose CI does not cover the release branch (the refusal arrives before
the push, with its remedy).

## kyu-runner's second message: the measurements need a tag (2026-09-10)

They confirmed the correction about the diff direction and named the reading
error precisely: the sync header is `--- <path> (project)` / `+++ <path>
(scaffold)`, so minus is the project and plus is the kit. At the two hooks the
minus line carried `# HOOK_VERSION=3`, which meant the scaffold would remove
it — the kit was behind there. At `ci.yml` the same direction read the other
way round, and they had generalised from the hooks without checking the third
file. Their own correction form carries the measure; the consequence landed
here as fix-5's scenario an hour later.

**What they measured about this kit's fixes: they cannot reach anyone yet.**
`chassis --version` says 2.0.0 there and `.chassis.toml` pins
`chassis_tag = "v2.0.0"`, while fix-4 and fix-5 sit on main at `9bc5202`. So
both queued measurements wait on a tag, and CF-16 and CF-17's field 7 now says
so. Whether that tag happens now is Kenny's call.

**And they found a hole in fix-4 by asking one honest question.** They could
not confirm that `check-ids.sh` reaches them, because kyu-runner was migrated
rather than generated and never runs `chassis new`. Measured here: a
project-owned file that is *absent* was skipped by `sync` exactly like one that
differs, so the file would never have arrived — and the canonical `commit-msg`
only warns when it is missing, which is the fail-open shape rule 12 forbids.
`sync` now writes a project-owned file that is missing and still refuses to
overwrite one that exists. kyu-runner measured the other half of that answer
straight away: they do hold `check-ids.sh` (4095 bytes), carried in by hand by
the session that took their hooks to generation 3, and their `commit-msg`
calls it with `|| exit 1` — so the gate runs there and the warning branch only
covers a file that is absent. The fix is not redundant; it closes the case that
handwork happened to cover, and the half they can report is the other one. Drilled by deleting `.githooks/check-ids.sh` from a
freshly generated project: exit 1, `--write` puts it back, and a hook with
different content is left untouched.

## CF-16 and CF-17 ratified (2026-09-10)

Kenny answered **Klopt** on both, so the two measures stand as they were
built and landed: the three shared hooks are project-owned in the scaffold
(written when absent, never written over), and `chassis release` reads the
project's CI workflow before it pushes anything.

Both loops stay open, and both wait on the same thing — a tag. The measures
are on main; a consumer runs what was released. The measurements, restated so
each names a reporter that can actually produce it:

- **CF-16, the leaving-alone half:** kyu-runner, at their next bump. Expected:
  `commit-msg` and `check-commit.sh` come back as `~` lines with exit 0, where
  today they are diffs with exit 1.
- **CF-16, the writing-when-absent half:** a migrated project that does not
  carry `check-ids.sh`. kyu-runner cannot show it — theirs was brought in by
  hand on 2026-09-09.
- **CF-17:** the first `chassis release` on a project whose CI does not cover
  the release branch. kyu-runner is that project today, unless the trigger is
  restored there first; either way their report says which of the two it
  became.

Review of both measures: at the retrospective of batch 4.

## 2.0.1 released (2026-09-10)

Kenny's go carried a condition: *"enkel als er daarna geen frictie meer
verwacht wordt met de vier zuster/dochterprojecten, ik wil eindelijk iets
releasen dat werkt!"* So the friction was measured instead of argued.

| What was checked | How | Result |
|---|---|---|
| Do the four still build and pass? | `scripts/check-consumers.sh` against this tree | 4 of 4 source ok |
| Will fix-5 refuse anyone's next release? | read each `.github/workflows/ci.yml` `on:` block | 4 of 4 trigger on `["**"]` — nobody is refused |
| Does fix-4 change anything they rely on? | `# HOOK_VERSION=` of the three files per project | 4 of 4 already on generation 3, so the kit only stops proposing a downgrade |
| Do the live sessions agree? | asked kyu-runner and http-switchboard directly | both: no friction, go ahead |

Two things came back that were worth more than a yes. kyu-runner had restored
their CI trigger to every branch twenty minutes earlier (their `416b84d`), so
the scenario fix-5 was built for no longer exists there — they can measure the
release chain running through, not the refusal. And http-switchboard reported
that `chassis sync` had rewritten two of their hooks to the older generation on
the 2.0.0 jump, which they restored by hand: the same fault as kyu-runner's,
in a second project, found after the fix was already built.

Released as tag `v2.0.1` = `5dc8d80` through `scripts/release-kit.sh`, checks
green before the tag.

## http-switchboard's report, and the defect that was ours (2026-09-10)

Their "before" measurement of fix-4, taken with CLI 2.0.0 in their own
checkout: all three shared hooks present at generation 3, `chassis sync`
reporting `commit-msg` and `check-commit.sh` as full diffs with exit 1, and
`check-ids.sh` not mentioned at all because the scaffold did not know it. That
is exactly the state fix-4 removes; the "after" half waits on their CLI being
updated, which is a change to Kenny's machine and therefore their question to
him, not ours.

They also sharpened one thing the tests had better cover: on the 2.0.0 sync,
`sync --write` did not only report those two files, it **wrote** the older
generation over them, and they restored it with `git checkout`. The end-to-end
test covers that case directly — it calls sync with `write = true` on a shared
hook holding its own content and asserts the bytes are unchanged.

**And the nameless defect they reported was ours** (CF-18). Twice today their
`Cargo.lock` lost the `source = "git+…"` line for the `chassis` package, and
five candidates they tried reproduced nothing. It was
`scripts/check-consumers.sh`: the `--config patch…` override resolves the kit
to a local path, so cargo rewrites the lockfile in the consumer's own tree.
Measured before repairing: kyu, almanac and kyu-runner each carried exactly
that one deleted line; http-switchboard was clean only because they had
already restored it. Twice is the number of runs today — one direct, one
inside the release script. The three trees are restored, the script now saves
and restores every lockfile in a trap, and the run after the fix leaves all
four at zero changes.

Two more things they measured that belong here: their 3.1.0 release asset is
`static-pie linked` with zero glibc symbols, so feat-build-1 does what it
promised and the glibc blockage on CT 109 is gone; and their split gates ran
the release tier before the tag existed, which is the shape CF-6 asked for.

## Branch protection relaxed, and the hooks settled (2026-09-10)

**Kenny: "Beheerders erlangs laten."** `enforce_admins` is off in all five
repositories; the required check (`fmt · clippy · tests`) stays, and
force-pushing or deleting main stays blocked. Measured before the change: 4 red
CI runs out of 248 in chassis-rs, all on 5 and 6 September, none in the last
hundred; 798 runs and 107 red across the five, of which almanac has 85 — with
the honest caveat that it is not measured how many of those the local gate
would have caught. The kit was taught the same expectation, so
`chassis sync --protect` does not put it back and a repository that still
forces admins to wait now reads as drift.

**And the hooks are settled, on bytes rather than on a stamp.** Kenny's
question was whether there is consensus across all five. There was not, and
the tool said there was: `sync-hooks.sh --check` compared only the
`# HOOK_VERSION=` line, so every project reported "up to date (3)" while its
`check-ids.sh` was fifteen lines shorter than the canonical file, which had
gained a fix that morning. The check compares content now and names the file
that differs.

The five were converted with the tool, which is what rule 7a prescribes for a
shared fix, and are byte-identical to canonical. Each of the four sister
projects has one uncommitted file, `.githooks/check-ids.sh`, for its own
session to commit — this session does not commit in their repositories.
Outside the five, ten more projects carry the same older copy and latch-rs
carries no stamped hooks at all; measured, reported, not touched.

## 2.0.2 released, and a gap the homelab found (2026-09-10)

**Released**: tag `v2.0.2` = `ce7e17e`. It carries the branch-protection
expectation — `enforce_admins` off, the one required check kept, force-push
and deletion still blocked — so a consumer running `chassis sync --protect`
stops undoing Kenny's decision of that evening, plus fix-6. Kenny's
"voorlopig laatste release" before the four adopt, release themselves, and the
homelab rolls out. CT 118 keeps its drill wiring at his choice.

**Open, and it belongs to two projects at once.** The Homelab Rust session
reported that `kyu-alert` and `kyu-backup` appear in no stack file: a service
that ships helper units hands them to a homelab that does not know they exist.
Measured here, because the same shape is in the kit's own scaffold:

| Project | Units in `deploy/` | `service.yml` declares |
|---|---|---|
| kyu | `kyu.service`, `kyu-alert@.service`, `kyu-backup.service`, `kyu-backup.timer` | `kyu` |
| almanac | `almanac.service`, `almanac-latch.service` | `almanac` |
| http-switchboard | `http-switchboard.service` | `http-switchboard` |
| kyu-runner | `kyu-runner.service` | `kyu-runner` |

`scaffold/deploy/service.yml.tmpl` has exactly one `unit:` field, and the
scaffold itself writes a second unit whenever `latch` is on. So the kit ships
the fault it is being told about.

It cannot be closed from here alone: a field in the stack file is only worth
writing when `homelab adopt` reads it, which is the homelab's half (rule 7a).
Queued for the batch-5 round, with the measurement above as its starting point.
## CF-16's measurement is in — from http-switchboard (2026-09-10)

Recorded at Kenny's instruction, with nothing acted on yet.

Their report after taking the new CLI: `chassis sync` **does not mention the
three shared hooks at all** — not as drift, not as a `~` line — where that same
sync showed a full diff on `commit-msg` and `check-commit.sh` and ended on exit
1 earlier the same afternoon.

That is a better outcome than field 7 predicted, and the mechanism explains
why. The prediction was `~` lines with exit 0, which is what a project-owned
file produces when it *differs*. Since 2.0.1 the scaffold carries the canonical
bytes, and their copies are the canonical bytes, so the comparison matches
before ownership is ever consulted and nothing is printed. A `~` line would now
mean a project that deliberately keeps its own version — which is the case the
ownership rule exists for, and not the case here.

Still drifting there, by design: `.github/workflows/ci.yml`, where they run one
job and the scaffold writes four. That is their decision about what belongs in
CI, recorded earlier, and it stays.

What this leaves open: the writing-when-absent half of fix-4 (needs a migrated
project that lacks `check-ids.sh`; http-switchboard and kyu-runner both carry
it), CF-17 at a consumer's next `chassis release`, CF-12's Almanac half, and
fix-3 when the supervised update on CT 109 fires.

## Both measurements delivered on a real bump — kyu-runner (2026-09-10)

kyu-runner took 2.0.2 (`ccefa5f` on their main, CI green, 69 tests green) and
reported the two loops from the bump itself.

**CF-16 — measured, and closed on this half.** The three shared hooks do not
appear in `chassis sync`'s output at all: no diff, no `~` line. On 2.0.0 they
were three diffs that session had to restore by hand after every `--write` to
keep Kenny's decision standing. Same result as http-switchboard's report, and
the same mechanism: the scaffold now carries the canonical bytes, so a project
holding those bytes matches before ownership is consulted. The
writing-when-absent half stays open and needs a migrated project that lacks
`check-ids.sh` — kyu-runner carries it, and the file this session left in their
tree went in with `ccefa5f`.

**CF-17 — the precondition runs and passes.** `chassis release 0.2.3 --dry-run`
now opens with `checked: .chassis.toml present · CI runs on a push to the
release branch · Dockerfile present where release.yml builds an image ·
Migration section on a major`. The second clause is fix-5. It passes there
because the CI trigger was restored that evening (`416b84d`), and the proof it
carries through: `ccefa5f` went straight to main without a pull request, where
0.2.2 had needed two.

That closes CF-17 as far as any consumer can close it. The refusal-with-remedy
has no reporter left — all four now trigger CI on every branch — so what stands
behind it is the five unit tests over the reader plus this live confirmation
that the check exists, runs and prints its verdict before anything is pushed.
Waiting for a live refusal would mean waiting for a project to break its own CI
first.

**One finding worth a round, not worth tonight.** `chassis sync` exits 1 there
for exactly one reason now: `.github/workflows/ci.yml`, where they run one job
and the scaffold writes four — their deliberate choice, recorded earlier. So a
project that deliberately keeps a kit-owned file different can never reach exit
0 again without `--force`. The exit code conflates "the kit's file drifted, fix
it" with "this project decided otherwise". The seven hook files got the
ownership mechanism; nothing expresses the same thing for a kit-owned file a
project overrides on purpose. Queued for the batch-5 round.

**For the retrospective**, in their words: what helped most was not a repair but
that `--dry-run` prints its preconditions on the first line — the new check
could be seen to exist *and* pass without running a release to find out.

## The release chain ran end to end at a consumer (2026-09-10)

kyu-runner ran `chassis release 0.2.3` on the released CLI and reported every
step. It stops at the signature and nowhere else:

    pushed 3da7cd78 as release-0.2.3; waiting for its checks
    tagged v0.2.3; waiting for the Release workflow
    scripts/sign-release.sh v0.2.3 failed: Password: get_password().
      What now: read the message above; nothing after this step ran

Exit 1, and the right one: the minisign key is Kenny's, so that is where a
consumer's chain has to end. The assets are `kyu-runner` and `SHA256SUMS`
without `.minisig` and `VERSION`, so the updater ignores that release until he
signs — a safe intermediate state rather than half a rollout.

What makes this the measurement and not just a green run: at 0.2.2 the same
chain hung on "waiting for its checks" because a branch push produced no run at
all. This time `gh run list --branch release-0.2.3` shows a run with event
`push` on the release commit. The chain waited for something that actually came,
fast-forwarded main without a pull request, tagged, waited out the Release
workflow, and stopped at the signature.

So CF-17's dossier holds the full path from precondition to signature. Only the
refusal branch stays unproven live, and it has no reporter left.

**Their design proposal for the exit-code finding**, which is better than
"make the difference go away": what a project needs is not that the deviation
disappears but that it can be *declared* — a line in `.chassis.toml` saying
this file deliberately differs, so `sync` reports it as a `~` and not as a
fault. The exit code then keeps meaning the one thing it should: a kit-owned
file drifted without anyone deciding it. Queued with the finding for batch 5.
