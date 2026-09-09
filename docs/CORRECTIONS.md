# Corrections

The full nine-field record of every live-found fault (standing rule 29,
FORM_PROTOCOL §8). CF-1 … CF-10 were recorded in
`docs/PENDING_MINI_ROUNDS.md` before this file existed (2026-09-05 …
2026-09-07); from CF-11 on, the record lands here and the form Kenny
answers is the one-item summary.

## CF-11 · The client-name `pattern` was invalid under the browser's `v` flag (2026-09-09)

1. **What went wrong.** `clients.html` carried
   `pattern="[A-Za-z0-9._-]{1,64}"`. Chromium compiles a `pattern`
   attribute with the `v` flag, under which a bare `-` inside a character
   class is a syntax error; the console read `Pattern attribute value
   [A-Za-z0-9._-]{1,64} is not a valid regular expression … Invalid
   character in character class`, and the browser ignored the pattern, so
   the field accepted any name and only the server refused. Seen in the
   kp-themes 5.0.0 browser drill on the local inbox (Chromium in the
   browser pane).
2. **Which gate let it through.** No gate reads the browser console: the
   template tests assert strings, the E2E suite drives HTTP, and the
   Phase-6 "look at the surface" rule looks at what renders, not at what
   the console logs. The pattern was written in L3 (2026-09-05) and every
   drill since rendered the page without reading its console.
3. **Where else.** Measured: `grep -rn 'pattern=' crates examples scaffold`
   → only the client-name field carries a `pattern`; nothing else in the
   kit, the example or the scaffold does. Consumers with their own forms (Almanac's
   calendar name, kyu's topics) are their own sessions' check; the shape to
   look for is a `-` or another `v`-flag syntax character unescaped inside
   a class.
4. **The measure.** The hyphen is escaped (`[A-Za-z0-9._\-]{1,64}`) and a
   unit test (`client_name_pattern_is_valid_under_the_v_flag`) pins the
   shape and forbids the bare `._-]` ending. Every browser drill from now
   on reads the console for errors before it is called clean (the drill
   steps in TEST_PLAN §5 gain that line).
5. **Cost.** One character in the template, one test, one sentence in the
   drill steps.
6. **Enforced by.** Code (the test) for this pattern; discipline (the drill
   step) for the class of fault, because no gate runs a browser.
7. **Measured at.** The next browser drill of the kit's dashboard: the
   console shows no error for the Clients page. Queued in
   `docs/PENDING_MINI_ROUNDS.md`.
8. **Fallback.** If a second console-only fault slips through, the inbox
   E2E gains a headless-browser step (Playwright is what kp-themes uses)
   that fails on any console error.
9. **Review.** At the next retrospective of this project.

## CF-12 · The test harness cached what the app no longer used (2026-09-09)

Answered by Kenny 2026-09-09: D1 **Opnemen** (the fix lands), CF-12 **Klopt**.

1. **What went wrong.** `TestApp::launch` captured the generated admin token
   and the harness's temporary state directory before applying the
   `extra_env` overlay, then reported those stale values from `token()`,
   `login()`, `session_cookie()` and `state_dir()`. A project that pinned
   `<PREFIX>_TOKEN` to a known value — kyu's 2.x app-token import writes a
   legacy file with a fixed key before the app starts — ran the app on the
   pinned token while the harness logged in with the generated one and got
   `login as the admin failed`. The doc comment of `start_with_env` promised
   the opposite ("A key that is also one of the harness's wins over the
   harness"). Evidence: the red test
   `k25_extra_env_overrides_the_harness_token_and_login_uses_it` failed with
   `left: "03442e3561d3…" right: "known-token-chosen-by-the-project-0001"`.
2. **Which gate let it through.** K25's test bar covered `extra_env` with a
   *project* knob (`SHUTDOWN_TIMEOUT_MS`, in
   `k25_start_with_env_reaches_the_app_and_issue_fields_reach_the_project_hook`)
   and never with one of the harness's own keys. The promise lived only in a
   doc comment, and the Phase 7 gap audit lays FEATURES.md next to the test
   inventory, not doc comments next to tests.
3. **Where else.** Measured on the property, not on the place: "the harness
   caches, before the overlay, a value the app reads after it". Of the four
   keys the harness sets, two were exposed and both were wrong (`_TOKEN` via
   `token()`/`login()`/`session_cookie()`, `_STATE_DIR` via `state_dir()`);
   `_LISTEN` is read back from the running app (`running.addr`, correct) and
   `_SECRET_KEY`/`_PUBLIC_URL` are not exposed at all. No second overlay
   exists elsewhere in the kit. Confirmed from outside: kyu and Almanac hit
   the token half independently on the same day, in different scenarios (kyu
   a legacy token file, Almanac a 3.x token store encrypted with a fixed
   key); Almanac reported `_SECRET_KEY` working precisely because nothing
   caches it.
4. **The measure.** Both values are read from the assembled environment map
   after the overlay, pinned by two tests
   (`k25_extra_env_overrides_the_harness_token_and_login_uses_it`,
   `k25_extra_env_overrides_the_harness_state_dir_and_state_dir_reports_it`).
   Deliberately nothing beyond that: no rule that every doc-comment promise
   gets a test, because standing rule 8 already turns anything that breaks
   live into a test.
5. **Cost.** Twelve lines in `testing.rs`, two tests, one CHANGELOG entry.
6. **Enforced by.** Code: both tests run in CI on every push.
7. **Measured at.** The moment kyu adopts the kit version carrying this fix:
   kyu replaces its hand-written login POST in the import scenario with
   `TestApp::login()` and that test is green; Almanac can pin
   `<PREFIX>_TOKEN` instead of reading `app.token()` back. Both report from
   their own sessions (rule 7a). Queued in `docs/PENDING_MINI_ROUNDS.md`.
8. **Fallback.** If it still fails there, `token()` reads the resolved value
   from the loaded `App` configuration (kyu's own suggestion) instead of
   from the environment map.
9. **Review.** At the batch 3 retrospective of this project.
