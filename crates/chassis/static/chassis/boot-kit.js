// Attaches the kp-themes behaviours the kit pages use (contracts,
// confirmations, skip links, refresh, ago; the theme pickers, effects and
// dialogs come from auto.js) and routes remembered
// choices through the database-backed store when the server provides it.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { enforceContracts, attachConfirmations, attachSkipLinks, openConfirmation } from '../kp/dist/js/components.js';
import { attachAgo, setAgo } from '../kp/dist/js/freshness.js';
import { attachRefresh, refreshOf } from '../kp/dist/js/auto-refresh.js';
import { configureRemember } from '../kp/dist/js/remember.js';
import { attachLazyRegisters } from '../kp/dist/js/lazy-register.js';
import { localiseTimes } from './format-text.js';
import { installRefresh } from './refresh-kit.js';
import { guardStaleImports } from './stale-import.js';
import { installLogoutGuard } from './logout-guard.js';

// A lazy kp chunk gone after an app update reloads the page once.
guardStaleImports(window);

// 3.12.0: with preferences in the database (prefs-boot.js, put in the page
// by the server), kp-themes' data-kp-remember reads and writes through the
// composite store, so the choices follow the login across devices. Without
// them the call is skipped and localStorage stays as it was.
if (window.chassisPrefs) configureRemember({ storage: window.chassisPrefs.storage });

// The kit's one refresh control and `window.chassisRefresh` [ux-chassis-10];
// after the store above, so the control reads the login's remembered interval.
installRefresh(window, document, { kp: { attachAgo, attachRefresh, refreshOf, setAgo } });

// The themes' registers load on demand: the worn theme's link was written by
// theme-boot.js before first paint; this adopts it and fetches the register of a
// theme the visitor picks (the change is held until the file has loaded). Before
// the pickers, which are what start a change. The pattern is the one the server
// put on theme-boot.js's tag.
const bootTag = document.querySelector('script[data-register-pattern]');
if (bootTag) attachLazyRegisters({ pattern: bootTag.getAttribute('data-register-pattern') });
else console.warn('chassis: theme-boot.js carries no data-register-pattern; a theme the visitor picks will not load its register');

// The theme pickers, the effects and the dialogs are attached by auto.js on
// every page (the layout loads it), so they are not called here; the rest
// below it attaches only where the markup is, and the kit keeps its calls.
enforceContracts();
attachConfirmations();
attachSkipLinks();

// Every <time datetime> on the page is written the kit's one way.
localiseTimes();

// The logout asks before unsent offline edits are lost, on every kit page
// (fix-offline-logout-1): it reads the origin's stored queues, so no page
// has to configure chassisData first.
installLogoutGuard({ win: window, doc: document, confirm: openConfirmation });
