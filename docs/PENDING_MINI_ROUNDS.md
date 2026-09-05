# Pending rounds — chassis-rs

The queue for everything that waits on Kenny. Presented as ONE combined
ratification form on his return (PROCEDURE.md, AFK ratification pattern).
Rows are appended while the AFK run progresses; nothing is removed until
Kenny has answered it.

AFK mode: **on** since 2026-09-05 (AFK start round, Q1 = "Ja, zo
doorwerken"). Phase gates 1–5 become ratification rounds R1–R5 below;
Phase 6 milestone reports accumulate into one combined report.

## Ratification rounds (gates crossed during AFK)

| Round | Gate | Status | Document | What Kenny ratifies |
|---|---|---|---|---|
| R1 | Phase 1 · build-vs-buy | drafted 2026-09-05 | docs/SCOPE.md §Build vs buy | per concern: use crate / build own / hybrid (17 rows; five "build our own") |
| R2 | Phase 2 · features + freeze | drafted 2026-09-05 | docs/FEATURES.md | IDs, ratings, test expectations, mandatory items 1–4. **Note for Kenny:** W2's clap half moved into K2 (a parser is needed for `--version`/`--check` anyway); only the backoff helper stays Desired. New W9 proposed: systemd `Type=notify` readiness (AR15), rated Essential by Claude because the homelab's update check is `systemctl is-active`. |
| R3 | Phase 3 · tech choice | drafted 2026-09-05 | docs/ARCHITECTURE_DECISIONS.md T1–T8 | libraries, license, MSRV, platforms, environment differences; release target glibc/trixie because webauthn-rs needs OpenSSL |
| R4 | Phase 4 · architecture + freeze | drafted 2026-09-05, critic pass done | docs/ARCHITECTURE_DECISIONS.md AR1–AR20 + §Critic pass | AR decisions; 6 blocking + 13 should-fix objections, all adopted with a resolution (table at the end of the document); the added knobs |
| R5 | Phase 5 · realization plan + hooks | drafted 2026-09-05, hooks live | docs/REALIZATION_PLAN.md | milestones L0–L8, standing rules, hook config (Q9); hooks proven by firing (rule 7d) in the L0 commit |

## Open with the Homelab Rust session (announce, do not fix here — rule 7a)

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

## Mini-rounds (deviations from a frozen decision)

_None yet._

## Open measurements (correction forms, rule 29)

| ID | Measure | Measured at | Status |
|---|---|---|---|
| CF-1 | No Dutch coinage for a technical concept in user-facing text (list + rule in the central memory) | The Phase 4 architecture form of this project: zero such words, counted before sending | open |

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
