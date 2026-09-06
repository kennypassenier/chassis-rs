# chassis-rs

The shared foundation for Kenny's Rust web services: a library crate with
feature flags plus a `chassis` command for everything a crate cannot carry.
A service built on it gets configuration, logging, `/healthz`, `/metrics`,
a graceful stop, a dashboard with per-client tokens (and passkeys behind a
TLS proxy), a signed self-update with three modes, and per-event webhooks —
and writes only what it does itself.

**Status: 0.x, in development.** Phase 6 of the dev procedure; nothing
released yet. The example service `examples/inbox` is the first consumer.

## In one file

`crates/chassis/examples/minimal.rs` (forty lines, enforced by a test) is
the whole of a service: an `AppSpec`, an axum `Router` with one route
behind a client token, `App::run`. Everything else — flags, env, config
file, login, tokens, health, metrics, shutdown — is the kit's.

## Features

| Feature | What it adds | Default |
|---|---|---|
| `core` | config (flag > env > file > default), logging, errors with a remedy, `/healthz`, `/metrics`, graceful stop, request-id, guards | on |
| `dashboard` | login with a token + session, Clients page (issue/reveal/copy/revoke, last requests, test button), status page, kp-themes | off |
| `passkeys` | WebAuthn login behind a TLS proxy (`<P>_PUBLIC_URL`, `<P>_TRUSTED_PROXIES`); pulls OpenSSL | off |
| `self-update` | `off` / `supervised` (`<name> update`) / `autonomous`, minisign-verified, staged probe, rollback | off |
| `notify` | `[[notify.webhook]]` per event, retries, fallback | off |
| `testing` | `chassis::testing` — start the app in-process on port 0, log in, issue a client, post with its token, fetch a page; a project's dev-dependency (implies `dashboard`) | off |

## The `chassis` command

```bash
chassis new inbox --description "Clients post JSON messages"   # scaffold + repo
chassis sync                                                    # diff against the current scaffold
chassis sync --remote                                           # …and compare branch protection (needs gh)
chassis release 0.2.0                                           # bump, tag, wait for CI, sign, upload
```

`sync` compares the kit-owned files with the scaffold (unified diff per
file; `--write` applies, `--write --force` also rewrites project-owned
files) and then the drift that is not a file (K32): the kit tag
`Cargo.toml` pins against `.chassis.toml`'s `chassis_tag` (a path
dependency is noted, not drift), `.chassis.toml`'s `kp_themes` against the
kp-themes version this kit vendors (`--write` corrects the record; the kit
is the source of truth there), and with `--remote` the checks `main`'s
branch protection requires against the scaffold's CI job names, plus
`strict` and `enforce_admins` (`--protect` repairs). Every such difference
is one line, `! <what>: <project value> vs <expected> — <remedy>`, printed
after the file diffs. Exit 0 = in sync (or every difference applied with
`--write`); exit 1 = drift found and not applied, or the command itself
could not run (unparseable file, missing tool — stderr carries the remedy).
Without `--remote` sync needs no network and no token, so a CI job can run
it as a drift check; `--remote` is the only part that needs `gh` and a login.

## Where the decisions live

`docs/SCOPE.md`, `docs/FEATURES.md` (the K/W/M ids in commits and tests),
`docs/ARCHITECTURE_DECISIONS.md` (T and AR decisions, the critic's
objections and their resolutions), `docs/REALIZATION_PLAN.md` (milestones
and evidence), `docs/PENDING_MINI_ROUNDS.md` (what waits for Kenny).

## Conventions worth knowing

Three small decisions that surprise people once, ratified 2026-09-05
(deep-dive DD-1 in `docs/PENDING_MINI_ROUNDS.md`):

- **`/` belongs to the kit.** With the `dashboard` feature on, the root
  is the status page; a service puts its API under `/v1/…` and its own
  pages behind a nav entry. axum refuses two handlers on one path, so
  the kit does not guess who wants the root.
- **The request id travels in the `x-request-id` response header**, not
  in JSON error bodies. Every log line carries the same id; `curl -i`
  shows it.
- **Knob flags are global**: `inbox update --update-url http://pc:9000/`
  works, and so does the flag before the subcommand. Environment
  variables stay the primary way to configure a service.

## Testing a service built on the kit

```rust
let mut app = TestApp::start_with(spec, Router::new(), |app| {
    app.api_routes(my_routes());          // what main registers, verbatim
    app.on_client_issued(make_profile);
})
.await;
app.login().await;
let source = app.issue_client("job-tracker", &[("calendar", "cal-42")]).await;
let (status, body) = TestApp::send_json(
    app.bearer(Method::POST, "/v1/events", &source.token).json(&event),
)
.await;
let (status, html) = app.page("/sources").await;
app.shutdown().await;
```

`chassis::testing` (feature `testing`, in a project's dev-dependencies)
is the harness kyu, Almanac and the inbox example each used to write by
hand: a temporary state directory, fresh secrets, port 0, the admin
session, a client token, a browser's form headers (`as_browser()`,
`as_cross_site_browser()`), a clean stop. `docs/TESTING.md` has the
worked example in full, compiled and run by the kit's own suite
(`tests/testing_harness.rs`), and the kit's in-process suites run on the
same harness.

## Ejecting a module

Every module under `crates/chassis/src/core` is pure and every one under
`src/shell` touches one concern; each opens with a plain-language doc
comment saying what it does. If the kit's version of something does not
fit a service, copy that file into the service and adapt it — the modules
are small on purpose, and the tests next to them come along.

## Development

```bash
git config core.hooksPath .githooks     # once, after cloning
cargo test --workspace --all-features
```

Commits run fmt, clippy (warnings are errors) and the full suite, and must
name feature ids in brackets. CI repeats the gates on every branch; `main`
is protected and moves by fast-forward after green.

Licensed MIT OR Apache-2.0.
