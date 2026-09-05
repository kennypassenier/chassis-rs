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
| supervised swap, autonomous rollback, broken-after-ready with the real binary | unit with shell-script stand-ins | — | **waits for the drill release** (`scripts/drill-release.sh --drill-key`, A1) | n/a |
| release workflow (tag → binary, image, GitHub release) | — | **never run** (no tag yet; A5 gives the go after Phase 8) | — | — |
| `chassis new` remote + `sync --protect` (live gh) | E2E `--no-remote` | E2E (`--no-remote`; the missing git identity of a runner was live-found and fixed) | — | — |
| passkeys: gating, ceremony start, table cap | unit + E2E `passkeys_exist_only_over_https…` | gates | — | — |
| passkeys: successful register/login | **not covered, by decision** (H7 Later: the live Bitwarden test behind Traefik comes first) | | | |

## 3 · Not covered, by decision (Phase 7 hardening form, 2026-09-05)

| Item | Decision | Why, and what would close it |
|---|---|---|
| H7 · passkey success path (`register_finish`, `login_finish`) | **Later** | The live test with Bitwarden behind Traefik is the better test and waits for Kenny (hostname + certificate). A software authenticator (`webauthn-authenticator-rs`) is built only if that live test fails. |
| S6 · unauthenticated exhaustion of the passkey ceremony table (64 pending, 300 s) | **Accepted for now; re-raised at the Phase 10 retro** | Token login keeps working; passkey login/registration can be blocked from one machine for five minutes. Closing it: the IP limiter on `/passkeys/login/*`, evict-oldest instead of refuse, a per-IP cap. |
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
- **Pending (drill key, A1):** supervised swap, autonomous rollback,
  broken-after-ready on CT 118 with `/opt/inbox/bin` and the hardened unit;
  `systemd-run --wait --pipe --collect … inbox update` exit code (critic
  #7); `ExecStartPre=--check` refusing a broken env (W9).
