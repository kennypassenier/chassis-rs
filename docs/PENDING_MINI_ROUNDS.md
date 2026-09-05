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
GitHub release created with `gh` (A5 was the go). Consumers pin
`tag = "v1.0.0"`; `chassis new` defaults to it. Not part of this release:
a signed service binary (the kit is a library; services sign their own
releases with Kenny's key), the passkey live test (A4), the homelab's
broken-after-ready re-run (their binary).

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
| CF-3 | After an autonomous rollback the same version is never reinstalled (skip list in the state root) | The first autonomous-mode drill after the fix on CT 118: install → crash → revert → the next check reports `Held` ("rolled back earlier"), zero further restarts in the following interval | **measured 2026-09-05 14:21 UTC on CT 118: one install/crash/revert, then Held twice across the next interval, NRestarts=3 — loop closed; correction form for Kenny's Klopt below** |
| CF-2 | Text read on its own (consequence lines, pill labels, card subtitles) describes actions as "Claude doet…" / "Kenny doet…" — never a bare ik/jij | The Phase 7 hardening form of this project: Claude counts bare pronouns in those surfaces AFTER writing it by habit and BEFORE sending, reports the raw count, then fixes; Kenny finds none | **measured 2026-09-05 at the Phase 7 form: 26 consequence boxes, 104 pills, raw count = 1 bare "jij" (H17), fixed before sending.** Field 8 (fallback) therefore applies: from now on every form of this project is written to a file, run through the pronoun/coinage/gloss count and rendered only at 0 (the lint), and consequence lines start with Claude / Kenny / an article. Kenny's own reading of the Phase 7 form is the second half of the measurement. |

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

### CF-3 · correction form (drafted by Claude, for Kenny's Klopt/Aanpassen/Schrappen)

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
