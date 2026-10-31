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
import { Controller, attachOne, controllerOf } from './controller.js';

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

/** One scroll box: focusable, a region, named, and given back exactly as it was found. */
class TableRegionController extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        // What was there before, so detach can put back exactly that —
        // including "there was no attribute", which is not the same as an
        // empty one [KT6, D7].
        this.before = {
            tabindex: host.getAttribute('tabindex'),
            role: host.getAttribute('role'),
            ariaLabel: host.getAttribute('aria-label'),
        };
        /** @type {TableRegionHandle} */
        this.handle = {
            element: host,
            label: () => host.getAttribute('aria-label') ?? '',
            setLabel: (text) => this.setLabel(text),
        };
    }

    connect() {
        const wrap = this.host;
        wrap.dataset[ATTACHED] = '';
        this.own(() => {
            delete wrap.dataset[ATTACHED];
        });
        this.own(() => this.restore());
        wrap.setAttribute('tabindex', '0');
        // A consumer who already gave it a role keeps it: a wrapper that
        // someone made a `group` or a `figure` on purpose is not ours to
        // overrule.
        if (this.before.role === null) wrap.setAttribute('role', 'region');
        this.setLabel(nameFor(wrap, /** @type {Parameters<typeof nameFor>[1]} */ (this.options.label)));
    }

    /** @param {string} text */
    setLabel(text) {
        // aria-labelledby beats aria-label, so a consumer who pointed
        // the wrapper at their own heading keeps that name.
        if (this.host.hasAttribute('aria-labelledby')) return;
        this.host.setAttribute('aria-label', text);
    }

    /** Put back the three attributes as they were found. */
    restore() {
        for (const [attribute, value] of /** @type {[string, string | null][]} */ ([
            ['tabindex', this.before.tabindex],
            ['role', this.before.role],
            ['aria-label', this.before.ariaLabel],
        ])) {
            if (value === null) this.host.removeAttribute(attribute);
            else this.host.setAttribute(attribute, value);
        }
    }
}

/**
 * Make every table's scroll box a named region a keyboard can reach.
 *
 * @param {ParentNode} root
 * @param {{ label?: (wrap: HTMLElement, table: HTMLTableElement | null) => string | undefined, selector?: string }} [options]
 * @returns {(() => void) & { handles: TableRegionHandle[] }} detach
 */
export function attachTableRegions(root = document, { label, selector = WRAP_SELECTOR } = {}) {
    // The root itself is never a wrapper here: only what is under it, as before.
    const made = [...root.querySelectorAll(selector)]
        .map((found) => /** @type {HTMLElement} */ (found))
        .filter((wrap) => !(wrap.dataset[ATTACHED] !== undefined || controllerOf(wrap, TableRegionController)) && !wrap.matches(OPT_OUT))
        .map((wrap) => attachOne(wrap, TableRegionController, { label }))
        .filter((controller) => controller !== undefined);
    const detach = () => {
        for (const controller of made) controller.destroy();
    };
    return Object.assign(detach, { handles: made.map((controller) => controller.handle) });
}
