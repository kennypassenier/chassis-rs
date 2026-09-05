# Self-update — three modes, one pipeline, and how to prove it

With the `self-update` feature a service can fetch its own next release,
verify it, and swap the binary in place. Three modes decide who pulls
the trigger; one pipeline does the work; the signature is the only
trust anchor. This document follows `crates/chassis/src/core/update.rs`
(the decisions) and `crates/chassis/src/shell/update.rs` (the world).

Proven by: the fourteen `shell::update::tests::*` and seven
`core::update::tests::*` tests, and the E2E
`update_subcommand_refuses_a_foreign_signature_and_touches_nothing`.
What is **not** yet proven live is listed at the end.

## The three modes

| `update_mode` | Who checks | Who installs | Who restarts | Writes state? |
|---|---|---|---|---|
| `off` (default) | the kit, read-only, for the status card | nobody | — | no |
| `supervised` | the homelab, by running `<name> update` | that one run | the homelab | no |
| `autonomous` | the running process, on a timer | the process | the process exits 0; `Restart=always` starts the new binary | `update-state.json` while on probation |

Exactly one is in force. Inside an OCI container (`/.dockerenv`,
`/run/.containerenv`, or `docker`/`docker-`/`libpod`/`containerd` in
`/proc/1/cgroup`) `autonomous` becomes `off` — a binary rewritten inside
an image is lost at the next recreate. An LXC is **not** a container to
this check. `supervised` stays supervised anywhere: it is the
supervisor's call. The decision and its reason are logged once at start:

```text
INFO self-update configured=supervised effective="supervised" reason="update_mode is supervised: `<binary> update` does one attempt, the supervisor restarts" trust_root="compiled-in ecosystem key" url=https://github.com/kennypassenier/chassis-rs/releases/latest/download
```

The four reasons that can appear: `update_mode is off`; `update_mode is
supervised: …`; `update_mode is autonomous: this process checks,
installs and restarts itself`; `update_mode is autonomous but this is an
OCI container: a rewritten binary would be lost at the next recreate, so
the module is off`. Proven by:
`core::update::tests::modes_parse_and_containers_force_off_but_lxc_does_not`.

## Where releases live

`update_url` is a directory holding four assets: `VERSION` (`x.y.z`),
`SHA256SUMS`, `SHA256SUMS.minisig`, and the binary named `update_asset`
(default: the service name). Unset, it derives from `AppSpec.repository`
as `https://github.com/<owner>/<repo>/releases/latest/download`. With a
mode other than `off` and neither set, `--check` refuses:
`update_mode is on but neither update_url nor AppSpec.repository says
where releases live`. A plain `http://` host is refused unless
`update_allow_insecure=true`:

```text
update_url `http://127.0.0.1:9` is not https:// and update_allow_insecure is off. What now: a plain-http release host lets anyone on the path swap VERSION; use https, or set update_allow_insecure=true for a drill server you control
```

## The pipeline, step by step

Both active modes run the same `check_once`. Each step names what
refuses it; every refusal ends with nothing installed.

1. **Refuse to start while something is pending.** If `update-state.json`
   exists (an unproven autonomous update) or the drill marker
   `<bin>.drill` exists, the outcome is `Blocked` and nothing is fetched.
2. **`GET <url>/VERSION`**, parsed as `MAJOR.MINOR.PATCH` (a leading `v`
   is tolerated; pre-release suffixes are refused). Unreachable host:
   `GET … failed: … What now: is the release host reachable from here?
   check update_url and DNS`. A non-2xx: `… answered 404 Not Found. What
   now: the release may be incomplete (assets are uploaded one by one);
   the next check retries`.
3. **Compare.** Only strictly newer installs; equal or older is `Current`.
4. **Hold and skip list.** If the candidate is listed in
   `<state_dir>/update-skip.json` — a version this process installed and
   rolled back earlier (CF-3) — the outcome is `Held` with an `update.held`
   event whose detail reads `rolled back earlier; skipped until a newer
   release appears`; a newer release is not affected. If `update_hold`
   refuses the candidate, the outcome is `Held` and `update.held` fires.
5. **`GET SHA256SUMS` and `SHA256SUMS.minisig`; verify the signature
   before reading any hash.** The public key is the compiled-in ecosystem
   key unless `update_pubkey` overrides it. A bad signature:
   `the release signature does not verify: … What now: either the
   release host is compromised or the signing key changed; nothing was
   installed, and nothing should be installed by hand until you know
   which`.
6. **Bind the signature to the version (S1).** The signature's trusted
   comment must read `<repo> v<version>` (`sign-release.sh` writes it
   with `-t "$repo $tag"`); with no repository known, it must at least
   end in ` v<version>`. A genuine older manifest served under a newer
   `VERSION` is refused: `the release signature is for `<comment>`, not
   for <repo> v<version>. What now: VERSION and the signed manifest
   disagree: the host may be replaying an older release under a newer
   version number; nothing was installed`.
7. **Look up the asset's hash** in the manifest (`hash  name` or
   `hash *name`); a missing line: `the release manifest has no entry for
   `<asset>``.
8. **`GET` the binary** to memory, refusing anything above
   `update_max_download_bytes` before it is read in full, and compare
   SHA-256 in constant time: `the downloaded binary's SHA-256 (…) does
   not match the signed manifest (…)`.
9. **Stage** it as `<bin>.staging` (same directory, mode 0755) and run
   `<bin>.staging --check` bounded by `update_probe_timeout_secs`. A
   non-zero exit quotes the new version's stderr: `the new version
   refuses its own --check: <stderr>. What now: nothing was installed;
   the release cannot run with this configuration`. A hang: `the staged
   binary's --check did not finish within N s. What now: nothing was
   installed; the release hangs on start`. The staging file is
   removed either way.
10. **State copy (K21).** If the project registered `App::state_copy`,
    the kit creates `<update_copies_dir>/<new version>/` (default
    `<state_dir>-pre-update/<version>/`), calls the hook with that path,
    then prunes the directory to `update_keep_copies` newest entries.
    Without a hook nothing is copied.
11. **Swap.** Remove a stale `<bin>.prev`, `hard_link(bin, bin.prev)`,
    then one `rename(staging, bin)`, then fsync the directory. A binary
    exists at every instant; `.prev` is always the old one. Needs write
    access to the binary's directory: `cannot keep the previous binary at
    <bin>.prev: … What now: the service user needs write access to the
    directory holding the binary (ReadWritePaths in the unit), not only
    to the binary`.
12. **Drill marker**, only with `update_drill` set: `<bin>.drill` with
    `{version, kind}`.
13. **Autonomous only:** write `update-state.json`
    `{from_version, to_version, previous_binary, attempts: 0}`.
14. Emit `update.installed` and log `update installed from=… to=… mode=…`.

Proven by: `shell::update::tests::supervised_update_swaps_and_a_second_run_touches_nothing`,
`a_release_that_fails_its_own_check_is_never_installed`,
`a_bad_signature_is_refused_before_any_hash_and_a_bad_hash_after`,
`a_signature_for_another_version_or_repo_is_refused`,
`plain_http_needs_allow_insecure`, `an_oversized_asset_is_refused`,
`hold_and_pending_state_block_an_install`,
`a_rolled_back_version_is_never_reinstalled`,
`core::update::tests::manifest_lookup_and_constant_time_match`.

## Supervised: `<name> update`

The subcommand forces supervised mode whatever `update_mode` says, runs
`check_once` once, prints one line and exits **0 for every outcome**:

```text
inbox: already current (0.1.0); nothing touched
inbox: 0.2.0 is available but held; nothing touched
inbox: an update to 0.2.0 is still on probation; nothing touched
inbox: installed 0.2.0 over 0.1.0; restart to run it
```

Errors exit 1 with the messages above. It never restarts the service
and never writes `update-state.json`: the supervisor kept its own copy
and rolls back from outside. The homelab runs it exactly as the unit
would, through the `update_cmd` the scaffold writes into
`deploy/service.yml`:

```yaml
update_cmd: >-
  systemd-run --wait --pipe --collect --uid=inbox --gid=inbox
  --property=EnvironmentFile=/etc/inbox/inbox.env
  --property=WorkingDirectory=/var/lib/inbox
  /opt/inbox/bin/inbox update
```

`--wait --pipe --collect` make the call return the subcommand's exit
code and stderr, so "already current" is an exit 0 without a restart and
a refusal carries its remedy. After `installed …` the homelab restarts
the unit; `ExecStartPre=… --check` runs the new binary's own check first.

## Autonomous: timer, probation, rollback

- **Timer.** First check after `update_startup_delay_secs` (default 300),
  then every `update_interval_secs` (default 21600); one `INFO update
  check outcome=…` line per tick, `WARN update check failed; retrying
  next interval` on error. Proven with a paused clock by
  `autonomous_loop_ticks_after_the_startup_delay_then_every_interval`.
- **Restart.** When a tick installs, the loop returns, the process logs
  `stopping for the update restart`, drains like a SIGTERM, and exits 0.
  That the new binary then starts is the unit's `Restart=always`
  (configuration-dependent).
- **Startup decision**, run before any store opens (so a new version
  whose store fails still counts an attempt):

  | `update-state.json` says | Running binary | Action |
  |---|---|---|
  | nothing | any | `Normal` |
  | `to_version` ≠ running | e.g. the homelab already rolled back | `Stale`: clear the state, log `update state names another version; clearing it`, run |
  | `to_version` = running, `attempts + 1 < max_start_attempts` | new version, first start | `Probation`: write `attempts + 1`, serve |
  | `to_version` = running, `attempts + 1 ≥ max_start_attempts` | new version again | `Revert`: `rename(bin.prev, bin)`, clear the state, add `to_version` to `update-skip.json`, emit `update.rolled_back`, print `update reverted; exiting so the supervisor starts the restored binary`, exit 0 |

  With the default `update_max_start_attempts = 2`: the first start of a
  new version serves; its second start (it died before proving itself)
  reverts. **After a revert the same version is never installed again by
  this process** (`update-skip.json`, CF-3): the first live drill showed
  the restored version reinstalling the broken one every `startup_delay`
  (three cycles, `NRestarts=6` in 45 s). To retry that exact version on
  purpose, stop the service and delete `<state_dir>/update-skip.json`;
  there is no knob for it. If `.prev` is gone the revert is impossible; the kit emits
  `update.failed` (`revert impossible: …`) and runs on.
- **Healthy = liveness only** (critic #3). `update_healthy_after_secs`
  after start, still running, the kit clears the state, logs `update
  confirmed healthy` and emits `update.ok`. `/healthz` answering 503
  because a project subsystem is degraded does **not** trigger a
  rollback; a process that dies does.

Proven by: `autonomous_writes_state_and_startup_reverts_after_the_attempts`,
`confirm_healthy_clears_probation_and_drill_marker_binds_to_the_version`,
`core::update::tests::startup_decision_table`,
`corrupt_state_reads_as_none_and_copies_are_pruned` (a corrupt state file
reads as "nothing pending" with an error line, not as a refusal to
start).

## Hold: pin or skip

`update_hold` = `1.4.0` or `pin:1.4.0` installs **only** 1.4.0 (and not
if it is already running); `skip:1.4.0` refuses exactly 1.4.0 and lets
anything newer through; empty holds nothing. A held candidate is logged,
shown on the card and emitted as `update.held`. Proven by:
`core::update::tests::hold_pins_or_skips`.

## The drill marker

`update_drill=broken` or `broken-after-ready` makes the *next installed*
version sabotage itself, so the rollback path can be proven without a
bad release existing on GitHub. The marker `<bin>.drill` records the
installed version; only a binary of that version reads it, and it
removes the marker on the first read (one shot). `broken` prints `DRILL:
this version exits before READY on purpose (update_drill=broken)` and
exits 1 before binding; `broken-after-ready` logs `DRILL: exiting 1 five
seconds after READY (update_drill=broken-after-ready)` and calls
`exit(1)` five seconds after start — this exposes a supervisor that
samples `is-active` once. While the marker exists the updater is
`Blocked`, so it cannot reinstall in a loop. Proven by:
`core::update::tests::drill_marker_is_version_bound`,
`confirm_healthy_clears_probation_and_drill_marker_binds_to_the_version`.

## The read-only version watch (`off` and `supervised`)

When a release host is known, `off` and `supervised` still fetch
`VERSION` on the same schedule, download nothing, and log `release check
(read-only) latest=… running=…` (or `WARN release check failed; retrying
next interval`). The status page's Updates card shows
`Mode`, `Running`, `Latest release` (`not checked yet` before the first
tick), `Last check` (`never`), and a `Note`: the last error, or `newer
available: 2.0.0 (not installed in off mode)`, or `newer available:
2.0.0, but it was rolled back earlier and is skipped`, or `current`. Without a
host the note ends in `; no release host configured (update_url /
AppSpec.repository), so no version check`. Proven by:
`watch_once_reports_a_newer_release_without_installing`.

## `update_pubkey`: overriding the trust root

The compiled-in key is
`RWQWCzzUBquIHGkS3YERMkuqEm4C3vBArnlb9rySbr8z5ytgVYuji3bS` (Almanac's
`RELEASE_PUBKEY`, mirrored in the `chassis` CLI and kept equal by
`tests::release_pubkey_matches_the_kit`). `update_pubkey` replaces it —
for drills and staging only. A changed trust root is never silent: a
`WARN self-update trusts a key from update_pubkey instead of the
compiled-in ecosystem key` at construction, `trust_root="update_pubkey
(OVERRIDDEN)"` in the start line, and `; TRUST ROOT OVERRIDDEN by
update_pubkey` appended to the card's note. A value that is not a
minisign key is refused at `--check`. The compiled-in key verifies a real
release (Almanac v2.4.0, fixture under `crates/chassis/tests/fixtures/`);
that release's trusted comment is minisign's default, so it would be
refused by step 6 — pre-chassis releases are not installable by the kit
on purpose. Proven by: `the_compiled_in_key_verifies_a_real_almanac_release`.

## Signing a release

CI (`.github/workflows/release.yml` from the scaffold) builds the trixie
binary on a `v*` tag, writes `SHA256SUMS`, pushes the image and creates
the GitHub release with those two assets. It checks that the tag equals
`Cargo.toml`'s version. The signature and `VERSION` are added from the
PC by `chassis release <version>`, which (dry-run output, verbatim):

```text
dry run: would write Cargo.toml version = "0.2.0" and a 0.2.0 section in CHANGELOG.md, then:
  git commit -am 'chore(release): 0.2.0 [meta]'
  git push origin HEAD:refs/heads/release-0.2.0   # CI must be green before main moves (rule 6)
  wait for the checks of that commit, then: git push origin HEAD:main && git push origin --delete release-0.2.0
  git tag v0.2.0 && git push origin v0.2.0
  wait for the Release workflow run whose head_branch == v0.2.0 (poll every 15s, at most 1800s)
  scripts/sign-release.sh v0.2.0   # minisign asks for the key password; uploads .minisig then VERSION
```

`release` refuses a dirty tree, a branch other than `main`, and a major
bump without a `Migration` section in `CHANGELOG.md`. `sign-release.sh`
downloads `SHA256SUMS` from the release, signs it with
`minisign -S … -t "<owner/repo> v<version>"`, writes `VERSION`, verifies
the signature against the key baked into the kit, and uploads
`SHA256SUMS.minisig` **before** `VERSION` — an updater that saw `VERSION`
first would count the missing signature as a failure. Until both exist
the release is inert to the updater. Proven by:
`a_new_project_compiles_and_answers_version` (dry run names every step),
`tests::major_bumps_need_a_migration_note`.

## Running the drills

`scripts/drill-release.sh` builds a drill release of `inbox` for Debian
trixie, writes the manifest and `VERSION`, signs it, and can serve it:

```bash
scripts/drill-release.sh 0.1.1                 # sign with Kenny's key (password prompt)
scripts/drill-release.sh 0.1.1 --drill-key     # a password-less drill key, never for production
scripts/drill-release.sh 0.1.1 --serve 9000    # … and serve dist/drill-0.1.1 on http://<pc>:9000/
```

With `--drill-key` the script generates `dist/drill-minisign.key/.pub`
once and prints the public line; the service on the LXC then needs
`INBOX_UPDATE_PUBKEY=<that line>` and `INBOX_UPDATE_ALLOW_INSECURE=true`
(the PC serves plain http), and its card says `TRUST ROOT OVERRIDDEN`.

1. **Supervised swap.** On the LXC, with the unit running the old
   version: run the `update_cmd` from `service.yml` with
   `INBOX_UPDATE_URL=http://<pc>:9000` in the env file. Expect `installed
   0.1.1 over 0.1.0; restart to run it`, exit 0, `/opt/inbox/bin/inbox.prev`
   present. `systemctl restart inbox`; `/healthz` reports `0.1.1`. Run the
   command again: `already current (0.1.1); nothing touched`.
2. **Autonomous rollback.** Set `INBOX_UPDATE_MODE=autonomous`,
   `INBOX_UPDATE_DRILL=broken`, a short `INBOX_UPDATE_STARTUP_DELAY_SECS`
   and `INBOX_UPDATE_INTERVAL_SECS=60`; restart. Expect: the tick installs
   and the process exits 0; the new binary starts, sees the marker,
   prints the `DRILL:` line and exits 1; systemd restarts it after
   `RestartSec=5s`; the second start reverts (`update reverted; exiting
   …`), exits 0; the old binary starts clean; the log shows
   `update.rolled_back` and the marker is gone.
3. **broken-after-ready.** Same as 2 with `INBOX_UPDATE_DRILL=broken-after-ready`:
   the new binary reaches `active`, dies five seconds later, and the
   supervisor's window check must catch it (homelab commit `1ed72e3`).

Status (TEST_PLAN §2 and §5, REALIZATION_PLAN L8, all 2026-09-05 on CT 118
with the drill key): **drill 1 ran live** — `systemd-run … inbox update`
installed 0.1.1 over 0.1.0 (exit 0, `restart to run it`), `inbox.prev`
kept, the pre-update copy written, `systemctl restart` → 0.1.1 with
`NRestarts=0`, second run `already current; nothing touched`. **Drill 2
ran live** — install, crash before READY, revert on the second start; the
first run also found the reinstall churn (CF-3), fixed the same afternoon
with `a_rolled_back_version_is_never_reinstalled` (driven red first); the
re-drill 0.1.3 → 0.1.4 showed one install/crash/revert (`NRestarts=3`),
then `Held` at +3 s and +63 s, `update-skip.json` = `["0.1.4"]`. **Drill 3
is half proven**: the kit's binary sent READY and exited 1 five seconds
later, but the homelab binary installed on the PC predates its F300 fix
(commit `1ed72e3`) and declared "healthy" at once; the homelab's half is
queued for a re-run (PENDING_MINI_ROUNDS.md). The Release workflow has
never run (no tag yet; A5 gives the go after Phase 8).
