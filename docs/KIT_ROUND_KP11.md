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
