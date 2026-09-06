# Test plan — chassis-rs (Phase 7 output)

What is proven where, what is proven in which environment (standing rule
35), and what is *not* covered, by decision. Counts name their command
(rule 24a); every "proven by" names a test that exists (rule 11a). Written
2026-09-05 at the close of the Phase 7 hardening round; the gate log in
`REALIZATION_PLAN.md` records the decisions.

## 1 · The suites

`cargo test --workspace --all-features` (also the commit gate and CI):

| Suite | Where | Count | What it drives |
|---|---|---|---|
| kit unit tests | `crates/chassis/src/**` (`#[cfg(test)]`) | 93 | core decisions (config precedence table, crypto envelope, clients/sessions, update decision table, notify parsing), shell pieces against real files/sockets (stores, guards, captures, assets, dashboard templates, update pipeline against an in-process signed release, paused-clock update loop) |
| CLI unit tests | `crates/chassis-cli/src/main.rs` | 7 | template rendering (exact file count, latch unit content), version bump, changelog, Migration rule, input validation, the compiled-in public key mirror |
| scaffold E2E | `crates/chassis-cli/tests/new_project_builds.rs` | 1 | `chassis new` → the generated project builds, answers `--version`/`--check`, **passes its own gates** (fmt, clippy `-D warnings`, tests, clean tree), its unit parses under `systemd-analyze verify`, `sync` is clean, `release --dry-run` names every step |
| inbox E2E | `examples/inbox/tests/lifecycle_e2e.rs` | 21 | the real binary over the process boundary: exit codes, signals, stderr, the full client-token flow over HTTP, the dashboard pages and assets, a project page inside the layout, both rate limiters to 429, 413 on captured routes, log scan for secrets, JSON log mode, notifier delivery through a `[[notify.webhook]]` with a `${VAR}` header, restart persistence, unwritable/missing state dir, `--check` warnings, `--help` without secret flags, the update subcommand refusing http and a foreign signature, no literal ports in any test |

Gates: `.githooks/pre-commit` → `.claude/hooks/gates.sh` (fmt, clippy
`--all-targets --all-features -D warnings`, the suite, tree fingerprint);
`.githooks/commit-msg` (feature IDs); CI re-runs them plus `cargo deny`
and coverage (informational) on every branch; `main` requires both checks.

## 2 · Proven per environment (rule 35)

| Mechanism | PC (suite) | CI (Ubuntu) | CT 118 (Debian 13 LXC, systemd) | Container (debian:trixie-slim) |
|---|---|---|---|---|
| `--version` / `--check` / `--print-config` | E2E | gates | live (L1) | — |
| SIGTERM → drain → exit 0; listener registered before bind | E2E `sigterm_exits_zero…`, in-process drain | — | live (L1, L8) | live: exit 0, `stopped drained=true` |
| `Type=notify` readiness | unit (sd_notify path) | — | live: `Type=notify`, `NotifyAccess=main`, `NRestarts=0` | n/a |
| journald without ANSI; JSON log mode | E2E `json_log_mode…`, logging tests | — | live: 0 escape sequences in the unit's journal | plain lines on stdout |
| `--healthcheck` without curl | unit + E2E | — | live (L2) | live: `alive=true`, docker `HEALTHCHECK` = healthy |
| token login, clients, captures, test button | E2E `client_token_flow…`, `reissue_and_delete…` | gates | live (L3, L8) | live: login 303, post 202 |
| state survives restart; usage persisted at shutdown | E2E `sessions_and_usage_survive_a_restart` | gates | live restart (L3) + restore drill M3 | live: `docker restart`, same token → 202 |
| unwritable / missing state dir refused at `--check` and start | E2E `unwritable_state_dir…`, unit `state_dir_probe…` | gates | (the golden unit provisions the dir) | drill 1 found the gap (H11); fixed |
| container detection forces self-update off, loudly | unit | — | n/a | live: status card "OCI container…"; the start log names the effective mode |
| signature verified before any hash; **bound to the version** (S1) | unit `a_signature_for_another_version…`, E2E `update_subcommand_refuses…` | gates | live: `inbox update` against the real GitHub host without a release → exit 1 with remedy | — |
| compiled-in `RELEASE_PUBKEY` verifies a real release | unit `the_compiled_in_key_verifies_a_real_almanac_release` (Almanac v2.4.0 manifest + `.minisig`, rule 9) | gates | — | — |
| update loop: first tick after `startup_delay`, then every `interval` | unit, paused clock (`autonomous_loop_ticks…`) | gates | — | — |
| read-only version watch in `off`/`supervised` | unit `watch_once_reports…` | gates | — | — |
| supervised swap with the real binary | unit with shell-script stand-ins | — | **live 2026-09-05** (drill key, A1): `systemd-run --wait --pipe --collect --uid=inbox … /opt/inbox/bin/inbox update` installed 0.1.1 over 0.1.0 (exit 0, "restart to run it"), `inbox.prev` kept, pre-update copy `/var/lib/inbox-pre-update/0.1.1/messages.json`, `systemctl restart` → 0.1.1 active `NRestarts=0`, `/healthz` 0.1.1; second run "already current; nothing touched" exit 0 with the binary mtime unchanged; the card says TRUST ROOT OVERRIDDEN | n/a |
| autonomous rollback with the real binary | unit with shell-script stand-ins; `a_rolled_back_version_is_never_reinstalled` (CF-3, driven red once) | gates | **live 2026-09-05**: 0.1.1 (autonomous, `update_drill=broken`) installed 0.1.2, the new binary exited 1 before READY, the second start reverted to 0.1.1 — rollback proven. The same drill found CF-3: the restored 0.1.1 reinstalled 0.1.2 after `startup_delay`, three cycles, `NRestarts=6` in 45 s. Fixed (skip list); **re-drill 0.1.3 → 0.1.4 (14:21 UTC): one install, one crash before READY, one revert (`NRestarts=3`), then `update.held` "rolled back earlier; skipped until a newer release appears" at +3 s and again at +63 s, `update-skip.json` = `["0.1.4"]`, no further restart** — CF-3 measured | n/a |
| broken-after-ready under the homelab's supervision | unit (drill kind parsed) | — | **live 2026-09-05 14:24 UTC** after `homelab adopt` (CT 118 = stack `inbox`, hostname `118-app-inbox`): `homelab update-native inbox` ran the contract (`.homelab-prev` kept, supervised install exit 0, restart), the new 0.1.4 sent READY and exited 1 five seconds later exactly as the drill says — and the homelab declared "healthy" at once: the installed `homelab` v3.48.0 (built 05:33) predates the F300 fix (commit 1ed72e3, 08:39) that watches the window and `NRestarts`. The kit's half is proven; the homelab's half is announced for a re-run with the rebuilt binary (drill files ready: `dist/drill-0.1.4`, env `INBOX_UPDATE_DRILL=broken-after-ready`) | n/a |
| release workflow (tag → binary, image, GitHub release) | — | **never run** (no tag yet; A5 gives the go after Phase 8) | — | — |
| `chassis new` remote + `sync --protect` (live gh) | E2E `--no-remote` | E2E (`--no-remote`; the missing git identity of a runner was live-found and fixed) | — | — |
| passkeys: gating, ceremony start, table cap | unit + E2E `passkeys_exist_only_over_https…` | gates | — | — |
| passkeys: successful register/login | **not covered, by decision** (H7 Later: the live Bitwarden test behind Traefik comes first) | | | |

## 3 · Not covered, by decision (Phase 7 hardening form, 2026-09-05)

| Item | Decision | Why, and what would close it |
|---|---|---|
| H7 · passkey success path (`register_finish`, `login_finish`) | **Later** | The live test with Bitwarden behind Traefik is the better test and waits for Kenny (hostname + certificate). A software authenticator (`webauthn-authenticator-rs`) is built only if that live test fails. |
| S6 · unauthenticated exhaustion of the passkey ceremony table | **Closed in 1.4.0** (Kenny, closing form 2026-09-06: Dichten) | The table evicts its oldest instead of refusing, a client IP owns at most `passkey_ceremonies_per_ip` slots, and `/passkeys/login/*` is behind the `/login` IP limiter. Proven by `one_ip_evicts_only_its_own_oldest_at_its_share`, `at_the_cap_the_oldest_of_all_goes_instead_of_refusing`, `expiry_frees_slots_and_refuses_stale_takes` and the 429 assertion in `passkeys_exist_only_over_https_from_a_trusted_proxy`. |
| S9 · by design: `reveal_seconds` is enforced in the browser only (an admin can reveal any active token any time, as K12 says); `/healthz` and `/metrics` are open and disclose version and route names (restrict `/metrics` at Traefik to Prometheus); a `${VAR}` in the root-owned config file can pull any environment variable into a non-secret knob (masked in `--print-config` since H15); the CSRF origin check ignores the scheme (schemeful SameSite covers it); no separate header-read timeout (Traefik in front) | **Accepted as known limitation** | Documented here and in the README's conventions. |
| H16 · environments only Kenny can prove | **Dichten — Kenny gives the tag, key or go** | Release workflow (first tag, A5), remote `chassis new` + `sync --protect`, signed swap/rollback drills (drill key, A1), passkeys behind Traefik (A4: later). Each has its drill named in §2. |
| K21 crash between `hard_link` and `rename` (critic #1) | by construction, not fault-injected | A `bin` exists at every instant because the link happens first; `supervised_update_swaps…` proves the happy path and the cleanup. |
| container detection | synthetic evidence in unit tests + one live docker drill | The drill (2026-09-05) confirmed the card and the forced-off mode; no CI job runs inside an image (the scaffold's image job runs in the generated project's CI on its first push). |

## 4 · Tests that are smoke, on purpose

`lib.rs::version_is_semver_shaped`, `time.rs::formats_and_lengths`: shape
checks only. Kept because they cost nothing and fail on a broken build of
the constants they read.

## 5 · Drills (run by hand, recorded in REALIZATION_PLAN.md)

- **M3 restore** (2026-09-05, CT 118): state root tarred, destroyed,
  restored; the existing client token and session valid afterwards.
- **Container** (2026-09-05, docker on the PC): `--healthcheck` without
  curl, client flow, restart, SIGTERM exit 0, container detection; drill 1
  with a root-owned volume found H11 (unwritable state dir undetected).
- **Generated project** (2026-09-05): `systemd-analyze verify` on both
  units (only "binary not found" on the PC), workflows and `service.yml`
  parse; the gates E2E found two real gaps (template not rustfmt-clean,
  lockfile absent from the first commit) — both fixed.
- **Supervised swap** (2026-09-05, CT 118, drill key): through the homelab's
  `systemd-run --wait --pipe --collect` contract (critic #7): exit 0,
  "installed 0.1.1 over 0.1.0; restart to run it", `inbox.prev` kept,
  pre-update copy written, restart → 0.1.1 `NRestarts=0`; second run "already
  current; nothing touched", binary mtime unchanged.
- **Autonomous rollback** (2026-09-05, CT 118): install → crash before READY →
  revert on the second start, as designed; and the churn afterwards (CF-3),
  fixed the same afternoon with a red-then-green test.
- **Remote `chassis new` + `sync --protect`** (2026-09-06, CLI 1.4.1): a throwaway
  repository created and pushed by `chassis new`, CI green (4 checks), branch
  protection on `main` set by `sync --protect` and read back through the API
  (three required checks, strict, enforce_admins), repository deleted. The
  first attempt (CLI 1.4.0) was red on cargo-deny — fixed in 1.4.1.
- **C2 with the ecosystem key** (2026-09-06, CT 118, `drill-release.sh 0.1.4`
  signed by Kenny, no pubkey override): supervised swap 0.1.3→0.1.4 via
  `systemd-run` (exit 0, `.prev` kept, restart NRestarts=0, healthcheck
  0.1.4, second run no-op); autonomous rollback with `update_drill=broken`
  (install, DRILL exit 1, revert on the second start, `update.held` for
  0.1.4 = `update-skip.json`, NRestarts=3, 0.1.3 back).
- **Pending:** broken-after-ready
  under the homelab (needs adopt); `ExecStartPre=--check` refusing a broken
  env (W9).
