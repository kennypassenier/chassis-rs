// Attaches the kp-themes behaviours every kit page uses (theme picker,
// contracts, confirmations, effects, skip links) and routes remembered
// choices through the database-backed store when the server provides it.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { attachThemePickers, enforceContracts, attachConfirmations, attachSkipLinks, attachAgo, attachEffects, attachRefresh, configureRemember, refreshOf, setAgo } from '../kp/dist/js/index.js';
import { attachLazyRegisters } from '../kp/dist/js/lazy-register.js';
import { attachKitEffects } from './kit-effects.js';
import { localiseTimes } from './format-text.js';
import { installRefresh } from './refresh-kit.js';

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

attachThemePickers();
enforceContracts();
attachConfirmations();
// The effects (and the one-time caret re-attach) are shared with the web
// apps' runtime: see kit-effects.js.
attachKitEffects(document, attachEffects);

attachSkipLinks();

// Every <time datetime> on the page is written the kit's one way.
localiseTimes();
