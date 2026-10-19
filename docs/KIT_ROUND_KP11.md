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
