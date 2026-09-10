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
   console shows no error for the Clients page. **Measured and closed
   2026-09-10** — the http-switchboard session drilled a real 3.0.0 with the
   dashboard in Chromium (login through the form, the Recheck button, the
   Revoke confirmation, a theme switch): zero console messages, every request
   200, no 404, fonts included. A consumer measured it rather than this
   project, which is the stronger form of the same check.
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

## fix-3 · `update_cmd` promised to reproduce the unit and left out its environment (2026-09-10)

Answered by Kenny 2026-09-10: **Klopt**. Reported by the Almanac session
after a misdiagnosis on CT 112 during its 4.0.3 rollout, confirmed
independently by http-switchboard, and measured here before the fix.

1. **What went wrong.** `scaffold/deploy/service.yml.tmpl` said in its own
   comment that `update_cmd` "reproduces the unit line for line — same user,
   working directory and EnvironmentFile", and the `systemd-run` invocation
   set exactly those three. It never reproduced the unit's `Environment=`
   lines — and `scaffold/deploy/service.tmpl`, the unit the same scaffold
   writes, declares two of them (`<PREFIX>_STATE_DIR` and
   `<PREFIX>_TIMEOUT_STOP_SECS`). So a supervised `update --check` ran
   against the binary's compiled-in default state directory. On CT 112 it
   failed with "the new version cannot start with this machine's
   configuration" and a remedy pointing at a missing secret; no secret was
   involved. Evidence: the red test reported
   `update_cmd is missing --property=Environment=DEMO_SVC_STATE_DIR=/var/lib/demo-svc`.
2. **Which gate let it through.** None. The test over that file asserted the
   user, the EnvironmentFile and the working directory, and nothing ever laid
   the two templates side by side. `chassis sync` reported zero drift in
   every consumer, because the output was exactly what the scaffold
   generates — which is why all four projects had the gap from day one.
3. **Where else.** Measured on the property "two templates that together
   describe one machine, never compared with each other": the latch variant
   of the unit declares the same two lines and was fixed in the same commit;
   http-switchboard and Almanac confirmed the identical shape in their own
   checkouts; no second pair of scaffold files describes one machine
   together. The kit's own `service.yml` is the only file that restates what
   a unit says.

   **Corrected 2026-09-10, from kyu's adoption report.** That answer was
   narrower than the property it claimed to search. kyu had the same fault —
   `deploy/kyu.service` set `Environment=KYU_STATE_DIR=/appdata/kyu/kyu-config`
   and `Environment=KYU_TIMEOUT_STOP_SECS=60` while its `service.yml`'s
   `update_cmd` carried neither — and it was not in the list, because the
   search had looked for a second pair of scaffold files inside this
   repository rather than asking each consumer whether its own unit declared
   `Environment=` lines. Four of four, then, not two. `chassis sync --write`
   corrected kyu's copy without anyone touching it by hand.
4. **The measure.** The two lines are reproduced as
   `--property=Environment=KEY=VALUE` in the unit's own order, and the
   comment no longer promises more than the command does. The test now reads
   BOTH files: it asserts the unit declares each variable and that
   `update_cmd` carries it, so adding a line to one without the other is
   red.
5. **Cost.** Two lines in a template, one test that compares two files.
6. **Enforced by.** Code: the test runs in the gates and in CI.
7. **Measured at.** The next supervised update on a machine that uses these
   templates: the check runs with the unit's own state directory instead of
   the compiled-in default. Reported from that project's own session
   (rule 7a); queued in `docs/PENDING_MINI_ROUNDS.md`.

   **Widened 2026-09-10, on kyu's point.** This field named Almanac and
   http-switchboard, which was written when they were the only two known to
   have the shape. Field 3 has since been corrected — all four consumers had
   it, kyu included — so naming two projects was a proxy for "a live
   supervised update", never a requirement that those two specifically
   provide it. Whoever runs one first satisfies it. kyu expects to be first:
   its own v3.2.0 release go is with Kenny, and the signed release going to
   CT 109 is exactly this run.
8. **Fallback.** If it still goes wrong there, the kit stops writing an
   `update_cmd` of its own and points at a script that reads the unit, so
   there is one source instead of two descriptions of one machine.
9. **Review.** At the batch 3 retrospective of this project.

## CF-13 · Three claims stated as fact that were never measured (2026-09-10)

Answered by Kenny 2026-09-10: **Klopt**. Found by Kenny in the remarks of
the batch-3 retrospective form: *"jij doet vaak uitspraken over tijd … Je
uitspraken over tijd zijn meer fout dan dat ze waar zijn, tenzij als het
over iets gaat dat je echt hebt gemeten. Hoe kan ik dan vertrouwen of 'De
procedure telt hoe vaak elke regel in negentig dagen bij nummer genoemd
is' correct is?"*

1. **What went wrong.** Three figures were written into forms Kenny made
   decisions on, none of them measured:

   | written | measured | out by |
   |---|---|---|
   | "an assumption that stood a year in a frozen document" | 4 days — written 2026-09-05 (`9ef8ba7`), broke 2026-09-09 | 91x |
   | "kyu's README named a workflow file for months" | 12 days — 2026-08-28 (`b0c337c`) → 2026-09-09 (`84fbe3b`) | ~8x |
   | "48 KB is too large to render in one message" | no limit exists; the largest form rendered that session was 103.8 KB | false |

   Two were impossible on their face: this repository was five days old and
   kyu twenty-nine. The third was a claim about the tool in hand, and it
   cost minutes of rewriting before Kenny said to split the form instead.
2. **Which gate let it through.** None. `hooks/form-lint.py` counted bare
   pronouns, coinages, old-shape IDs and items without an example; no check
   touched a number. FORM_PROTOCOL §6 demands evidence for report items,
   and all three sat in narrative explanation.
3. **Where else.** Searched as a property — "a duration about the past with
   no number in it, in text Claude wrote" — rather than as a place. Four
   instances in this session's own output (`al maanden`, `maandenlang` ×2,
   `maanden eerder`), all four unmeasured; six more in the procedure
   repository, of which `PROCEDURE.md`'s "for months" described a gap of at
   most nineteen days in a repository begun 2026-08-12. A wider word list
   flagged thirteen further hits that were all correct forward-looking
   durations ("een jaar gecachet" is a cache lifetime), which is why the
   list that shipped is the vague past-tense forms only.
4. **The measure.** Standing rule 24a widened from "a number offered as
   evidence" to any figure or duration in a sentence to Kenny: it names the
   command that produced it, or says it was not measured. `form-lint.py`
   gained a fifth counter over eleven vague-duration words; a form carrying
   one is refused. Text inside `<details>` or quotation marks is exempt, so
   a form reporting such a claim does not trip over its own subject.
5. **What it costs.** The three measurements above took three `git log`
   commands. The word list is eleven entries.
6. **Who enforces it.** Code for the vague words (`form-lint.py`, which
   blocks rendering); discipline for a figure that already carries a date.
7. **How we measure it works, and when.** At the first form built after the
   retrospective diff lands. Done on 2026-09-10: the counter went red on
   this session's own retro form (2 words) and green on the correction form
   that quotes all three claims — red on the assertion, silent on the
   report.
8. **Fallback.** If the list catches sound sentences, the counter is
   removed and the rule falls back to discipline alone, recorded in
   §Open measurements.
9. **When we review it.** At the retrospective of batch 4.

## CF-14 · A button reported "Copied" over an untouched clipboard (2026-09-10)

Found by Kenny on the live 0.1.8 on CT 118: **Copy token** and **Copy
command** did nothing. He asked whether it was http versus https, and offered
to test it again behind Traefik. Half of that is right, and the half that is
wrong is the one that mattered.

1. **What went wrong.** `copyLegacy` appended its scratch field to
   `document.body`. Since feat-clients-4 those buttons live inside a modal
   `<dialog>`, which puts itself in the top layer and makes everything outside
   it inert — so the field could not be focused. Measured in the page by
   wrapping `document.execCommand`: `activeElement` was `BODY`,
   `closest('dialog')` was null, the selection was the empty string — and
   `execCommand('copy')` **returned `true`**. The button therefore flashed
   `Copied` over an untouched clipboard, which is worse than a button that
   reports failure.
2. **Which gate let it through.** None could. This is browser behaviour in a
   real top layer; the E2E asserts the attributes are present, not what a
   click does. The look that found it is the gate, and it worked.
3. **Where else does the same fault sit.** Two properties, both searched.
   (a) "code that appends to `document.body` and then needs focus or
   selection while a modal may be open" — `Gezocht met:`
   `grep -n 'document.body.appendChild\|document.body.append' crates/chassis/static/*.js`,
   which returns `copyLegacy` and nothing else. (b) "a verdict that rests on a
   return value which is true even when the operation did nothing" — this is
   standing rule 34, and the sweep for it was
   `grep -nE 'execCommand|\.ok\b|returned|result' crates/chassis/static/chassis.js`;
   the other verdicts in that file read a `Response.ok` or a parsed body,
   which do vary.
4. **The measure.** The scratch field goes into the top-layer element when a
   modal dialog is open (`dialog:modal`, falling back to `<body>`), and the
   verdict is the selection rather than `execCommand`'s return value:
   `copied && selected`. A browser that does not know `:modal` falls through
   to the old behaviour rather than throwing.
5. **What the remedy costs.** One extra query and one comparison per copy.
6. **Who enforces it.** Discipline plus standing rule 34, which already says a
   verdict may not contain an always-true term. No gate here can see a top
   layer.
7. **How we measure it works, and when.** At the next proefdraaien on CT 118:
   Claude clicks both buttons in the browser and reads back what the page
   believes, and Kenny pastes somewhere to confirm the clipboard actually
   changed. The second half is his, because no session can read a clipboard
   in a non-secure context.
8. **Fallback.** If the copy still fails behind the modal, the buttons move
   out of the dialog for the plain-http case and the token is offered as
   selectable text instead — a reader can then copy it by hand.
9. **When we review it.** At the retrospective of batch 4.

**Kenny's own question, answered:** on `http://10.10.10.18:8080` the page is
not a secure context — measured in the page, `window.isSecureContext` is
`false` and `navigator.clipboard` is undefined — so the modern API genuinely
cannot run there and everything falls to this path. Behind Traefik on https
the modern API takes over and this fallback is not used at all. So his
instinct was right about why the good path was unavailable; it was the
fallback underneath that was broken, and that was ours.

## CF-15 · A field added to a public struct was released as additive (2026-09-10)

Found by the release chain itself: `scripts/release-kit.sh 1.9.0` refused,
because `scripts/check-consumers.sh` could not build two of the four.

1. **What went wrong.** feat-clients-2 added `pub fields: BTreeMap<String,
   String>` to `chassis::core::clients::Client`. Every document about it —
   the CHANGELOG's `[1.9.0]` heading included — called the release additive.
   It is not: a struct with public fields cannot gain one without breaking
   every literal construction of it. Evidence, from the refused release:
   `error[E0063]: missing field 'fields' in initializer of
   'chassis::core::clients::Client'` at `almanac/src/shell/kit.rs:271` and
   `kyu/src/kit.rs:237`. http-switchboard and kyu-runner build fine, because
   they never construct one.
2. **Which gate let it through.** The public-surface snapshot recorded the new
   field faithfully — `field chassis::core::clients::Client.fields:
   BTreeMap<String, String>` is line 128 of docs/API_SURFACE.txt — and that is
   the whole problem: it reports **what changed**, not whether the change
   breaks a caller. An addition looks additive. Rule 46's first third caught
   what its second third could not, which is why the kit has both.
3. **Where else does the same fault sit.** The property is "a public struct
   whose fields a consumer can write, that the kit may want to extend".
   `Gezocht met:` `grep -c '^field chassis::' docs/API_SURFACE.txt` → 96
   public fields, and `grep '^field chassis::' docs/API_SURFACE.txt | cut -d.
   -f1 | sort -u` names the structs they belong to. Every one of them has this
   property; what varies is whether a consumer constructs it. Measured against
   the four: only `Client` is constructed outside the kit, and only in
   one-time migration code in two of them.
4. **The measure.** Kenny chose to close the class rather than patch the
   instance (2026-09-10, after both options were built, compiled and
   reverted). `Client` is `#[non_exhaustive]` and made through
   `Client::adopted`, so what the kit adds later gets its default and no
   caller has to know. Measured: `cargo check --workspace --all-features
   --all-targets` is exit 0 with the attribute — it only restricts other
   crates — and for the two consumers eight lines of struct literal become
   one call, which is one line fewer than the minimal fix would have cost
   them.

   A second fault surfaced while writing this: the kit held its consumers to
   a rule it did not apply to itself. `chassis release` refuses a major
   without a Migration section; `scripts/release-kit.sh` did not. It does now.

   **And a third, which is Kenny's finding and the sharper one.** He asked:
   if this is a major, the consumers cannot build — so how can the gate ever
   go green? `check-consumers.sh` compiles them against this working tree
   with a cargo override and touches none of their files, so for a breaking
   change it is red by construction until their own source changes. Their
   source is theirs (rule 7a). The gate is therefore not wrong, but the
   ORDER around it was never written down: a major needs the consumer
   sessions to adapt on a branch first, then the gate goes green against
   those branches, and only then does the kit release. That is what the
   transition window in rule 46 buys for a minor and cannot buy here,
   because `Client::adopted` does not exist in 1.8.0.
5. **What the remedy costs.** One line per consumer for this instance
   (`fields: Default::default()`), in code each project owns and touches in
   its own session (rule 7a).
6. **Who enforces it.** `scripts/check-consumers.sh`, which is exactly what
   stopped this — the local build of all four before anything is published.
7. **How we measure it works, and when.** Already measured: the chain refused
   and published nothing.
8. **Fallback.** None needed; the gate held.
9. **When we review it.** At the retrospective of batch 4.
