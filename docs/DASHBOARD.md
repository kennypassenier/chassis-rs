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

`layout.html` owns the document: fonts, the kp-themes bundle
(`dist/kp-themes.css`: themes, components, layout, utilities and the 25
registers), the theme picker (22 themes, parsed from the vendored `theme-registry.js`,
rendered server-side), the top navigation, a skip link, and the Log out
button. It defines four blocks a page may fill: `title`, `head`,
`nav_extra`, `content`. Every template sees these globals: `app_name`,
`prefix`, `assets` (the cache-busting hash), `themes`, `nav`,
`chassis_version`, `kp_themes_version`; and per render `logged_in` and
`active_nav` (the href whose nav link gets `aria-current="page"`). The
navigation is `Status` (`/`), the clients label (`/clients`, default
`Clients`), `Passkeys` (`/passkeys`, only when compiled in), `Storage`
(`/storage`), then the project's entries in registration order.

## Kit pages and routes

| Route | Who | What |
|---|---|---|
| `GET /login`, `POST /login` | anyone (login POST is IP rate-limited) | Token form; wrong token → HTTP 200 with the message inside the page; right → cookie `<name>_session` and 303 to `/`. |
| `POST /logout` | admin | Removes the session server-side, expires the cookie, 303 to `/login`. |
| `GET /` | admin | Status page: Service, Health, Updates cards, Problems (if any), then project sections. |
| `GET /clients` | admin | The clients table with the row controls below. |
| `GET/POST /api/clients`, `/api/clients/{id}/{reissue,revoke,token,requests,test}`, `DELETE /api/clients/{id}` | admin | The JSON the buttons call. |
| `GET /storage` | admin | The Storage page (3.11.0), below. |
| `GET /api/kit/storage`, `POST /api/kit/storage/{kind}/{preview,delete}`, `POST /api/kit/storage/compact{,/preview}` | admin | The Storage page's JSON (3.11.0), below. |
| `GET /passkeys`, `/passkeys/*`, `/api/passkeys*` | admin (login/start+finish: anyone) | Only over HTTPS via a trusted proxy; else 404 with a remedy. |
| `GET /static/{*name}` | anyone | Embedded assets: `Cache-Control: public, max-age=31536000, immutable` when the URL carries the `?v=<hash>` the layout adds, `no-cache` with a strong `ETag` (304 when unchanged) for a URL without it, such as a font reached from `fonts.css` or a module a project's app imports (fix-13). |

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
| `clients_label(label)` | The page title and nav label (Almanac would say `Sources`). URL and code stay `/clients`. Without it the heading is the vocabulary's capitalised plural. | Nav and the Clients page heading. |
| `vocabulary(singular, plural)` | What this service calls a client, lower case (`"source", "sources"`). Every kit sentence and every clients-API refusal uses it; URLs, JSON, cookies, metrics and logs do not (K28, 1.8.0). | Every page, the API's error messages. |
| `vocabulary_article(article)` | The article before the singular, when the vowel-sound rule is wrong for the word (`"an"` for an acronym said with a vowel). Without it the kit writes "an app", "a source", "an inbox" by sound (`chassis::article_for`); templates read `vocab_article` and `vocab_article_cap` (kit-r4). | The clients page, the palette's "Issue an app", the issue refusal. |
| `client_action(ClientAction)` | A button on every active client row that POSTs (or DELETEs) to a project route; `{id}` in the route becomes the client's id (K29, 1.8.0). | The actions cell of the Clients page. |
| `StatusSection::actions()` | Buttons under a status section, same shape (`SectionAction`), a default method so existing sections need nothing (K29, 1.8.0). | Under the section's rows on `/`. |
| `StatusSection::assets()` | `SectionAssets` — the module scripts and stylesheets the section needs, a default method (kit-kp11). | The status page's `<head>`, once per file. |
| `test_route(method, path, content_type, body)` | Where **Send test** posts, and the body the Test it field starts with. Without it the field and the button are off. | The manage dialog's Test it card; the `command_template` of Use it. |

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
  reloads the page, anything else shows the response's `error` and
  `remedy` on the button for five seconds. Add `data-method="DELETE"` for
  a delete, and `data-kp-destructive data-kp-confirm="…"` to put a modal
  confirmation dialog in front of the click (kp-themes'
  `attachConfirmations`; since kp-themes 4.0.0 the default is a native
  `<dialog>` with Cancel focused, and `data-kp-confirm-mode="inline"`
  brings back the arm-then-act relabel). On the kit's own Clients page the same button
  needs no template at all: register a `ClientAction` (see "Actions"
  below) and the kit renders it on every source's row.

Two things the scaffold's `Cargo.toml` does not enable and this example
needs: axum's `form` feature (for `Form`) and `serde` with `derive`.

## Extending the clients page (K16, 1.7.0)

A client of your service may need more than a name — Almanac's source is a
name and a calendar. Register the field and the hooks and the kit's page
does the rest; there is no second page to build:

```rust
app.client_form_field(ClientFormField::select("calendar", "Calendar", || calendars()));
app.on_client_issued(|client, fields| profiles.create(&client.name, &fields["calendar"]));
app.on_client_deleted(|client| profiles.remove(&client.name)); // Err refuses the delete
app.client_column(TargetCalendar);   // shows the calendar's name on the row
```

`on_client_issued` runs before the token exists and `on_client_deleted`
before the client goes: return an `Error` from either and nothing changes —
the page shows the kit's error with your remedy. A duplicate name is refused
before the issue hook runs. `POST /api/clients` takes
the fields as extra JSON keys next to `name`; the page's form sends every
control it has.

## Vocabulary (K28, 1.8.0)

Almanac's clients are sources; kyu's are callers; the kit's word for them
is `client`, and until 1.7 every sentence on the Clients page said so,
under a heading `clients_label` had renamed to "Sources". One call fixes
the words everywhere:

```rust
app.vocabulary("source", "sources");
```

Every kit sentence that names the thing now uses it: the explain
paragraphs ("Every source listed here is one program that calls this
service, with its own token…"), the "Add a source" card, "No sources yet.
Add one above.", the Delete button's confirm phrase ("Delete this source
and its history?"), the login page's aside about client programs, and every
refusal from the clients API (`a source named `job-tracker` already has
a token`, `no source with id …`, `source … is revoked; it has no token`).
The heading and nav label default to the capitalised plural, `Sources`,
so `clients_label` is only needed when the page should be called
something the vocabulary is not (`clients_label("Feeds")` with
`vocabulary("source", "sources")` gives a Feeds page whose sentences say
source). Without a vocabulary everything reads as before: `client`,
`clients`, `Clients`.

Vocabulary is presentation only. `/clients`, `/api/clients/{id}/…`, the
JSON keys, the cookie name, the metric names and the log fields keep
saying `client` — a monitoring query or a curl line written against 1.7
still works.

Every template sees `vocab.singular`, `vocab.plural`,
`vocab.singular_cap`, `vocab.plural_cap` and `clients_label` as globals,
so a project page rendered with `render_project` can use the same words:
`<p class="explain">Each {{ vocab.singular }} writes into one calendar.</p>`.

Proven by `tests/vocabulary_and_actions.rs`:
`k28_the_pages_speak_the_vocabulary_and_never_say_client` (login, empty
and filled Clients page and status page, visible text stripped of tags,
no whole word `client`/`clients` left; API paths unchanged),
`k28_without_vocabulary_the_pages_still_say_client`,
`k28_clients_label_still_names_the_page_when_set`,
`k28_api_refusals_speak_the_vocabulary`.

## Actions (K29, 1.8.0)

A project's button on a kit page, without a page of its own. Two places:
a client's row, and a status section. Both use one type, `chassis::Action`,
under the names `ClientAction` and `SectionAction`:

```rust
pub struct Action {
    pub label: String,
    pub route: String,        // the project's own, `{id}` allowed on a row
    pub method: String,       // "POST" (default) or "DELETE"
    pub destructive: bool,
    pub confirm: Option<String>,
    pub busy_label: Option<String>,
}
Action::post(label, route)   // then .destructive(confirm) .method("DELETE") .busy_label("…")
```

**Row actions.** Almanac's "Sync now" on a source:

```rust
app.client_action(ClientAction::post("Sync now", "/sources/{id}/sync").busy_label("Syncing…"));
app.client_action(
    ClientAction::post("Purge events", "/sources/{id}/events")
        .method("DELETE")
        .destructive("Purge every event of this source?"),
);
app.dashboard_routes(
    Router::new()
        .route("/sources/{id}/sync", post(sync_now))
        .route("/sources/{id}/events", delete(purge_events))
        .with_state(sources),
);
```

The kit renders one button per registered action on every **active** row
(a revoked source has nothing to sync), in registration order, in the
actions cell next to Re-issue and Revoke, with `{id}` replaced by the
row's client id:

```html
<button type="button" class="kp-button" data-post="/sources/3f1…/sync" data-method="POST" data-busy-label="Syncing…">Sync now</button>
<button type="button" class="kp-button kp-button--destructive" data-post="/sources/3f1…/events" data-method="DELETE" data-kp-destructive data-kp-confirm="Purge every event of this source?">Purge events</button>
```

**Section actions.** Almanac's stand-alone "Reload profiles from disk"
form becomes a button under its Profiles section: implement the trait's
`actions` method (a default method, so a section without buttons changes
nothing):

```rust
impl StatusSection for Profiles {
    fn render(&self) -> Section { /* as before */ }
    fn actions(&self) -> Vec<SectionAction> {
        vec![SectionAction::post("Reload profiles from disk", "/calendars/reload").busy_label("Reloading…")]
    }
}
// and the route, behind the admin login like every dashboard route:
app.dashboard_routes(Router::new().route("/calendars/reload", post(reload_profiles)).with_state(profiles));
```

On `/` the buttons render in one `<div class="actions section-actions">`
under the section's rows (and its `html`, if any); a section whose
`actions` is empty renders no block at all.

**What the button does** is the kit's `[data-post]` mechanism, the same
one behind Re-issue, Revoke and Delete (`crates/chassis/static/chassis.js`):
on click the button gets `aria-busy="true"`, is disabled and shows its
`busy_label` (rule 31); the fetch sends the method to the route with the
session cookie and `Accept: application/json`; a 2xx reloads the page; a
refusal shows the response's `error` and `remedy` on the button for five
seconds. A destructive action carries `data-kp-destructive` and
`data-kp-confirm="…"`, so kp-themes' `attachConfirmations` opens a modal
`<dialog>` carrying the phrase — Cancel has focus, Confirm re-fires the
click exactly once — and lets nothing through without it; a destructive
action registered without a phrase gets `Are you sure? This cannot be
undone.` (kp-themes disables a destructive control without a confirm or
an undo, and says so in the console).

Your route is an ordinary `dashboard_routes` handler: return
`StatusCode::NO_CONTENT` (or any 2xx) to reload, or a `chassis::Error`
to refuse — its `error` and `remedy` are what the person sees. Found while
wiring this and fixed in chassis.js: a remedy flashed on a `[data-post]`
button during its busy spell was overwritten the same tick by the busy
restore, so no refusal on Re-issue, Revoke or Delete had ever been
visible; the flash now outlives the busy spell.

Proven by `tests/vocabulary_and_actions.rs`:
`k29_row_actions_render_on_active_rows_and_post_to_the_project_route`
(both buttons on the active row with the id filled in, in order, none on
the revoked row, the destructive attributes, a 204 from the project's
route with the cookie, a refusal as JSON with `remedy`, 303 without the
cookie) and `k29_section_actions_render_under_the_section_and_none_without`
(one block for the one section with actions, placed between its heading
and the next); and inbox's "Clear messages" section action in
`dashboard_pages_render_with_layout_and_assets`.

## Section assets: a script and a stylesheet for a status section (kit-kp11)

A status section that needs JavaScript (a datatable, a live card) or its own
CSS declares the files instead of writing `<script type=module>` / `<link>`
into `Section.html`:

```rust
impl StatusSection for Orders {
    fn render(&self) -> Section { /* as before; html holds only markup */ }
    fn assets(&self) -> SectionAssets {
        SectionAssets::new()
            .module_script("/app/orders.js")   // <script type="module">
            .stylesheet("/app/orders.css")     // <link rel="stylesheet">
    }
}
```

- The kit renders the tags once, in the status page's `<head>`, in the order
  the sections were registered. Two sections naming the same path produce one
  tag; scripts and stylesheets are deduplicated separately.
- Paths must be absolute and same-origin (`/app/orders.js`): the CSP is
  `script-src 'self'`, so a `https://…` or `//host/…` URL could not run
  anyway. Such a path, one with `..`, a quote, `<`, `>`, a backslash, a
  backtick or whitespace is dropped and a warning is logged; nothing is
  rendered for it.
- The project serves the files itself: a route from `dashboard_routes`
  (behind the admin session) or a `webapp` mount. The kit adds no `?v=`
  cache-buster; put a version in the path or query yourself.
- `/api/kit/status` carries the merged list as `section_assets`
  (`{ module_scripts, stylesheets }`) for a web app that draws the page.

## A section that keeps its own card state (kit-r4)

chassis.js polls `/api/kit/status` and, on every poll and every re-read,
sets each kit card back to `ready` or `empty` (and to `loading` while a
re-read runs). A section whose `Section.html` has its own loading, empty and
failed states would see them wiped. Two ways to keep them, both on the card
(`section.kp-card[data-chassis-section]`, which the section's script reaches
with `el.closest('.kp-card')`):

- **`data-chassis-owned`** on the card: the shell never touches the card's
  `data-kp-state`, neither on a poll nor on a page or card re-read. The card
  is yours from then on, including its Try again.
- **`chassis-settle`**, a cancelable event the shell dispatches on the card
  just before it changes the state (bubbles; `detail`: `{ card, state,
  source }`, `state` is `ready`, `empty` or `loading`, `source` is `poll` or
  `reread`). `event.preventDefault()` keeps the card as it is for that one
  change; use it to keep a state only some of the time.

```js
const card = document.querySelector('[data-chassis-section^="orders-"]');
card.setAttribute('data-chassis-owned', '');                 // always mine
// or, only while I am showing my own failure:
card.addEventListener('chassis-settle', (e) => { if (mine.failed) e.preventDefault(); });
```

A card without either keeps the old behaviour. `data-chassis-json` cards are
still left to their own fetch loop.

## What the kit attaches itself, and the page-ready signal (kit-kp11)

The layout loads `/static/chassis.js` as a module on every kit page. It
attaches these kp-themes modules itself; an app's own code must not attach
them a second time (a second theme picker binds every click twice):

- `attachThemePickers()` (the theme menu in the nav; `theme-boot.js` applies
  the stored theme before first paint);
- `enforceContracts()` and `attachConfirmations()` (`data-kp-confirm` /
  `data-kp-destructive` controls, `[data-post]` buttons);
- `attachEffects(document)` and `attachSkipLinks()`;
- the shell (see "The shell" below): `attachNavFolds`, `attachPalettes`,
  `attachShortcuts`, `attachTabbars`, `attachConnection`, `attachArt`,
  `attachPatterns` and the More drawer's dialog wiring. They are added to
  `window.chassis.attached` too.

Everything else under `/static/kp/js/` (datatable, undo-toast, …) is the
app's to attach.

**Page ready.** Once those are attached, chassis.js fires `chassis:ready` on
`document` (detail `{ attached }`, the names above) and resolves
`window.chassis.ready`:

```js
await window.chassis.ready;            // also resolves when awaited late
// or: document.addEventListener('chassis:ready', attachMine, { once: true });
```

`chassis.ready` is a promise, so awaiting it after the event has fired still
resolves. `window.chassis` exists once chassis.js has run; a script that may
run earlier listens for the event and checks `window.chassis?.ready` first.

**Toast region.** `layout.html` carries one empty
`<div id="chassis-toasts" class="kp-toast-region" aria-live="polite"></div>`
after `<main>`, on every page (class `kp-toasts`). The kit puts nothing in it; an app
mounts its kp toasts there so a screen reader announces them.

## The shell (kit-kp11)

Every kit page and every project page in `layout.html` stands in one shell,
drawn from the page registry (`nav` and `pages` in the template context),
never from a list in the layout:

- **The bar:** brand, the visible pages, Search (a palette on Ctrl or Cmd K),
  the theme menu and Log out; links that do not fit fold behind More. On a
  phone (below 40rem) the bar keeps the brand, a Search icon and the theme
  menu.
- **The palette:** *Go to* (one link per page, with the chord `g` plus the
  page's first letter, where the letter is free), *This service* (refresh
  and updates, when the status page is on), *Account*. On the clients page it
  adds one *Manage* and one *Send a test* entry per active client, read from
  `/api/kit/clients`.
- **A page offers commands** by marking the control that does it
  `data-chassis-command="issue"` (focused, or clicked if it is not a field),
  `"filter-idle"` or `"search"`; the palette and the `n`, `/` keys only list
  what the page carries. `r` is answered by the page's own refresh control
  (`[data-kp-refresh]`); the sheet dims it where there is none.
- **The sheet** (`?`) is filled from the registered shortcuts, so it cannot
  promise a key that does nothing.
- **The connection line** takes no room while all is well. The kit wraps
  `window.fetch` of its own pages: a network failure reports `offline`; a
  401, 502, 503 or 504 reports `refused` with the service's own remedy; the
  next good answer clears it. Retry asks `/healthz`. The kit has no queue of
  waiting changes, so it never claims a count.
- **The phone's tab bar:** the first three pages are tabs, More opens a
  drawer with the rest, Choose a theme and Log out. The Clients tab carries
  the exact number of idle clients (active, no call for 30 days; one never
  called counts from its issue); no count is capped or abbreviated.
- **The error page** shows the status, one plate (what, why in plain words,
  what to do) with a drawing per kind, Go back, the status page, and the
  request id to copy. It draws the navigation when the browser is signed in.

## What the kit guarantees around a project page

- **Admin login.** The whole `dashboard_routes` router sits behind
  `require_admin`: 303 to `/login` for a browser without a session.
- **CSRF.** A state-changing request from a browser must come from this
  dashboard. `Sec-Fetch-Site` decides first (every modern browser sends it
  and no referrer policy blanks it): `same-origin` and `none` pass,
  `cross-site` and `same-site` are refused with 403 `cross-site request
  (Sec-Fetch-Site: …) refused`. Without that header the `Origin` must
  match `Host` or it is refused with 403 `cross-origin request from …
  refused`; requests without `Origin` (curl) pass. GET/HEAD/OPTIONS always
  pass. (CF-7, 2026-09-06: the `Origin`-only rule refused every form from
  Chrome, because under the former `no-referrer` policy a form submit
  carries `Origin: null`.)
- **Errors as pages.** A refusal answered to a browser navigation
  (`Sec-Fetch-Mode: navigate`, or an `Accept` asking for HTML) renders in
  the layout — the kit's error and remedy, with a way back — through
  `templates/error.html`; scripts and clients get the JSON shape
  (OPERATIONS.md §Error shapes).
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
  `x-frame-options: DENY`, `referrer-policy: same-origin` (the referrer
  stays inside this host and is blanked towards any other; `no-referrer`
  would blank the browser's `Origin` on our own forms too). The fonts are
  kp-themes' own, vendored under `/static/kp/fonts/…`; nothing loads
  from a CDN. The kit has
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

Since feat-clients-4 (2026-09-10) the table itself carries the client, its
state, last use, request count, the project's declared and extra columns, and
one unlabelled column with a single **Manage** button. Everything below lives
in the dialog that button opens: a `<dialog class="kp-dialog manage-dialog">`
per row, server-rendered (kit-kp11, the approved clients-manage review, round
3). Every part is a kp-themes component used as the package documents it;
`chassis.js` attaches them when a dialog first opens and feeds them. The
dialog is one composition on a 12-column grid: the client's identity (mark,
name, state, issue date) against three figure tiles (requests, last call, the
first declared field or the issue date); the control rail (token, command,
the project's own actions); the **Test it** card and the request inspector,
the inspector as tall as the rail in every state; and the danger band, its
words under the rail and its three actions, each with its consequence, in
three equal cells. A revoked client keeps every area.

Kenny's case (2026-09-10): the row used to carry up to eight controls across
two wrapping columns, and its height grew with whatever a project had
registered. The token in particular sat in the row, where revealing it swapped
twelve bullets for forty-eight characters and moved every button beside it.

The requests load when the dialog opens rather than behind a second click.

Per client (`templates/clients.html`, driven by `chassis.js`):

| Part | Calls | Effect |
|---|---|---|
| **Token**, a `.kp-secret` | `GET /api/clients/{id}/token` | Reveal shows the token for `reveal_seconds` (default 10) with a countdown and hides it again; Copy puts only the token on the clipboard without showing it. The field answers the component's `kp-secret-request` event, so the token is in the page only while it is shown (S9: an admin can reveal any active token at any time). |
| **Use it**, a `.kp-command` | same | The service's `command_template` with `$CLIENT_TOKEN` where the token goes, under `export CLIENT_TOKEN='…'` (the variable is named after the vocabulary's singular word: `source` gives `SOURCE_TOKEN`, `hub client` gives `HUB_CLIENT_TOKEN`, a word starting with a digit is prefixed `KIT_`; `GET /api/kit/clients` reports it as `token_var`): safe to paste into a chat. **Copy with the token filled in** is a flash button that copies the line with the real token (clipboard API needs https or localhost; the `execCommand` fallback works inside a real click). |
| **Test it**, one `.kp-formgrid` row | `POST /api/clients/{id}/test` | A JSON field (`data-kp-json`, with Format, Minify, Wrap and Copy) starting from the test route's body, and a small **Send test** flash button on the line of its tools. One request with this client's token to the project's test route, against the service's own address, carrying the edited body (`{"body": "…"}`; without one the route's own, at most 64 KiB). A body that is not JSON is refused before it is sent; an answer of 400 or more is shown as a refusal that points at the request below. A route that is not JSON gets a plain text field. Without a declared test route the field and the button are off, with the reason. |
| **Requests**, a `.kp-inspector` | `GET /api/clients/{id}/requests` | The last `capture_keep` requests, newest first: method, path, status in words, time, headers with `authorization`/`cookie`/`set-cookie`/`x-api-key` (and `capture_redact`) masked, the body cut at `capture_body_bytes` (`body_bytes` is the inspector's `bodyBytes`), Copy as curl, JSON or body, a `test` badge for Send test. Loading, empty and failed are the card's own states (Try again reads again). In memory; empty after a restart. |
| **Re-issue** | `POST /api/clients/{id}/reissue` | A confirmation; a new token, the old one refused the same second; the dialog opens again on the new one after the page reloads. |
| **Revoke** | `POST /api/clients/{id}/revoke` | A confirmation; the row stays with `revoked <date>`, the name is free again. |
| **Delete** | `DELETE /api/clients/{id}` | A typed confirmation: the dialog lists what is lost (the token, N requests of history) and Delete for good stays off until the client's exact name is typed. Available on revoked rows too. |

The three danger buttons and Send test are kp flash buttons: the theme's own
spinner while they work, one width throughout, a refusal as a toast with the
kit's sentence and remedy. A project's own row actions (K29) keep their
`data-post` markup and stand under **Actions** in the rail; chassis.js runs
them as flash buttons too.

Above the table, **Issue token** posts `{"name": …}` to `POST
/api/clients`; names are 1–64 of letters, digits, `.`, `_`, `-`, and a
name that already has an active token is refused (`a client named …
already has a token`). The token never appears in the page HTML; every
reveal and copy fetches it on click. Proven by:
`client_token_flow_end_to_end`, `reissue_and_delete_over_http_and_no_readyz`,
`dashboard_pages_render_with_layout_and_assets` (no `Bearer ` in the
HTML), `core::clients::tests::issue_reissue_revoke_delete_lifecycle`.

## kp-themes 5.1.0: what the kit vendors, and what it leaves

Since 1.8.0 the kit carries kp-themes under the package's own
paths — `/static/kp/dist/…`, `/static/kp/css/…`, `/static/kp/js/…`,
`/static/kp/fonts/…` — so `fonts.css`'s relative `url('../fonts/…')` and
the modules' `./strings.js` imports resolve unchanged and every file is the
byte-for-byte copy the manifest `static/kp/KP_THEMES.sha256` names (the
gate test compares all 115 of them, fonts and licences included).

- **One stylesheet:** the release's own bundle `dist/kp-themes.css`
  (1.3 MB, cached a year per content hash) — the palettes of the 25
  themes, `components.css`, `layout.css` and `utilities.css` (the layout
  classes kp-themes wrote after measuring this kit's 28 inline styles:
  `.kp-page`, `.kp-row`, `.kp-autogrid`, `.kp-m-0`, `.kp-fw-medium` and
  friends; the templates now carry two inline styles, both CSS anchor
  positioning for the theme menu), and every theme's register
  (`css/<name>-register.css`, its character on top of the palette), each
  scoped to `[data-theme='<name>']` and therefore inert for the other 24.
  A theme switch is one attribute; nothing loads afterwards. The kit first
  served the registers one by one and linked the active one at runtime;
  kp-themes pointed at the bundle and the loader went (D2, 2026-09-09).
- **Fonts:** kp-themes' `fonts.css` (63 faces, 29 families, all OFL) and the
  woff2 files behind it — 2.1 MB in the binary (measured at 7.2.0), fetched by the browser only
  for the active theme's faces. Without them the themes still read (the
  token stacks fall back to system faces); with them lapis, deco and the
  other display themes keep their face.
- **JavaScript:** seventeen modules, the set kp-themes' own
  `gates/check-closure.mjs` protects for this consumer since 7.0.0: the six
  theme modules (`no-flash`, `theme-registry`, `theme-core`, `theme-picker`,
  `strings`, `components`), `js/effects.js`, and since kp-themes 7.0.0 the
  nine hooks under `js/effects/` plus `js/as-of.js`, which `effects.js`
  imports on demand (R2-b, 2026-09-09): on the kit's
  pages it does the block cursor inside a focused field for a theme that
  sets `--kp-caret: block` (the register paints the cell, the module
  writes the column; none of the twelve themes of kp-themes 11.0.0 sets
  it, since terminal left) and the themes' arrivals (reduced motion
  resolves them at once). The kit's pages carry
  no reveal hooks, so headlines do not type and marks do not clear; a
  project page may use the hooks. `chassis.js` attaches the module at load
  and once more the first time a caret theme becomes active, because
  `detach()` does not forget the fields it bound (measured; asked of
  kp-themes). A gate test (`vendored_javascript_imports_only_vendored_modules`)
  keeps the import graph closed.
- **Renamed and removed themes:** `topo` → `forest`, `tazhib` → `lapis`
  (kp-themes 5.0.0); `academia`, `mono`, `ticker` and `woodblock` were
  removed in 6.0.0 and map to `formal`, and so does `nishiki`, which 5.0.0
  had renamed to `woodblock`. `theme-boot.js` maps a stored old name once
  and writes the new one back, so a visitor gets no console warning on
  every visit. kp-themes 10.0.0 removed `lapis` and `shade-dark` (to
  `dark`) and `shade-light`; 11.0.0 removed `terminal` (to `nostromo`),
  `phantom` (to `dark`), `light` and `shade-light` (to `formal`) and
  `grotesk` (to `brutalism`), the nearest of the twelve left per
  kp-themes' MIGRATION.md. `cyberpunk` is a different theme under the same name (signal
  yellow instead of neon-on-violet).
- **Left aside, on purpose:** the minified twins (`dist/kp-themes.min.css`,
  45 % smaller) — they reference a source map the kit does not serve, and
  the authored bundle is verified the same way; the accessibility floors
  (advice at kp-themes since 2026-09-09; the kit adds no contrast gate).

## The status page

Cards: **Service** (name, version, `Built on chassis <kit version>, kp-themes
5.0.0`, up since, listening), **Health** (overall badge and one line per
`/healthz` subsystem; the built-in `store` subsystem is always there),
**Updates** (mode, running, latest release, last check, note — filled by
the self-update feature, `not compiled in` otherwise), **Problems** (only
when there are any), then every project `Section` as a label/value table
and optional raw HTML.

## The Storage JSON API (3.11.0)

The kit keeps its state in two sqlite files (`docs/ARCHITECTURE_DECISIONS.md`
arch-21). The Storage PAGE is drawn from this API; until it ships, a project's
own web app can draw its own. Every route is behind the admin login, and a
`POST` obeys the same-origin rule as the other kit POSTs (a cross-site
request is a 403). Errors are the kit's `{"error", "remedy"}`.

| Route | What |
|---|---|
| `GET /api/kit/storage` | `budget` (`budget_bytes`, `warn_bytes`, `total_bytes`, `used_percent`, `level` = `ok`/`warn`/`over`, `checked_at`), `files` (one per file: `role` `app`/`kit`, `file`, `db_bytes`, `wal_bytes`, `total_bytes`, `reclaimable_bytes`, `cleanable`; the kit file is `cleanable: false`), `reclaimable_bytes` (app), `last_compacted_at` (RFC 3339 or `null`; kept in the app file), `has_app_db`, `paused`, `import` (`state` `not_requested`/`done`/`failed` + `why`), `kinds` (one per declared kind: `id`, `label`, `description`, `unit` (what its rows are called: `rows`, `cells`, …), `rows`, `bytes` (estimated), `oldest`, `newest`, `filters`, `supports_age`, `finished_automatically`). A filter is `{name, label, type: choice\|flag\|text, values?}`. |
| `POST /api/kit/storage/{kind}/preview` | Body `{"older_than_secs"?: n, "filters"?: {name: value}}`. Read-only: `rows`, `bytes`, `oldest`, `newest`, `samples` (five rows, oldest first; the time column is an RFC 3339 string), `columns` (a sample row's columns in the table's order, the integer primary key left out) and `time_column`, `confirm_with` (the kind's name as the page shows it, its `label`: what a person types), `token`. |
| `POST /api/kit/storage/{kind}/delete` | Body: the same selection plus `token` and `confirm` (the kind's `label`, exactly as `confirm_with` gave it; the id is refused). The token binds the selection, the instant (an age is fixed at the preview) and the count; it is valid 15 minutes and until a restart. Recounts inside the transaction: if the number of rows moved it deletes nothing and says so (400). One transaction, one audit log line (`audit=true`), then the budget is rechecked. Answers `deleted` (`deleted`, `remaining`, `reclaimable_bytes`) and the new `budget`. |
| `POST /api/kit/storage/compact/preview` | `file_bytes`, `reclaimable_bytes`, `free_space_needed_bytes`, `paused`. |
| `POST /api/kit/storage/compact` | `VACUUM` of the app file. 503 with `Retry-After` while a backup pause holds the state. |

A project declares its kinds with `App::storage_kind(DataKind::new("events",
"Events").table("events").time_column("at", TimeFormat::UnixSeconds)
.unit("events").filter(Filter::choice("level", "Level", "level", ["info", "error"])))`
(`unit` is optional, default `rows`); a megabyte is 1 000 000 bytes in every
size the kit writes, the budget and its warn line included; ids
are lowercase `[a-z][a-z0-9_]*` (32 at most), `compact` and `kit` are
reserved, and the declaration is checked against the schema at start. A kind
whose rows can end by their own definition adds
`.finished_by_definition("expires_at < :now")`: those rows, and only those,
are removed daily and the count is logged. Nothing of this reaches
`<name>-kit.db`: it has no kind, no delete and no compact. Proven by
`tests/storage_api.rs` (`the_kit_file_can_never_be_previewed_deleted_from_or_compacted`
and the others) and `tests/storage_app.rs`.

### The Storage page (`/storage`, 3.11.0)

A kit page like Status, Clients and Passkeys: in the registry (`id` `storage`,
order 1030, hint "What the service stores", so the bar, the palette with its
chord `g o`, the tab bar and the phone's More drawer list it), behind the same
login, switched off with `App::disable_kit_page("storage")` (no page, no
`/api/kit/storage`), drawn from the JSON above (a project with
`kit_pages_in_webapp()` draws its own). Built as Kenny approved it in the
kp-themes demo `research/chassis-storage`: **Space used** (the budget against
the three parts, the sign-in data marked read-only, a warning band with what,
why and what now), **Give back empty space** (the compact card), and **What is
stored** (the kinds as a sortable table, one `Clean up…` per kind). Clean up
opens a dialog in two steps: choose (older than a date, then the kind's own
declared filters) with a read-only preview, then the kind's NAME typed to
confirm; the server counts again inside the delete transaction. Compact is a
dialog of its own and only ever runs when asked. Every card and the table
have the package's loading, empty and failed states.

Stable control ids, for the homelab Live view: `storage-open-clean-<kind id>`
(a row's button), `storage-band-clean`, `storage-open-compact`; the clean-up
dialog `storage-clean-dialog` with `storage-clean-older`,
`storage-clean-filter-<filter name>`, `storage-clean-reset`,
`storage-clean-preview`, `storage-clean-continue`, `storage-clean-confirm`
(the block the name is typed into; the field is its `input`),
`storage-clean-back`, `storage-clean-delete`, `storage-clean-close`,
`storage-clean-done`; the compact dialog `storage-compact-dialog` with
`storage-compact-run`, `storage-compact-cancel`, `storage-compact-done`.

The budget shows up elsewhere too: past the warn line the status page's
Problems card says so (nothing is refused), `/metrics` carries
`<prefix>_storage_bytes{file}`, `_budget_bytes`, `_warn_bytes` and `_level`.

## An open dashboard (opt-in, 1.5.0)

A service that sets `AppSpec { open_dashboard: true, .. }` may run without
`<P>_TOKEN` and `<P>_SECRET_KEY`. It is then **open**: no login page (a
visit to `/login` goes home), every dashboard page and every `api_routes`
handler answers anyone who can reach the port, `Caller` is always
`Admin`, the Log out button is gone, and every page opens with a banner
("This dashboard is open …"). Nothing sealed is written: clients live in
a memory store (the Clients page explains that no token can be issued),
no session is ever minted, passkeys are off (the kit file `<name>-kit.db`
exists, since 3.11.0, but holds no secret). `--check` and every start
print a warning naming both variables; setting them closes the dashboard
again without any other change.

This is the mode kyu's W2 had in 2.x ("a hub nothing else can reach"),
kept in the kit at Kenny's request (K2-4, 2026-09-06) and **off by
default**: a service that does not opt in refuses to start without both
secrets, and the refusal's remedy names the opt-in. Proven by
`tests/open_dashboard.rs`
(`an_opted_in_service_runs_open_and_says_so_on_every_page`,
`a_service_that_did_not_opt_in_still_refuses_without_secrets`).

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
