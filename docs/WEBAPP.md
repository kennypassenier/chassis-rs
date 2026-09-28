# A browser app and a live channel (`webapp`, `live`)

Two optional features for a project whose dashboard is a static browser
application rather than server-rendered pages. Both are off by default; a
service that does not name them compiles none of their code.

```toml
chassis = { version = "…", git = "…", tag = "…", features = ["core", "webapp", "live"] }
```

## `webapp`: static files behind the login

```rust
use chassis::shell::webapp::WebApp;

const FILES: &[(&str, &[u8])] = &[
    ("index.html", include_bytes!("../web/index.html")),
    ("js/main.js", include_bytes!("../web/js/main.js")),
    ("css/app.css", include_bytes!("../web/css/app.css")),
];

app.webapp(WebApp::embedded(FILES));            // served under /app/
// app.webapp(WebApp::dir("web").at("/admin")); // from disk while developing
```

- **Login.** The app sits behind the same admin login as the kit's pages:
  a browser without a session is redirected to `/login`, a script sending a
  wrong bearer gets a 401. After logging in the browser lands on `/`; add
  `app.nav_entry("App", "/app/")` for a link in the kit's navigation.
- **Routing.** `/app` redirects to `/app/`. A path whose last segment has no
  extension and matches no file answers `index.html`, so the app's own
  router handles `/app/stacks/media`. A missing file with an extension
  (`/app/js/gone.js`) is a 404, never HTML.
- **Caching.** Every response carries a strong `ETag` and `no-cache`: the
  browser revalidates and gets a 304 until the file changes, so an edited
  module is picked up on the next load without a build step. A URL with
  `?v=…` is cached for a year (`immutable`), as the kit's own assets are;
  `index.html` never is.
- **Content-Security-Policy.** The kit's policy by default
  (`chassis::shell::webapp::DEFAULT_CSP`: scripts, styles, fonts and
  connections from this origin only). `.csp("…")` replaces it for the
  app's responses only. kp-themes' framework-free modules run under the
  default, and the vendored kp-themes files are served at `/static/kp/…`
  (`/static/kp/dist/kp-themes.css`, `/static/kp/js/…`).
- **Refusals at start and `--check`.** A mount that is `/` or starts with
  one of the kit's routes (`/login`, `/logout`, `/static`, `/api`,
  `/clients`, `/passkeys`, `/healthz`, `/metrics`); an embedded app without
  `index.html`; a directory without `index.html`.
- **Directory source.** Read on every request; a path that leaves the
  directory, including through a symlink, is a 404.

## `live`: Server-Sent Events

```rust
use chassis::shell::live::Live;

let live = Live::new(256);
app.dashboard_routes(live.router("/events"));   // behind the login
// later, wherever state changes:
live.publish("stack", &serde_json::json!({ "name": "media", "state": "deploying" }))?;
```

In the browser:

```js
const events = new EventSource('/events');
events.addEventListener('stack', (e) => update(JSON.parse(e.data)));
events.addEventListener('resync', () => reloadEverything());
```

- Events carry an `id` counted from 1 per process.
- A browser more than `capacity` events behind receives one `resync` event
  (data: how many it missed) and should fetch the state again. A browser
  that reconnects (the `EventSource` sends `Last-Event-ID`) starts with a
  `resync` too: nothing is kept to replay.
- A comment line goes out every 15 seconds so an idle connection is not
  closed by a proxy.
- The router is not protected by itself: mount it with `dashboard_routes`
  (admin login) or `api_routes` (client token), whichever fits what it
  carries.
