# Dashboard — how the pages work and how a project extends them

With the `dashboard` feature the kit serves a small server-rendered
admin UI: a login page, a status page at `/`, a Clients page, and (with
`passkeys`) a Passkeys page. Templates are minijinja, embedded with
`include_str!`, and all extend one `layout.html`. A project adds its own
navigation entries, pages, status sections and client columns through
`App` methods; the kit renders them inside the same layout so every
service looks and behaves the same.

Proven by: `crates/chassis/src/shell/dashboard.rs` (the extension
points), `crates/chassis/src/app_dashboard.rs` (the routes), and the
E2E tests `dashboard_pages_render_with_layout_and_assets` and
`project_page_renders_inside_the_layout_with_security_headers` in
`examples/inbox/tests/lifecycle_e2e.rs`.

## The model in one paragraph

`layout.html` owns the document: fonts, the kp-themes stylesheets, the
theme picker (24 themes, parsed from the vendored `theme-registry.js`,
rendered server-side), the top navigation, a skip link, and the Log out
button. It defines four blocks a page may fill: `title`, `head`,
`nav_extra`, `content`. Every template sees these globals: `app_name`,
`prefix`, `assets` (the cache-busting hash), `themes`, `nav`,
`chassis_version`, `kp_themes_version`; and per render `logged_in` and
`active_nav` (the href whose nav link gets `aria-current="page"`). The
navigation is `Status` (`/`), the clients label (`/clients`, default
`Clients`), `Passkeys` (`/passkeys`, only when compiled in), then the
project's entries in registration order.

## Kit pages and routes

| Route | Who | What |
|---|---|---|
| `GET /login`, `POST /login` | anyone (login POST is IP rate-limited) | Token form; wrong token → HTTP 200 with the message inside the page; right → cookie `<name>_session` and 303 to `/`. |
| `POST /logout` | admin | Removes the session server-side, expires the cookie, 303 to `/login`. |
| `GET /` | admin | Status page: Service, Health, Updates cards, Problems (if any), then project sections. |
| `GET /clients` | admin | The clients table with the row controls below. |
| `GET/POST /api/clients`, `/api/clients/{id}/{reissue,revoke,token,requests,test}`, `DELETE /api/clients/{id}` | admin | The JSON the buttons call. |
| `GET /passkeys`, `/passkeys/*`, `/api/passkeys*` | admin (login/start+finish: anyone) | Only over HTTPS via a trusted proxy; else 404 with a remedy. |
| `GET /static/{*name}` | anyone | Embedded assets, `Cache-Control: public, max-age=31536000, immutable`. |

An anonymous browser on an admin route is redirected to `/login` (303);
a **client token** on an admin route gets a JSON 401 `a client token
cannot open the dashboard`. `/` belongs to the kit (README,
"Conventions worth knowing"): put the API under `/v1/…` and own pages
behind a nav entry.

## Extension points (all on `App`, all before `run()`)

| Method | What the project supplies | Where it shows |
|---|---|---|
| `nav_entry(label, href)` | A link. | Top navigation, after the kit's entries. |
| `dashboard_routes(Router)` | axum routes for own pages. Every handler gets `Extension<chassis::Dashboard>` and sits behind the admin login. | Wherever the routes say. |
| `status_section(impl StatusSection)` | `fn render(&self) -> Section` with `title`, `explain`, `rows: Vec<(String, String)>` (rendered escaped) and optional `html` (rendered raw: you vouch for it). | Status page, under the kit's cards. |
| `client_column(impl ClientColumn)` | `fn title(&self) -> String` and `fn cell(&self, client: &ClientView) -> String`. The cell is **raw HTML**; escape it yourself. | An extra column on every client row. |
| `problems(Fn() -> Vec<Problem>)` | `Problem { what, why, remedy }` for configuration the service saw but cannot use. | The Problems card, merged with the kit's own entries (e.g. untrusted proxy headers). |
| `clients_label(label)` | The page title and nav label (Almanac would say `Sources`). URL and code stay `/clients`. | Nav and the Clients page heading. |
| `test_route(method, path, content_type, body)` | Where **Send test** posts, with what body. Without it the button is absent. | Clients page rows; the `command` string of Reveal. |

`Dashboard::render_project(active_nav, source, ctx)` renders a project
template: it registers `source` as `__project.html` next to the kit's
templates, merges your serialisable `ctx` with `logged_in = true` and
`active_nav`, and returns `Html<String>`. Your template starts with
`{% extends "layout.html" %}` and fills `content`.

Proven by: `project_page_renders_inside_the_layout_with_security_headers`
(303 without login, `kp-nav` present, `aria-current` on the entry),
`dashboard_pages_render_with_layout_and_assets` (project section and
column render).

## Worked example 1 — inbox's `/messages` page

`examples/inbox/src/main.rs` registers the page in three lines and the
handler renders `examples/inbox/templates/messages.html`:

```rust
app.nav_entry("Messages", "/messages");
app.dashboard_routes(
    Router::new()
        .route("/messages", get(messages_page))
        .with_state(messages.clone()),
);

async fn messages_page(
    Extension(dash): Extension<chassis::Dashboard>,
    State(messages): State<Messages>,
) -> Result<axum::response::Html<String>, chassis::Error> {
    let rows: Vec<serde_json::Value> = /* newest first: {"n", "from", "body"} */;
    dash.render_project(
        "/messages",
        include_str!("../templates/messages.html"),
        serde_json::json!({ "messages": rows, "count": all.len() }),
    )
}
```

```html
{% extends "layout.html" %}
{% block title %}Messages · {{ app_name }}{% endblock %}
{% block content %}
<h1>Messages</h1>
<p class="explain">Everything clients posted to <code>/v1/messages</code> since the service started, newest first; {{ count }} so far. …</p>
{% if messages|length == 0 %}
<p class="text-secondary">No messages yet. Send one with the test button on the Clients page.</p>
{% else %}
<table class="kp-table">
  <thead><tr><th>#</th><th>From</th><th>Body</th></tr></thead>
  <tbody>
  {% for m in messages %}
    <tr><td class="mono">{{ m.n }}</td><td>{{ m.from }}</td><td class="mono">{{ m.body }}</td></tr>
  {% endfor %}
  </tbody>
</table>
{% endif %}
{% endblock %}
```

The same file registers a status section (`MessagesSection`: a
`Received` count row plus the last five messages) and a client column
(`MessagesColumn`: how many messages that client sent).

## Worked example 2 — an Almanac-flavoured "Calendars" page

Almanac keeps a list of Google calendars and pushes events into them.
On the kit that is one nav entry, one page with a create form, and two
row actions. Nothing below is in the repository; it is written against
the API exactly as inbox uses it.

```rust
use axum::extract::{Path, State};
use axum::response::{Html, Redirect};
use axum::routing::{get, post};
use axum::{Extension, Form, Router};
use chassis::{Dashboard, Error};

#[derive(serde::Deserialize)]
struct NewCalendar { name: String, google_id: String }

async fn calendars_page(
    Extension(dash): Extension<Dashboard>,
    State(cals): State<Calendars>,
) -> Result<Html<String>, Error> {
    let rows: Vec<serde_json::Value> = cals.list().iter().map(|c| serde_json::json!({
        "id": c.id, "name": c.name, "google_id": c.google_id, "last_sync": c.last_sync,
    })).collect();
    dash.render_project("/calendars", include_str!("../templates/calendars.html"),
        serde_json::json!({ "calendars": rows }))
}

async fn create_calendar(
    State(cals): State<Calendars>,
    Form(form): Form<NewCalendar>,
) -> Result<Redirect, Error> {
    cals.create(&form.name, &form.google_id)
        .map_err(|e| Error::invalid(e.to_string(), "check the calendar id in Google Calendar's settings"))?;
    Ok(Redirect::to("/calendars"))
}

async fn sync_now(State(cals): State<Calendars>, Path(id): Path<String>) -> Result<axum::http::StatusCode, Error> {
    cals.sync(&id).map_err(|e| Error::dependency(e.to_string(), "is Google reachable? see /healthz"))?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

// in main, before app.run():
app.clients_label("Sources");
app.nav_entry("Calendars", "/calendars");
app.dashboard_routes(
    Router::new()
        .route("/calendars", get(calendars_page).post(create_calendar))
        .route("/calendars/{id}/sync", post(sync_now))
        .with_state(cals),
);
```

`templates/calendars.html`:

```html
{% extends "layout.html" %}
{% block title %}Calendars · {{ app_name }}{% endblock %}
{% block content %}
<h1>Calendars</h1>
<p class="explain">Each row is one Google Calendar this service writes events into. Add one with the calendar id from Google's settings; <strong>Sync now</strong> pushes pending events at once instead of at the next tick.</p>
<div class="kp-card" style="margin-bottom: 1.5rem">
  <form method="post" action="/calendars">
    <div class="kp-field"><label class="kp-field__label" for="name">Name</label>
      <input class="kp-field__input" id="name" name="name" required></div>
    <div class="kp-field"><label class="kp-field__label" for="google_id">Google calendar id</label>
      <input class="kp-field__input" id="google_id" name="google_id" required></div>
    <button type="submit" class="kp-button kp-button--primary">Add calendar</button>
  </form>
</div>
<table class="kp-table">
  <thead><tr><th>Name</th><th>Google id</th><th>Last sync</th><th></th></tr></thead>
  <tbody>
  {% for c in calendars %}
  <tr>
    <td>{{ c.name }}</td><td class="mono">{{ c.google_id }}</td>
    <td>{% if c.last_sync %}{{ c.last_sync }}{% else %}never{% endif %}</td>
    <td>
      <button type="button" class="kp-button" data-post="/calendars/{{ c.id }}/sync" data-busy-label="Syncing…">Sync now</button>
    </td>
  </tr>
  {% endfor %}
  </tbody>
</table>
{% endblock %}
```

How the two controls behave, per `crates/chassis/static/chassis.js`:

- The **create form** is a plain HTML form. The browser posts it; the
  same-origin CSRF rule passes it because `Origin` equals `Host`; your
  handler redirects back. No JavaScript is involved, so a busy label on
  its submit button would do nothing.
- **Sync now** carries `data-post`, which chassis.js drives: on click
  the button gets `aria-busy="true"`, is disabled, and shows its
  `data-busy-label` (`Syncing…`) until the `fetch` POST returns; a 2xx
  reloads the page, anything else flashes the response's `remedy` on the
  button for three seconds. Add `data-method="DELETE"` for a delete, and
  `data-kp-destructive data-kp-confirm="…"` to make it arm on the first
  click and act on the second (kp-themes' `attachConfirmations`).

Two things the scaffold's `Cargo.toml` does not enable and this example
needs: axum's `form` feature (for `Form`) and `serde` with `derive`.

## What the kit guarantees around a project page

- **Admin login.** The whole `dashboard_routes` router sits behind
  `require_admin`: 303 to `/login` for a browser without a session.
- **CSRF.** A state-changing request with an `Origin` header must match
  `Host` or it is refused with 403 `cross-origin request from … refused`;
  requests without `Origin` (curl) pass. GET/HEAD/OPTIONS always pass.
- **Layout.** Nav, theme picker, Log out and the skip link come from
  `layout.html`; the project fills `content`.
- **Explain block.** Every kit page opens with `<p class="explain">`, and
  a lint test refuses a kit template without one
  (`shell::dashboard::tests::every_page_template_has_an_explain_block`).
  For project pages the kit has no lint; inbox's E2E asserts its own page
  contains `class="explain"` — copy that assertion into your suite.
- **CSP: no inline scripts, no third parties.** Every response carries
  `content-security-policy: default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src
  'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none';
  form-action 'self'`, plus `x-content-type-options: nosniff`,
  `x-frame-options: DENY`, `referrer-policy: no-referrer`. The fonts are
  vendored under `/static/fonts/…`; nothing loads from a CDN. The kit has
  no hook for project static files (`ASSETS` in `shell/assets.rs` is a
  fixed list), so a project page's interactivity is plain forms plus the
  `data-*` behaviours chassis.js provides.

  Found while writing this, fixed the same afternoon: `clients.html`
  carried an inline `<script type="module">` for the Issue form (the CSP
  above would have blocked it in a browser) and two kit buttons used a
  `data-kp-busy` attribute nothing read. The form is now wired from
  `chassis.js` (`form#issue`), both buttons use `data-busy-label`, and the
  E2E `project_page_renders_inside_the_layout_with_security_headers`
  asserts that no kit page carries a script without `src`.

## The Clients page controls

Per row of an active client (`templates/clients.html`, driven by
`chassis.js`):

| Button | Calls | Effect |
|---|---|---|
| **Reveal** | `GET /api/clients/{id}/token` | Shows the token in the row for `reveal_seconds` (default 10) and turns into **Hide**. The window is a browser timer only (S9): an admin can reveal any active token at any time. |
| **Copy token** | same | Puts only the token on the clipboard; flashes `Copied` or `Copy failed — use Reveal` (clipboard API needs https or localhost; the `execCommand` fallback works inside a real click). |
| **Copy command** | same | Copies `curl -sS -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{}' <own address><test route path>`. |
| **Last requests** | `GET /api/clients/{id}/requests` | Toggles a panel listing the last `capture_keep` requests: time, method, path, status, headers with `authorization`/`cookie`/`set-cookie`/`x-api-key` (and `capture_redact`) shown as `***`, the body cut at `capture_body_bytes` with a `truncated` badge, a `test` badge for Send test. In memory; empty after a restart. |
| **Send test** | `POST /api/clients/{id}/test` | One request with this client's token to the project's test route, against the service's own address; flashes `Sent → <status>`. Only when a test route is declared. |
| **Re-issue** | `POST /api/clients/{id}/reissue` | Confirm text `Re-issue? The current token stops working at once.`; a new token, the old one refused the same second. |
| **Revoke** | `POST /api/clients/{id}/revoke` | Confirm text `Revoke this token? The caller is locked out immediately.`; the row stays with `revoked <time>`, the name is free again. |
| **Delete** | `DELETE /api/clients/{id}` | Confirm text `Delete this client and its history?`; row and captures gone. Available on revoked rows too. |

Above the table, **Issue token** posts `{"name": …}` to `POST
/api/clients`; names are 1–64 of letters, digits, `.`, `_`, `-`, and a
name that already has an active token is refused (`a client named …
already has a token`). The token never appears in the page HTML; every
reveal and copy fetches it on click. Proven by:
`client_token_flow_end_to_end`, `reissue_and_delete_over_http_and_no_readyz`,
`dashboard_pages_render_with_layout_and_assets` (no `Bearer ` in the
HTML), `core::clients::tests::issue_reissue_revoke_delete_lifecycle`.

## The status page

Cards: **Service** (name, version, `Built on chassis <kit version>, kp-themes
3.1.0`, up since, listening), **Health** (overall badge and one line per
`/healthz` subsystem; the built-in `store` subsystem is always there),
**Updates** (mode, running, latest release, last check, note — filled by
the self-update feature, `not compiled in` otherwise), **Problems** (only
when there are any), then every project `Section` as a label/value table
and optional raw HTML.

## Passkeys page

Live only when the request came over HTTPS through a proxy listed in
`trusted_proxies`; otherwise the page shows the "Not over HTTPS" warning
naming `<P>_PUBLIC_URL` and `<P>_TRUSTED_PROXIES`, and the routes answer
404 `passkeys are only offered over HTTPS`. What the suite proves: the
gating, a registration challenge with the right `rp.id`, garbage on
finish refused, a 64-entry/300 s ceremony table. What it does **not**
prove (TEST_PLAN §3, H7 Later): a successful register and login with a
real authenticator; that waits for the live Bitwarden test behind
Traefik. S6 (one machine can fill the ceremony table for five minutes)
is accepted for now. Proven by:
`passkeys_exist_only_over_https_from_a_trusted_proxy`,
`shell::passkeys::tests::registration_start_issues_a_challenge_and_finish_refuses_garbage`.
