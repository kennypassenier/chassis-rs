// The kp-themes runtime every page of a project's web app needs, loaded by
// the kit itself: the web-app file server puts a <script type="module"> for
// this file in every HTML page it serves (WebApp::without_kit_runtime() opts
// out), so an app cannot forget it. Without it the dark theme's background
// glow did not follow the pointer (Medicine Cabinet, Kenny 2026-10-30).
//
// Only what is page-global and safe on any markup is attached here: the
// effects (they act on elements carrying kp hooks and on the document root)
// and the remembered-choice store. Theme pickers, confirmations, contracts
// and skip links stay with the pages that ask for them (boot-kit.js, or the
// app's own code): they rewrite or demand specific markup.
//
// Idempotent per page: `window.chassisRuntime` marks the first load, so the
// same module under another URL (?v=…) or a second tag does nothing.

import { configureRemember } from '../kp/dist/kp-themes.min.js';
import { attachKitEffects } from './kit-effects.js';
import { registerPwa } from './pwa-register.js';
import { followThemeColor } from './theme-color.js';
import { installPush } from './push.js';
import { installRefresh } from './refresh-kit.js';

/**
 * Install the runtime on `win`/`doc` unless it is already there. The attach
 * functions are injectable for the node test. Returns the runtime handle.
 */
export function installRuntime(win, doc, deps = {}) {
    if (win.chassisRuntime) return win.chassisRuntime;
    const remember = deps.configureRemember ?? configureRemember;
    const attach = deps.attachKitEffects ?? attachKitEffects;
    // With preferences in the database (prefs-boot.js, put in the page by the
    // server) data-kp-remember follows the login across devices; without
    // them localStorage stays as it was.
    if (win.chassisPrefs) remember({ storage: win.chassisPrefs.storage });
    // The kit's one refresh control and `window.chassisRefresh` (ux-chassis-10):
    // after the store above, so the control reads the login's remembered interval.
    (deps.installRefresh ?? installRefresh)(win, doc);
    const effects = attach(doc);
    // An installable app (feat-webapp-4) links the kit's manifest; only then
    // does the page register the service worker.
    (deps.registerPwa ?? registerPwa)(win, doc);
    // ... and its status bar follows the theme from then on.
    (deps.followThemeColor ?? followThemeColor)(win, doc);
    // Web Push (habits-push-1): `window.chassisPush`, only on a page the
    // server marked with the push meta tag.
    (deps.installPush ?? installPush)(win, doc);
    win.chassisRuntime = { get effects() { return effects.current(); } };
    return win.chassisRuntime;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    installRuntime(window, document);
}
