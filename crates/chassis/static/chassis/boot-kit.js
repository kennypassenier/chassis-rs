// Attaches the kp-themes behaviours every kit page uses (theme picker,
// contracts, confirmations, effects, skip links) and routes remembered
// choices through the database-backed store when the server provides it.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { attachThemePickers } from '../kp/js/theme-picker.js';
import { enforceContracts, attachConfirmations, attachSkipLinks } from '../kp/js/components.js';
import { attachEffects } from '../kp/js/effects.js';
import { configureRemember } from '../kp/js/remember.js';
import { localiseTimes } from './format-text.js';

// 3.12.0: with preferences in the database (prefs-boot.js, put in the page
// by the server), kp-themes' data-kp-remember reads and writes through the
// composite store, so the choices follow the login across devices. Without
// them the call is skipped and localStorage stays as it was.
if (window.chassisPrefs) configureRemember({ storage: window.chassisPrefs.storage });

attachThemePickers();
enforceContracts();
attachConfirmations();
// K15, kp-themes 5.0.0 (R2-b, 2026-09-09): js/effects.js performs what a
// stylesheet cannot — the block cursor inside a focused field for a theme
// that sets `--kp-caret: block` (none of kp-themes 11.0.0's twelve does, since
// terminal left; the hook stays for one that will) (the register paints the cell, the module writes the column), the
// themes' arrivals and reveals. The kit's own pages carry no reveal hooks,
// so on them the module does the caret and the arrival only.
//
// The caret is bound at attach time and only if the theme active at that
// moment answers `--kp-caret: block`; a page loaded in formal and switched
// to a caret theme would keep the browser's caret. Measured 2026-09-09: detach()
// does not forget the fields it bound (a module-level WeakSet), so
// detach-and-reattach cannot rebind them — instead the kit attaches once
// more, the first time a caret theme becomes active after load. Bound
// fields stay bound; whether the cell is painted is the register's call.
// This works because every register is already in dist/kp-themes.css: the
// knob is readable the moment the theme attribute changes (D2).
let effects = attachEffects(document);
let caretAttached = caretTheme();
function caretTheme() {
  return getComputedStyle(document.documentElement).getPropertyValue('--kp-caret').trim() === 'block';
}
document.addEventListener('kp-theme-change', () => {
  if (caretAttached || !caretTheme()) return;
  caretAttached = true;
  effects = attachEffects(document);
});

attachSkipLinks();

// Every <time datetime> on the page is written the kit's one way.
localiseTimes();
