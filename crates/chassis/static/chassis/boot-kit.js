// Attaches the kp-themes behaviours every kit page uses (theme picker,
// contracts, confirmations, effects, skip links) and routes remembered
// choices through the database-backed store when the server provides it.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { attachThemePickers } from '../kp/js/theme-picker.js';
import { enforceContracts, attachConfirmations, attachSkipLinks } from '../kp/js/components.js';
import { attachKitEffects } from './kit-effects.js';
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
// The effects (and the one-time caret re-attach) are shared with the web
// apps' runtime: see kit-effects.js.
attachKitEffects();

attachSkipLinks();

// Every <time datetime> on the page is written the kit's one way.
localiseTimes();
