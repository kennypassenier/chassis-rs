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
| R1 | Phase 1 · build-vs-buy | pending | docs/SCOPE.md §Build vs buy | per concern: use crate / build own / hybrid |
| R2 | Phase 2 · features + freeze | pending | docs/FEATURES.md | IDs, ratings, test expectations, mandatory items 1–4 |
| R3 | Phase 3 · tech choice | pending | docs/ARCHITECTURE_DECISIONS.md | libraries, license, MSRV, platforms, environment differences |
| R4 | Phase 4 · architecture + freeze | pending | docs/ARCHITECTURE_DECISIONS.md | AR decisions with the critic's surviving objections |
| R5 | Phase 5 · realization plan + hooks | pending | docs/REALIZATION_PLAN.md | milestones, standing rules, which gates block |

## Mini-rounds (deviations from a frozen decision)

_None yet._

## Open measurements (correction forms, rule 29)

| ID | Measure | Measured at | Status |
|---|---|---|---|
| CF-1 | No Dutch coinage for a technical concept in user-facing text (list + rule in the central memory) | The Phase 4 architecture form of this project: zero such words, counted before sending | open |

## Deliberately not done (waits for Kenny, AFK start round Q10)

1. **Signing and publishing a release** — needs Kenny's minisign key and
   his explicit "go". Builds and tags are prepared; nothing is published.
2. **`homelab adopt` of the scratch container** — writes into the
   homelab's state; Kenny runs it or gives the go in this session.
3. **Passkey test behind Traefik** — needs a hostname and certificate
   Kenny manages.
4. **Anything that would change a frozen decision of 2026-09-05** —
   becomes a mini-round above instead of being built.

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
