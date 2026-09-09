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
