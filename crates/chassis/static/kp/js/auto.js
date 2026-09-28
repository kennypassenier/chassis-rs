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
// `modules`, the names fetched.
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

import { applyStoredTheme } from './no-flash.js';
import { applyTheme } from './theme-core.js';
import { THEMES } from './theme-registry.js';
import { attachRemembered, restoreRemembered } from './remember.js';
import { attachDialogs, attachDismissals, attachScrollbars, attachTabs, attachTooltips } from './overlays.js';
import { attachThemePickers } from './theme-picker.js';
import { attachEffects } from './effects.js';
import { asOf, presentUnder } from './as-of.js';

/**
 * @typedef {object} Need
 * @property {string} name the module, as `detach.modules` reports it
 * @property {string} when every selector through which the module's attach functions act
 * @property {() => Promise<any>} load
 * @property {(module: any, root: ParentNode) => unknown[]} attach
 */

/** @type {Need[]} */
export const NEEDS = [
    {
        name: 'components',
        when: [
            '[data-kp-contract-error]',
            '[data-kp-destructive]',
            '[data-kp-semantic]',
            '[data-kp-confirm]',
            '.kp-skip-link',
            '[data-kp-skip]',
            '[data-kp-to-top]',
            '[data-kp-nav-toggle]',
            '.kp-nav-wrap--sticky',
            '.kp-nav',
        ].join(', '),
        load: () => import('./components.js'),
        attach: (m, root) => [
            m.enforceContracts(root),
            m.attachConfirmations(root),
            m.attachSkipLinks(root),
            m.attachToTop(root),
            m.attachNavToggles(root),
            m.attachStickyNavs(root),
            m.attachNavMenus(root),
        ],
    },
    { name: 'sidenav', when: '.kp-sidenav', load: () => import('./sidenav.js'), attach: (m, root) => [m.attachSidenavs(root)] },
    { name: 'alarm', when: '[data-kp-alarm]', load: () => import('./alarm.js'), attach: (m, root) => [m.attachAlarms(root)] },
    {
        name: 'combobox',
        when: '[data-kp-combobox], select',
        load: () => import('./combobox.js'),
        attach: (m, root) => [m.attachComboboxes(root), m.attachSelects(root)],
    },
    {
        name: 'palette',
        when: '[data-kp-palette], [data-kp-shortcuts]',
        load: () => import('./palette.js'),
        attach: (m, root) => [m.attachPalettes(root)],
    },
    { name: 'datatable', when: '[data-kp-datatable]', load: () => import('./datatable.js'), attach: (m, root) => [m.attachDataTables(root)] },
    { name: 'tables', when: '.kp-table-wrap', load: () => import('./tables.js'), attach: (m, root) => [m.attachTableRegions(root)] },
    {
        name: 'forms',
        when: '[data-kp-form], [data-kp-submit], .kp-switch',
        load: () => import('./forms.js'),
        attach: (m, root) => [m.attachForms(root), m.attachSwitches(root)],
    },
    {
        name: 'patterns',
        when: '[data-kp-copy], [data-kp-undo-action]',
        load: () => import('./patterns.js'),
        attach: (m, root) => [m.attachPatterns(root)],
    },
    {
        name: 'structure',
        when: '[data-kp-tree], [data-kp-reorder], [data-kp-split]',
        load: () => import('./structure.js'),
        attach: (m, root) => [m.attachStructure(root)],
    },
    { name: 'datepicker', when: '[data-kp-datepicker]', load: () => import('./datepicker.js'), attach: (m, root) => [m.attachDatePickers(root)] },
    { name: 'upload', when: '[data-kp-upload]', load: () => import('./upload.js'), attach: (m, root) => [m.attachUploads(root)] },
    { name: 'wizard', when: '[data-kp-wizard]', load: () => import('./wizard.js'), attach: (m, root) => [m.attachWizards(root)] },
    { name: 'colorpicker', when: '[data-kp-colorpicker]', load: () => import('./colorpicker.js'), attach: (m, root) => [m.attachColorPickers(root)] },
    { name: 'gridlayout', when: '[data-kp-grid]', load: () => import('./gridlayout.js'), attach: (m, root) => [m.attachGrids(root)] },
    { name: 'log', when: '[data-kp-source]', load: () => import('./log.js'), attach: (m, root) => [m.attachLogs(root)] },
];

/** Set on <html> once the boot's `attachAll()` has attached everything the page needed: the names fetched, space-separated. */
export const READY_ATTRIBUTE = 'data-kp-auto-ready';

/** @param {ParentNode} root @param {string} selector */
const carries = (root, selector) => (root instanceof Element && root.matches(selector)) || root.querySelector(selector) !== null;

/**
 * Attach every behaviour under `root`, fetching only the modules it needs.
 * Returns one detach for all of it; `ready` resolves once every needed
 * module has attached, and `modules` names what was fetched.
 *
 * @param {ParentNode} [root]
 * @returns {(() => void) & { ready: Promise<void>, modules: string[] }}
 */
export function attachAll(root = document) {
    // Before every attach: what a reader chose last time goes back onto the
    // markup, and each module then reads the markup it always read
    // [js/remember.js]. A subtree rendered after the boot is restored here.
    restoreRemembered(root);
    /** @type {unknown[]} */
    const detaches = [
        attachRemembered(root),
        attachDialogs(root),
        attachDismissals(root),
        attachTooltips(root),
        attachScrollbars(root),
        attachTabs(root),
        attachThemePickers(root),
    ];
    // The effects handle is an object rather than a function [AR34]; its
    // detach is called with the others.
    const effects = attachEffects(/** @type {Document | Element} */ (root));
    // Taken after the attaches above, so an element one of them added counts
    // as there, as it did when every module attached in one pass.
    const present = presentUnder(root);
    let detached = false;
    /** @type {string[]} */
    const modules = [];
    /** @type {Promise<void>[]} */
    const pending = [];
    for (const need of NEEDS) {
        if (!carries(root, need.when)) continue;
        modules.push(need.name);
        pending.push(
            need.load().then((module) => {
                // Detached before the module arrived: attach nothing.
                if (detached) return;
                detaches.push(...asOf(root, present, () => need.attach(module, root)));
            }),
        );
    }
    const detach = () => {
        detached = true;
        for (const one of detaches) if (typeof one === 'function') one();
        effects.detach();
    };
    return Object.assign(detach, { ready: Promise.all(pending).then(() => undefined), modules });
}

if (typeof document !== 'undefined') {
    applyStoredTheme();
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
