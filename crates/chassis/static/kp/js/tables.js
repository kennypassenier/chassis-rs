// The table's scrolling region, framework-free [TH95].
//
// **The defect this closes.** `.kp-table-wrap` has scrolled a wide table
// inside its own box since L4 — the page does not scroll sideways, which
// is what DI11 and SC 1.4.10 ask for. But the box was a bare `<div>`: no
// `tabindex`, so it was never in the tab order, and someone who cannot
// use a mouse could not reach the scrollbar at all. The columns past the
// fold were simply gone for them. Shipped in every release up to 3.1.1,
// in four places — components/table.jsx, components/datatable.jsx and two
// specimens in the showcase — and no gate could see it, because nothing
// in the package asserted the wrapper was operable.
//
// Chromium and Firefox have since started focusing scroll containers by
// themselves, which softens it but does not repair it: the region still
// has no role and no name, so a reader who lands there is told "group"
// or nothing at all rather than which table they are in.
//
//   <div class="kp-table-wrap">          ← this is what gets upgraded
//     <table class="kp-table">
//       <caption>Quarterly revenue</caption>   ← and this is the name
//       …
//
// The name is a knob at every level [KT6, KT5]: `data-kp-region-label` on
// the wrapper, a `label` callback in the options, the table's own caption,
// and only then the dictionary's `tableRegion`. No sentence is written
// into this file.
//
// Pure, like every other module in js/ since 3.0.0: importing it does
// nothing. `attachTableRegions()` upgrades what is there and returns a
// detach that puts every attribute back exactly as it was found.

import { getStrings } from './strings.js';

/** The wrapper this module upgrades. A contract value [TH26]. */
export const WRAP_SELECTOR = '.kp-table-wrap';

/** Written on a wrapper once it has been upgraded, so a second pass skips it. */
const ATTACHED = 'kpRegionAttached';

/** A wrapper the consumer keeps out of it: `data-kp-region="off"`. */
export const OPT_OUT = '[data-kp-region="off"]';

/** @typedef {{ element: HTMLElement, label: () => string, setLabel: (text: string) => void }} TableRegionHandle */

/**
 * The name for one wrapper, in the order a consumer expects to win.
 *
 * @param {HTMLElement} wrap
 * @param {((wrap: HTMLElement, table: HTMLTableElement | null) => string | undefined) | undefined} label
 * @returns {string}
 */
function nameFor(wrap, label) {
    const table = /** @type {HTMLTableElement | null} */ (wrap.querySelector('table'));
    const own = wrap.dataset.kpRegionLabel;
    if (own !== undefined && own !== '') return own;
    const given = label?.(wrap, table);
    if (given !== undefined && given !== '') return given;
    const caption = (table?.caption?.textContent ?? '').trim();
    if (caption !== '') return caption;
    return getStrings().tableRegion;
}

/**
 * Make every table's scroll box a named region a keyboard can reach.
 *
 * @param {ParentNode} root
 * @param {{ label?: (wrap: HTMLElement, table: HTMLTableElement | null) => string | undefined, selector?: string }} [options]
 * @returns {(() => void) & { handles: TableRegionHandle[] }} detach
 */
export function attachTableRegions(root = document, { label, selector = WRAP_SELECTOR } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    /** @type {TableRegionHandle[]} */
    const created = [];

    for (const element of root.querySelectorAll(selector)) {
        const wrap = /** @type {HTMLElement} */ (element);
        if (wrap.dataset[ATTACHED] !== undefined) continue;
        if (wrap.matches(OPT_OUT)) continue;
        wrap.dataset[ATTACHED] = '';

        // What was there before, so detach can put back exactly that —
        // including "there was no attribute", which is not the same as an
        // empty one [KT6, D7].
        const before = {
            tabindex: wrap.getAttribute('tabindex'),
            role: wrap.getAttribute('role'),
            ariaLabel: wrap.getAttribute('aria-label'),
        };

        wrap.setAttribute('tabindex', '0');
        // A consumer who already gave it a role keeps it: a wrapper that
        // someone made a `group` or a `figure` on purpose is not ours to
        // overrule.
        if (before.role === null) wrap.setAttribute('role', 'region');

        /** @param {string} text */
        const setLabel = (text) => {
            // aria-labelledby beats aria-label, so a consumer who pointed
            // the wrapper at their own heading keeps that name.
            if (wrap.hasAttribute('aria-labelledby')) return;
            wrap.setAttribute('aria-label', text);
        };
        setLabel(nameFor(wrap, label));

        created.push({
            element: wrap,
            label: () => wrap.getAttribute('aria-label') ?? '',
            setLabel,
        });

        cleanups.push(() => {
            for (const [attribute, value] of /** @type {[string, string | null][]} */ ([
                ['tabindex', before.tabindex],
                ['role', before.role],
                ['aria-label', before.ariaLabel],
            ])) {
                if (value === null) wrap.removeAttribute(attribute);
                else wrap.setAttribute(attribute, value);
            }
            delete wrap.dataset[ATTACHED];
        });
    }

    const detach = () => {
        for (const cleanup of cleanups) cleanup();
    };
    return Object.assign(detach, { handles: created });
}
