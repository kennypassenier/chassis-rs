# Testing a service built on the kit

`chassis::testing` (feature `testing`, kit 1.8.0, K25) starts your service
in-process the way the binary would start it, and hands you the six things
every project test needs: an address, the admin login, a client token, a
request with that token, a page, a clean stop. Before it existed, kyu,
Almanac and the inbox example each kept their own copy of this harness;
the kit's own suites did the same over raw TCP.

Proven by: `crates/chassis/tests/testing_harness.rs` (the `k25_*` tests,
one per helper), and the kit's own suites that run on it:
`tests/browser_forms.rs`, `tests/client_form_hooks.rs`,
`tests/open_dashboard.rs`.

## Enabling it

The feature belongs in the project's dev-dependencies; it implies
`dashboard` and adds nothing to the release binary.

```toml
[dev-dependencies]
chassis = { path = "../chassis-rs/crates/chassis", version = "1.8.0", features = ["testing"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
serde_json = "1"
```

`reqwest` is the kit's own HTTP client and is re-exported through the
helpers' return types (`bearer()` and `request()` hand you a
`reqwest::RequestBuilder`); add it to your dev-dependencies only when a
test builds requests the helpers do not.

## What a `TestApp` does for you

| Call | What happens |
|---|---|
| `TestApp::start(spec, router).await` | A temporary state directory, a fresh `<PREFIX>_TOKEN` and `<PREFIX>_SECRET_KEY`, `<PREFIX>_LISTEN=127.0.0.1:0`, `<PREFIX>_LOG=warn`; then `App::from_args_with_env` + `start()`. Panics with the kit's error when the app does not start. |
| `TestApp::start_with(spec, router, \|app\| { … }).await` | The same, with a closure that configures the `App` first — `api_routes`, `client_form_field`, `on_client_issued`, `nav_entry`, `status_section`, `client_column`, whatever the binary's `main` registers. |
| `TestApp::start_with_env(spec, router, &[("MYAPP_KNOB", "value")], \|app\| { … }).await` | The same, with your own environment entries laid over the harness's (yours win). |
| `TestApp::start_open(spec, router, \|app\| { … }).await` / `try_start_open` | For a service with `AppSpec::open_dashboard`: no secrets at all. `try_start_open` returns the refusal instead of panicking, for the test that a service which did not opt in refuses to start. |
| `addr()`, `base_url()`, `url(path)`, `state_dir()`, `token()` | Where it listens, what it writes to, the admin login token. |
| `login().await` | Posts the token to `/login`, keeps the session cookie. From here `page`, `get_json`, `post_json`, `delete`, `json` and `issue_client` act as the logged-in admin. |
| `issue_client(name, &[("field", "value")]).await` | `POST /api/clients` with the project's extra issue-form fields (K16), then the token reveal; returns `IssuedClient { id, name, token }`. |
| `bearer(method, path, &token)` | A `reqwest::RequestBuilder` with `Authorization: Bearer` — a script or another service calling your API. |
| `request(method, path)` | A `RequestBuilder` as the admin's browser or script (cookie attached once logged in, redirects not followed). |
| `page(path).await` → `(status, html)` | A browser fetching a page (`Accept: text/html`). |
| `get_json(path)`, `post_json(path, json!({…}))`, `delete(path)`, `json(method, path, body)` → `(status, json)` | JSON calls as the admin; an empty body reads as `Value::Null`, a non-JSON body as `Value::String`. |
| `TestApp::send_text(request)`, `TestApp::send_json(request)` | Send any request you built and read `(status, body)`. |
| `as_browser()`, `as_cross_site_browser()` | The header set Chrome sends on a form submit — from one of your pages, and from an attacker's page. Lay it on a request with `.headers(…)` and add the fields with `.form(&[…])`. |
| `set_request_timeout(duration)` | Every later request waits at most this long (default `DEFAULT_REQUEST_TIMEOUT`, 10 s). |
| `shutdown().await` | Drain and run the flush hooks, like SIGTERM. The state directory stays until the `TestApp` is dropped, so a test can read what the stop wrote. Dropping without `shutdown()` still stops the server and removes the directory. |

## A worked example

A project that keeps a profile per client — Almanac's shape: issuing a
client on the Clients page also creates the profile, and the issue form
carries a `calendar` field. The test starts the app with the same hooks
`main` registers, logs in, issues a client with the field, posts with its
token, and reads the project's own page. It is also
`k25_worked_example_from_docs_testing_md_runs_as_written` in
`crates/chassis/tests/testing_harness.rs`, so the suite compiles and runs
what you read here.

```rust
//! Our clients are calendar sources: the issue form carries the calendar,
//! the hook makes the profile, and a post with the token lands on it.
use std::sync::{Arc, Mutex};

use axum::routing::{get, post};
use axum::{Json, Router};
use chassis::shell::dashboard::ClientFormField;
use chassis::testing::TestApp;
use chassis::{AppSpec, Caller, Error};
use reqwest::Method;
use serde_json::json;

/// The profiles `on_client_issued` created: client name → calendar id.
type Profiles = Arc<Mutex<Vec<(String, String)>>>;

#[tokio::test]
async fn issuing_a_source_makes_its_profile_and_its_token_posts_events() {
    let profiles: Profiles = Default::default();
    let made = profiles.clone();
    let listed = profiles.clone();
    let mut app = TestApp::start_with(
        AppSpec {
            name: "calhub",
            version: env!("CARGO_PKG_VERSION"),
            ..Default::default()
        },
        Router::new(),
        |app| {
            // What `main` registers, verbatim.
            app.client_form_field(ClientFormField::text("calendar", "Calendar", "primary"));
            app.on_client_issued(move |client, fields| {
                let calendar = fields.get("calendar").ok_or_else(|| {
                    Error::invalid("a source needs a calendar", "fill in the Calendar field")
                })?;
                made.lock().unwrap().push((client.name.clone(), calendar.clone()));
                Ok(())
            });
            app.api_routes(Router::new().route(
                "/v1/events",
                post(|caller: Caller, Json(event): Json<serde_json::Value>| async move {
                    let source = match caller {
                        Caller::Client { name, .. } => name,
                        Caller::Admin => "admin".to_string(),
                    };
                    Json(json!({ "source": source, "stored": event }))
                }),
            ));
            app.nav_entry("Sources", "/sources");
            app.dashboard_routes(Router::new().route(
                "/sources",
                get(move || {
                    let rows = listed.lock().unwrap().clone();
                    async move {
                        axum::response::Html(format!("<ul>{}</ul>", rows
                            .iter()
                            .map(|(name, cal)| format!("<li>{name} → {cal}</li>"))
                            .collect::<String>()))
                    }
                }),
            ));
        },
    )
    .await;

    // 1. Log in as the admin and issue a source through the Clients page's API.
    app.login().await;
    let source = app.issue_client("job-tracker", &[("calendar", "cal-42")]).await;
    assert_eq!(
        profiles.lock().unwrap().as_slice(),
        [("job-tracker".to_string(), "cal-42".to_string())],
        "the hook made the profile before the token existed"
    );

    // 2. The source posts an event with its token, as a script would.
    let (status, stored) = TestApp::send_json(
        app.bearer(Method::POST, "/v1/events", &source.token)
            .json(&json!({ "title": "Interview" })),
    )
    .await;
    assert_eq!(status, 200, "{stored}");
    assert_eq!(stored["source"], "job-tracker");

    // 3. The project's own page renders behind the login.
    let (status, html) = app.page("/sources").await;
    assert_eq!(status, 200);
    assert!(html.contains("job-tracker → cal-42"), "{html}");

    // 4. A missing field is refused by the hook, with its remedy, and nothing is issued.
    let (status, refused) = app.post_json("/api/clients", json!({ "name": "no-calendar" })).await;
    assert_eq!(status, 400, "{refused}");
    assert_eq!(refused["remedy"], "fill in the Calendar field");

    app.shutdown().await;
}
```

Note that the `dashboard_routes` handler above returns bare HTML for
brevity; a real project page renders through the `Dashboard` extension so
it sits inside the layout (see `docs/DASHBOARD.md`, worked example 1).

## Testing your own forms the way a browser posts them

The kit's CSRF rule reads `Sec-Fetch-Site` first and falls back to
`Origin` against `Host` (CF-7, kit 1.5.1). A test that posts one of your
forms as Chrome would, and one as an attacker's page would:

```rust
let (status, html) = TestApp::send_text(
    app.request(Method::POST, "/sources/job-tracker/delete")
        .headers(app.as_browser())
        .form(&[("confirm", "yes")]),
)
.await;
assert_eq!(status, 303, "{html}");   // your handler's redirect after the action

let (status, html) = TestApp::send_text(
    app.request(Method::POST, "/sources/job-tracker/delete")
        .headers(app.as_cross_site_browser())
        .form(&[("confirm", "yes")]),
)
.await;
assert_eq!(status, 403);
assert!(html.contains("cross-site request"), "refused as a page: {html}");
```

## The fake release server (with `self-update`)

`chassis::testing::FakeReleaseServer::start(repo, version, binary, asset)`
serves `VERSION`, `SHA256SUMS`, `SHA256SUMS.minisig` (signed by a
throwaway key with the trusted comment `<repo> v<version>`) and the asset
from a temporary directory on port 0. Point the updater at `.url` with
`.pubkey` as `update_pubkey` and `update_allow_insecure=true` (it speaks
plain http); `.version_hits` counts the `GET /VERSION` calls, `.dir` is
the served directory for a test that tampers with a file.
`start_signed_as(version, binary, asset, trusted_comment)` signs with a
comment of your choosing, for the test that a genuine signature over
another version's manifest is refused. The kit's own update suite in
`crates/chassis/src/shell/update.rs` runs on it.

## Rules the harness follows so you do not have to

- **Port 0, always.** `no_test_names_a_literal_port` in the inbox E2E
  suite scans every `.rs` file under `crates/` and `examples/` for a
  literal port (K11); a project that copies that test keeps the rule.
- **Secrets travel through the environment map**, never `set_var` and
  never argv: `App::from_args_with_env` is what the harness calls.
- **A helper that cannot do its job panics with a remedy** — the
  message names the step and what to change, so a failing test says
  where it broke instead of failing three assertions later.
