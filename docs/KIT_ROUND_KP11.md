# Kit pages on kp-themes 11: consumer wishes

Collected 2026-10-19 for the round after 3.8.0. Visual items go to Kenny as
demos on the kp-themes Agenda (research/chassis-kit-*); the rest is API.

## Almanac (docs/KP_THEMES_11_ADOPTION.md, "Wishes for the kit pages")

- Shell: `.kp-tabbar` on a phone with exact `setTabbarBadge` counts;
  `.kp-palette` (Ctrl+K) with `.kp-shortcuts` chords; `data-kp-nav-fold`.
- Status: `.kp-ops` frame, `.kp-badge--version`, `.kp-problems`,
  `.kp-uptime`, a live `.kp-refresh` / `.kp-ago` / `.kp-connection` trio.
- Clients: `.kp-inspector[data-kp-requests]` instead of the hand-built
  request log in chassis.js, `.kp-secret`, `.kp-command`, typed confirm on
  Delete, combobox with `data-kp-usual`, kp-datatable, `.kp-dialog__section`,
  `.kp-idmark`.
- Login: `.kp-secret`, `.kp-switch` for "Keep me logged in".
- A StatusSection that renders a kp-datatable, kpi/health markup and a
  JSON-fed card (`data-kp-state` loading → ready).

## Homelab

- `/api/kit/passkeys` gains a `current` flag (the passkey of this device)
  and a rename endpoint; the passkeys page shows both.

## HTTPSwitchboard

1. A SectionAction variant on the kp flash button + toast with a result
   count, no page reload (today `[data-post]` reloads and shows no count).
2. A documented API for a section to load a module script and stylesheet
   (today a `<script type=module>` / `<link>` inside Section.html by
   convention).
3. Optional: a kit toast region and a "page ready" signal, so apps do not
   attach kp modules by hand (auto.js would double-attach the theme picker
   next to chassis.js).

## Deviations found while building (for Kenny, with the next demo round)

- Shell: the connection banner sits at the foot of the window (the demo's
  markup) while the demo's look text said "under the bar"; Kenny to judge.
- Shell: the CSRF refusal's plate title stays the kit's technical message
  ("Cross-site request … refused"); plain wording needs the kit's error
  texts changed.
- Shell: palette and shortcut sheet are modal dialogs (the demo showed them
  side by side as frames).
- Clients: the walk-through shows above the list while no client has
  called (the demo showed it alone), the time pill and "202 Accepted" are
  left out (the page cannot know them), the KPI strip waits for a first call.

## To settle at the merge

- One idle rule for the tab badge (shell) and the list (clients): no call
  for 30 days, or never called 30 days after issue; the badge must read the
  list's `counts.idle`, not compute its own.
- The test label: the request log trusts an `x-chassis-test` header, so any
  client can mark its own calls as tests. Mark it server-side in the
  dashboard's test route instead.
- `bodyBytes` mapping for kp's request inspector when the manage dialog
  moves to it.
- Almanac audit: at 390 px the 3.8.0 nav stacks its links beside the brand.
  The shell branch (kit-kp11-shell) hides the links on a phone and uses the
  tab bar; re-check the bar on the owner's grid primitive with the
  clients-manage re-ship.
- Status: the 48-hour availability strip lives in memory, so a restart
  empties it ("no data" before the restart). Keeping it across restarts
  needs a small file under the state directory: a choice for Kenny with the
  3.9.0 release question.
- Status: the flash kind is a new `FlashAction` (via `flash_actions()`),
  not a field on `SectionAction`, because consumers build `SectionAction`
  as a struct literal; `SectionBody::Many` added for a card with figures and
  checks; check lists use one column (`kp-statuslist--rows`).
- Shell at 1894: the signed-in bar's Search trigger is 38.5 px tall beside
  the 36 px theme button (centres equal); same row, so it must share top and
  bottom. Fix at the merge.
- Clients manage: with the dialog itself as the measured section, the align
  check reads two offsets that the approved demo also has (its check scoped
  them away): identity head vs figure tiles 14.3 px (centred on purpose) and
  danger words vs the three actions 4.6 px. The 4.6 px one is a near-miss
  under Kenny's rule: fix at the merge.
- Shell + components: on a failed read the shell's connection banner and the
  component's own failed state both show (double warning). Settle at the
  merge: the banner only for whole-service unreachability, not for one
  component's read.
- When kp-themes 11.1.0 is vendored: delete the TEMPORARY .kp-formgrid block
  at the end of chassis.css, the passkeys page-scoped QR and page-header grid
  overrides, and put data-kp-confirm="dialog" back on the passkey list
  (kp-themes b5d397b0).
- At the 11.1.0 re-measure: nav links are now --kp-control-height (36 px
  in formal, dark, cyberpunk, nostromo, solstice, titanium; kp-themes
  7c6c0607); brutalism, synthwave, deco, blueprint and pastel stay taller by
  design, so the bar row check must allow those themes' own heights.
- Pre-check branch kit-kp11-precheck (kp-themes main ab7a749b vendored,
  throwaway): fixes 398e21e (clients empty plate), 569b01e (status first
  read through the package states), 1dab477 (error page plate) are kit-only
  commits to cherry-pick onto the real 11.1.0 vendoring.
- At 390 the fixed .kp-tabbar overlaps content in measure-gaps (it does not
  scroll); check that every page reserves the tab bar's height at its foot so
  the last content can scroll clear of it.
- 3.9.0 re-measure on kp-themes 11.1.1 (5d3647f8 scripts): 28 of 28 page ×
  theme × width combinations clear; dialogs clear except the command
  palette, where kp-palette__label / __description edges differ per row
  (1.9 to 31.8 px at 1280, 7 to 19 px at 390). Package-side markup; not yet
  passed on (Kenny passes 3.9.0 news himself, 2026-10-19).

## Queued for the next chassis-rs release (Kenny, 2026-10-20 03:04: first
## finish every end product, then one kp-themes + one chassis-rs cycle)

1. kyu gap 53: the clients page says "What a app is"; the kit always writes
   "a" before the vocabulary word (needs "an" before a vowel sound).
2. almanac: an html-only status section still renders an empty
   dl[data-chassis-rows] under it.
3. almanac: settleCards sets an html section back to ready; a hook so the
   section keeps its own state.
4. Command palette rows: kp-palette__label / __description edges differ per
   row (up to 31.8 px at 1280, 19 px at 390); kp-themes is on hold, so fix
   it kit-side and queue it in ~/Projects/kp-gaps/chassis-rs.md.
