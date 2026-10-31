// Attach everything, once, when the document is ready [KT6].
//
// The one file in js/ that is allowed a side effect, and it says so in
// package.json. Every other module is pure since 3.0.0: importing it
// does nothing, and a consumer calls attachX() when the markup is there.
// This entry is for the consumer who wants what 2.x did — one script tag
// and the page comes alive — and it is what kyu and almanac load.
//
//   <script type="module" src="/js/auto.js"></script>
//
// It attaches to the whole document. A consumer who renders parts of a
// page later calls the individual attach functions on that subtree.
//
// Only what the page carries is fetched [scope-115]. Until 6.1.0 this file
// imported every module and called every attach function; each walked the
// document for its own selector and, on a page without that component,
// found nothing — after the browser had downloaded and parsed it. Now the
// document is asked first, one querySelector per module, and a module is
// `import()`ed only when its selector matches. The attach functions are the
// modules' own, untouched; what changes is when their module arrives, so
// `attachAll()` is asynchronous: the detach it returns carries `ready`, a
// promise that resolves once every needed module has attached, and
// `modules`, the names fetched (complete once `ready` resolves: a `late`
// module the others gave work to is asked for after they attached).
//
// Four modules are not asked about, because what they do does not depend on
// markup a load-time check can see (measured over every attach function,
// 2026-09-17): remember restores state before the first frame; overlays
// dismisses toasts made later by `toast()` and watches for popovers added
// later; the theme picker's module keeps a theme chosen in another tab in
// step; effects arms its attribute on the root, which every register
// styles, and acts on theme knobs rather than on markup.
//
// The selectors below are each attach function's own. tests/auto-lazy.spec.mjs
// opens every page that loads this file twice — as it is, and with the eager
// entry of 6.1.0 served in its place — and the markup must come out the same.
//
// The table of selectors is js/auto/page.js, dashboard.js and widgets.js (joined in needs.js, in the order they attach in); the
// load itself is one AutoLoader per root (js/auto/loader.js); the parts are listed in js/README.md.

import { applyStoredTheme } from './no-flash.js';
import { applyTheme } from './theme-core.js';
import { THEMES } from './theme-registry.js';
import { restoreRemembered } from './remember.js';
import { AutoLoader } from './auto/loader.js';
import { applyStoredCalm } from './calm.js';

export { NEEDS } from './auto/needs.js';

/**
 * @typedef {object} Need
 * @property {string} name the module, as `detach.modules` reports it
 * @property {string} when every selector through which the module's attach functions act
 * @property {() => Promise<any>} load
 * @property {(module: any, root: ParentNode) => unknown[]} attach
 * @property {boolean} [late] attaches after every other module the same attachAll() fetched, and is asked for then
 */

/** Set on <html> once the boot's `attachAll()` has attached everything the page needed: the names fetched, space-separated. */
export const READY_ATTRIBUTE = 'data-kp-auto-ready';

/**
 * Attach every behaviour under `root`, fetching only the modules it needs.
 * Returns one detach for all of it; `ready` resolves once every needed
 * module has attached, and `modules` names what was fetched.
 *
 * @param {ParentNode} [root]
 * @returns {(() => void) & { ready: Promise<void>, modules: string[] }}
 */
export function attachAll(root = document) {
    return new AutoLoader(root).start();
}

if (typeof document !== 'undefined') {
    applyStoredTheme();
    // Calm mode is kept per device and goes back on the root before the first frame [kpadopt5].
    applyStoredCalm();
    // The same moment, for the same reason: this module is deferred, so it
    // runs after the parse and before the first frame. A state restored at
    // DOMContentLoaded instead would be a state the reader saw flip.
    restoreRemembered();
    // `?theme=<name>` picks a theme for this load without storing it
    // [AR42], on a page that opts in with `data-kp-theme-from-query` on
    // <html>: the concept demo is one page rendered under every theme, and
    // its index links `concept.html?theme=<name>` for all twenty-four so
    // Kenny opens a URL rather than a picker. Opt-in, because a consumer's
    // dashboard honouring a query parameter it never asked for is scope
    // creep (the critic's objection). An unknown name is ignored; the
    // stored theme stands.
    if (document.documentElement.hasAttribute('data-kp-theme-from-query')) {
        try {
            const wanted = new URLSearchParams(location.search).get('theme');
            if (wanted !== null && THEMES.some((theme) => theme.name === wanted)) applyTheme(wanted);
        } catch {
            // No location (a non-browser document): nothing to read.
        }
    }
    const start = () => {
        const attached = attachAll();
        attached.ready.then(() => document.documentElement.setAttribute(READY_ATTRIBUTE, attached.modules.join(' ')));
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
}
