// The kit runtime's wiring, shared by its two entry files so the logic exists
// once: webapp-runtime.js (the app imports kp-themes' one-file bundle) and
// webapp-runtime-modules.js (the app imports the per-module entries under
// kp/dist/js/ and sets WebApp::kp_modules()). This file imports no kp-themes
// module: each entry hands in the functions from the one copy of kp-themes'
// state its page holds, so the remember store, the refresh strings and the
// effects always belong to the copy the app uses.

import { attachKitEffects } from './kit-effects.js';
import { registerPwa } from './pwa-register.js';
import { followThemeColor } from './theme-color.js';
import { installData } from './data.js';
import { installPush } from './push.js';
import { installRefresh } from './refresh-kit.js';

/**
 * Install the runtime on `win`/`doc` unless it is already there.
 * `kp` is { configureRemember, attachAgo, attachRefresh, refreshOf, setAgo,
 * connectionOf, openConfirmation, openDialog, toast }
 * plus `attachEffects` when the runtime should attach the effects (the bundle
 * variant; the modules variant leaves them to the app's auto.js). The
 * functions in `deps` replace the wiring steps in the node test.
 * Returns the runtime handle.
 */
export function installRuntimeWith(kp, win, doc, deps = {}) {
    if (win.chassisRuntime) return win.chassisRuntime;
    const remember = deps.configureRemember ?? kp.configureRemember;
    const attach = deps.attachKitEffects
        ?? (kp.attachEffects ? (d) => attachKitEffects(d, kp.attachEffects) : () => ({ current: () => null }));
    // With preferences in the database (prefs-boot.js, put in the page by the
    // server) data-kp-remember follows the login across devices; without
    // them localStorage stays as it was.
    if (win.chassisPrefs) remember({ storage: win.chassisPrefs.storage });
    // The kit's one refresh control and `window.chassisRefresh` (ux-chassis-10):
    // after the store above, so the control reads the login's remembered interval.
    (deps.installRefresh ?? ((w, d) => installRefresh(w, d, { kp })))(win, doc);
    const effects = attach(doc);
    // An installable app (feat-webapp-4) links the kit's manifest; only then
    // does the page register the service worker.
    (deps.registerPwa ?? registerPwa)(win, doc);
    // ... and its status bar follows the theme from then on.
    (deps.followThemeColor ?? followThemeColor)(win, doc);
    // Web Push (habits-push-1): `window.chassisPush`, only on a page the
    // server marked with the push meta tag.
    (deps.installPush ?? installPush)(win, doc);
    // Offline app data (feat-offline-1): `window.chassisData`, inert until the
    // app calls `configure()`. It gets the band and toast functions of the
    // same copy of kp-themes' state as everything above.
    (deps.installData ?? ((w, d) => installData(w, d, {}, kp)))(win, doc);
    win.chassisRuntime = { get effects() { return effects.current(); } };
    return win.chassisRuntime;
}
