# Getting started — from nothing to a running service

This walks one service from `chassis new` to a systemd unit on a Debian
LXC, and then into a container. Every command was run against this
checkout on 2026-09-05; the output blocks are real, with random values
replaced by `<…>`. The example service is `inbox`; substitute your own
name and its upper-cased prefix (`inbox` → `INBOX`, `my-svc` → `MY_SVC`).

Proven by: `crates/chassis-cli/tests/new_project_builds.rs`
(`a_new_project_compiles_and_answers_version`) and
`examples/inbox/tests/lifecycle_e2e.rs` (`client_token_flow_end_to_end`).

## 0 · What you need

- On the PC: the pinned Rust (`rust-toolchain.toml`: 1.97), `git`, and
  the `chassis` binary (`cargo build -p chassis-cli` in this repo puts it
  at `target/debug/chassis`). `gh` only when `chassis new` should create
  the GitHub repository; `minisign` only for `chassis release`.
- On the LXC: nothing but the binary. It is glibc, built on Debian
  trixie (ARCHITECTURE_DECISIONS T8); `curl` is not needed because the
  binary probes itself (`--healthcheck`).

## 1 · `chassis new`

```bash
chassis new inbox --description "Clients post JSON messages"
```

`new` writes the project, runs `git init -b main`, sets
`core.hooksPath .githooks`, generates `Cargo.lock`, makes the first
commit, and then creates the public GitHub repository with `gh repo
create … --push`. Add `--no-remote` to skip the repository, and
`--chassis-path ../chassis-rs/crates/chassis` to build against a local
checkout of the kit instead of a tag. Real output of a `--no-remote` run:

```text
wrote …/calendars with 22 files and made the first commit
--no-remote: create the repository later with `gh repo create kennypassenier/calendars --public --source . --push`
Next: `cd …/calendars && calendars gen-secret` on a terminal, put both lines in /etc/calendars/calendars.env, and `cargo run -- --check`.
```

What lands on disk (the latch unit variant only with `--latch`):

```text
Cargo.toml  Cargo.lock  src/main.rs  README.md  CHANGELOG.md  .chassis.toml
rust-toolchain.toml  deny.toml  Dockerfile  .dockerignore  .gitignore
.github/workflows/ci.yml  .github/workflows/release.yml
deploy/<name>.service  deploy/service.yml  deploy/compose.example.yml  deploy/journald.conf
scripts/sign-release.sh  .githooks/pre-commit  .githooks/commit-msg
.claude/hooks/gates.sh  .claude/hooks/check-commit.sh  .claude/settings.json
docs/.gitkeep  tests/.gitkeep
```

`src/main.rs` is 47 lines: an `AppSpec`, one `POST /v1/example` route
behind a client token, a test route, `app.run()`. The name must be 1–32
lowercase letters, digits and dashes, starting with a letter (it becomes
the binary, the unit and the env prefix); anything else is refused with a
remedy. Proven by: `tests::names_versions_and_changelog`,
`tests::new_writes_a_project_that_syncs_clean` in
`crates/chassis-cli/src/main.rs`.

## 2 · `gen-secret`

The dashboard needs two secrets and never starts without both (W6 in
FEATURES.md). Generate them **on a terminal**:

```bash
cargo run -q -- gen-secret
```

It prints two lines, `INBOX_TOKEN=<48 hex>` and `INBOX_SECRET_KEY=<64
hex>`. Piping it anywhere is refused, so a secret never lands in a log:

```text
gen-secret prints secrets and stdout is not a terminal. What now: run it in a terminal and paste the two lines into the environment file; never pipe it into a log
```

Proven by: `app::tests::gen_secret_refuses_a_pipe`.

## 3 · The environment file

Secrets travel through the environment only: not through flags (they are
not in `--help`), not through the config file (refused, see
CONFIGURATION.md). On the LXC the file is `/etc/<name>/<name>.env`, mode
`0640 root:<name>`, read by the unit's `EnvironmentFile=`. Locally, a
gitignored `.env` you `source` works the same way.

```bash
INBOX_TOKEN=<from gen-secret>
INBOX_SECRET_KEY=<from gen-secret>
# Only when the `passkeys` feature is compiled in (the scaffold enables it):
INBOX_PUBLIC_URL=https://inbox.example.lan
```

`INBOX_PUBLIC_URL` must be `https://` and is required at `--check` and
start when `passkeys` is compiled in; without it:

```text
passkeys are compiled in but INBOX_PUBLIC_URL is not set. What now: set INBOX_PUBLIC_URL to the https:// address the dashboard is reached at behind the proxy, e.g. https://inbox.example.lan
```

Proven by: `shell::passkeys::tests::public_url_is_required_https_and_names_the_proxy`,
`help_lists_knobs_but_never_the_secret_flags`.

## 4 · `--check`

`--check` validates everything without opening a socket and without
writing (it writes and removes one zero-byte probe in the state
directory to prove the directory takes writes). It refuses a
half-configured service:

```text
the dashboard is compiled in but INBOX_TOKEN and INBOX_SECRET_KEY are not set. What now: run `inbox gen-secret` on a terminal and put both lines in the environment file; a dashboard never starts without a login
```

and a state directory that does not exist (`--check` never creates one;
start does):

```text
state directory /var/lib/inbox does not exist. What now: create it, make the service user its owner (chown), and make the unit's ReadWritePaths cover it
```

A good configuration answers `inbox: configuration ok`, exit 0. Two
warnings can precede it without failing the check; both are worth
reading (CONFIGURATION.md § `--check`). Proven by:
`print_config_and_check_touch_nothing`,
`without_secrets_the_service_refuses_with_gen_secret_remedy`,
`unwritable_state_dir_is_refused_at_check_and_start`.

## 5 · Run it

```bash
mkdir -p ./state
cargo run -q -- --state-dir ./state --listen 127.0.0.1:8080
```

The first log line that matters names the bound address; with
`--listen 127.0.0.1:0` this is how the tests find the port:

```text
2026-09-05T14:12:19.919181Z  INFO listening name="inbox" version="0.1.0" addr=127.0.0.1:44803
```

Health and metrics are open (no login):

```bash
curl -sS http://127.0.0.1:8080/healthz
```
```text
{"status":"ok","version":"0.1.0","subsystems":{"store":{"detail":"writable","ok":true}}}
```

Proven by: `app::tests::start_serves_kit_routes_and_stops_cleanly`.

## 6 · Log in

Open `http://127.0.0.1:8080/` in a browser. With the `dashboard` feature
`/` is the status page and redirects an anonymous browser to `/login`
(303, never a 401 popup). Paste the `INBOX_TOKEN` value. A wrong token
re-renders the page with HTTP 200 and the message `That token is not
right. Check the service's login token and try again.`; a right one sets
the cookie `inbox_session` (`HttpOnly; SameSite=Lax; Path=/`, `Secure`
only behind a trusted TLS proxy) and lands on the status page. Tick
"Keep me logged in on this browser for 30 days" for a remember-me
session; otherwise the session slides 24 h from its last use.

Proven by: `client_token_flow_end_to_end`,
`core::session::tests::plain_sessions_slide_and_remember_me_sessions_do_not`.

## 7 · Issue a client and use its token

On the Clients page, type a name (`home-assistant`) and press **Issue
token**. The row appears with the token masked; **Copy command** puts a
complete `curl` line on the clipboard (the token appears only in that
on-click fetch, never in the page HTML):

```text
curl -sS -H 'Authorization: Bearer <64 hex>' -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:8080/v1/messages
```

Without a token the API answers the kit's one error shape:

```text
HTTP/1.1 401 Unauthorized
{"error":"missing or invalid credentials","remedy":"send Authorization: Bearer <client token>, or log in on /login"}
```

With the token, inbox answers `202 Accepted` and
`{"from":"home-assistant","id":1}`. Press **Last requests** on the row:
the call is there with `"authorization": "***"`, the body, and the
status. Proven by: `client_token_flow_end_to_end`.

## 8 · The test button

**Send test** sends one request with that client's token to the route
the project declared with `App::test_route` (inbox: `POST /v1/messages`
with `{"hello":"from the dashboard"}`), against the service's own
address, and flashes `Sent → 202`. The request shows up under Last
requests like any other. A project that declares no test route shows no
button. Proven by: `client_token_flow_end_to_end` (the `/test` step),
`dashboard_pages_render_with_layout_and_assets` (`data-test=` present).

## 9 · Deploying to a Debian LXC (systemd)

The generated unit is `deploy/<name>.service`; its header comment is the
install recipe, expanded here. Every step is reversible until step 9.

1. Build the glibc binary on the same Debian the LXC runs, as the
   Release workflow does:
   ```bash
   docker run --rm -v "$PWD":/w -w /w -e CARGO_TARGET_DIR=/w/target-trixie \
     -e CARGO_HOME=/w/target-trixie/cargo-home rust:1.97-slim-trixie \
     sh -c 'apt-get update -qq >/dev/null && apt-get install -y -qq pkg-config libssl-dev >/dev/null && cargo build --release --locked'
   ```
   (`libssl-dev` because the scaffold enables `passkeys`, which pulls
   OpenSSL — T8.)
2. Copy `target-trixie/release/<name>` to the LXC and install it into its
   own directory — the self-updater needs write access to that directory
   and nothing else (S2):
   ```bash
   install -D -m755 <name> /opt/<name>/bin/<name>
   ```
3. Create the user and the two writable roots the unit lists in
   `ReadWritePaths=` (the state root and the pre-update copies beside it):
   ```bash
   useradd --system --home /var/lib/<name> --shell /usr/sbin/nologin <name>
   mkdir -p /var/lib/<name> /var/lib/<name>-pre-update
   chown -R <name>: /opt/<name> /var/lib/<name> /var/lib/<name>-pre-update
   ```
4. Write the environment file from step 3, then lock it down:
   ```bash
   install -d -m750 -o root -g <name> /etc/<name>
   install -m640 -o root -g <name> <name>.env /etc/<name>/<name>.env
   ```
5. Prove the configuration as the service user before systemd does —
   this is exactly what `ExecStartPre=` runs:
   ```bash
   systemd-run --wait --pipe --collect --uid=<name> --gid=<name> \
     --property=EnvironmentFile=/etc/<name>/<name>.env \
     --property=WorkingDirectory=/var/lib/<name> \
     /opt/<name>/bin/<name> --check
   ```
6. Install the unit and the journal budget (the service writes no log
   files; journald owns rotation):
   ```bash
   cp deploy/<name>.service /etc/systemd/system/<name>.service
   install -D -m644 deploy/journald.conf /etc/systemd/journald.conf.d/50-service.conf
   systemctl restart systemd-journald
   systemd-analyze verify /etc/systemd/system/<name>.service
   systemctl daemon-reload
   ```
7. Start it. `Type=notify` means `systemctl start` returns only after the
   binary bound its socket and sent `READY=1`:
   ```bash
   systemctl enable --now <name>
   systemctl is-active <name>
   /opt/<name>/bin/<name> --healthcheck
   ```
   The last line prints `<name>: alive=true status=ok version=<x.y.z>`
   and exits 0.
8. Verify from another machine: `curl -sS http://<lxc ip>:8080/healthz`,
   then the browser flow of §6–§8.
9. Hand it to the homelab: `deploy/service.yml` is the stack file for
   `homelab adopt` (SELF_UPDATE.md shows its `update_cmd`).

Behind Traefik, set `INBOX_TRUSTED_PROXIES=<traefik ip>` in the env
file; without it `--check` warns and the status page shows a problem
(OPERATIONS.md § Trusted proxies). Proven live on CT 118 (REALIZATION_PLAN
L4 and L8 rows); the unit's shape by
`tests::every_template_renders_and_substitutes` and
`a_new_project_compiles_and_answers_version` (`systemd-analyze verify`).

## 10 · Deploying in docker

The scaffold's `Dockerfile` builds on `rust:1.97-slim-trixie` and runs on
`debian:trixie-slim` as user `<name>` (uid 10001) with
`VOLUME ["/var/lib/<name>"]`, `ENV <P>_LISTEN=0.0.0.0:8080
<P>_STATE_DIR=/var/lib/<name>`, and `HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD
["/usr/local/bin/<name>", "--healthcheck"]` (no curl in the image). CI
pushes it to `ghcr.io/<owner>/<name>:<tag>` and `:latest` on every `v*`
tag. `deploy/compose.example.yml`, as generated:

```yaml
services:
  inbox:
    image: ghcr.io/kennypassenier/inbox:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    env_file: /etc/inbox/inbox.env   # INBOX_TOKEN, INBOX_SECRET_KEY, INBOX_PUBLIC_URL
    volumes:
      - inbox-state:/var/lib/inbox    # a named volume inherits the image's owner
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "5"
volumes:
  inbox-state:
```

Three things the compose file encodes:

- **Named volume vs bind mount.** The image's `/var/lib/<name>` is owned
  by the container user; a named volume inherits that owner, a bind
  mount does not. With a bind mount, `chown` the host directory to uid
  10001 first — otherwise `--check` and start refuse with `the state
  directory … is not writable` (the container drill of 2026-09-05 found
  this as H11; TEST_PLAN §5).
- **Logging `max-size`.** The service logs to stdout/stderr; without the
  `logging:` block the json-file driver grows without bound (H4).
- **Self-update is off inside an image.** Container detection
  (`/.dockerenv`, `/run/.containerenv`, docker/containerd/podman cgroup
  paths) forces the mode to `off` with a log line and a note on the
  update card; updates are a new image. An LXC is *not* a container to
  this check. Proven by:
  `core::update::tests::modes_parse_and_containers_force_off_but_lxc_does_not`.

## Where next

- Every knob, the precedence rule and the control commands:
  `docs/CONFIGURATION.md`.
- Your own pages, status sections and client columns:
  `docs/DASHBOARD.md`.
- Updates and signing: `docs/SELF_UPDATE.md`. Day-two operations,
  backups, the secret key: `docs/OPERATIONS.md`. Moving an existing
  service onto the kit: `docs/MIGRATION.md`.
