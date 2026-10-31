// Painting a remembered state back: the ids the painters read (sidenav groups, tree items, columns), one painter per
// component, and painting every remembering element of a page before it draws.

import { ALIASES, REMEMBER_ATTRIBUTE, memoryFor } from './store.js';

/** @typedef {import('../remember.js').Memory} Memory */
/** @typedef {import('../remember.js').Remembered} Remembered */

/**
 * The groups of one side navigation, each with the id its state is kept
 * under: its own `data-kp-remember`, else the words in its toggle, else its
 * place in the panel. Exported so the module writes the same ids the
 * painter reads.
 *
 * @param {Element} panel
 * @returns {{ group: Element, toggle: Element | null, id: string }[]}
 */
export function sidenavGroups(panel) {
    return [...panel.querySelectorAll('.kp-sidenav__category')].map((group, at) => {
        const toggle = group.querySelector('.kp-sidenav__category-toggle');
        const own = group.getAttribute(REMEMBER_ATTRIBUTE);
        const words = (toggle?.textContent ?? '').trim();
        return { group, toggle, id: own !== null && own !== '' ? own : words !== '' ? words : String(at) };
    });
}

/**
 * A tree item's id, the same rule js/structure.js uses for its handle.
 *
 * @param {Element} item
 * @returns {string}
 */
export function treeItemId(item) {
    return /** @type {HTMLElement} */ (item).dataset.kpItem ?? item.id ?? (item.textContent ?? '').trim();
}

/**
 * A column's id: the field it names, else the words in its header. An
 * index would have been shorter and wrong — the data table inserts columns
 * of controls of its own, so the third column in the markup is not the
 * third column the module counts.
 *
 * @param {Element} header
 * @returns {string}
 */
export function columnId(header) {
    return /** @type {HTMLElement} */ (header).dataset.kpField ?? (header.textContent ?? '').trim();
}

/** @param {Element} element @returns {HTMLTableCellElement[]} */
const headersOf = (element) => [...(element.querySelector('table')?.tHead?.rows[0]?.cells ?? [])];

/** @param {unknown} value @returns {value is Record<string, boolean>} */
const isFlags = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** @param {Element} panel @param {Memory} memory */
function paintSidenav(panel, memory) {
    const open = memory.read('open', null);
    if (typeof open === 'boolean') panel.setAttribute('data-kp-sidenav-open', String(open));
    const rail = memory.read('rail', null);
    if (typeof rail === 'boolean') panel.toggleAttribute('data-kp-sidenav-slim-collapsed', rail);
    // A width the reader dragged to, kept only for a panel that can be dragged;
    // js/sidenav.js clamps it between the panel's own limits.
    const width = memory.read('width', null);
    if (typeof width === 'number' && panel.hasAttribute('data-kp-sidenav-resizable') && panel instanceof HTMLElement)
        panel.style.setProperty('--kp-sidenav-width', `${width}px`);
    const groups = memory.read('groups', null);
    if (!isFlags(groups)) return;
    for (const { group, toggle, id } of sidenavGroups(panel)) {
        const state = groups[id];
        if (typeof state !== 'boolean') continue;
        group.toggleAttribute('data-kp-sidenav-expanded', state);
        toggle?.setAttribute('aria-expanded', String(state));
    }
}

/** @param {Element} element @param {Memory} memory */
export function paintDisclosure(element, memory) {
    const open = memory.read('open', null);
    if (typeof open === 'boolean') element.toggleAttribute('open', open);
}

/** @param {Element} tree @param {Memory} memory */
function paintTree(tree, memory) {
    const branches = memory.read('branches', null);
    if (!isFlags(branches)) return;
    for (const item of tree.querySelectorAll('[role="treeitem"][aria-expanded]')) {
        const state = branches[treeItemId(item)];
        if (typeof state === 'boolean') item.setAttribute('aria-expanded', String(state));
    }
}

/** @param {Element} split @param {Memory} memory */
function paintSplit(split, memory) {
    const value = memory.read('value', null);
    const separator = split.querySelector('[role="separator"]');
    if (typeof value !== 'number' || !Number.isFinite(value) || separator === null) return;
    // aria-valuenow is where js/structure.js reads the starting position,
    // so painting it is the whole restore: the module does the clamping.
    separator.setAttribute('aria-valuenow', String(Math.round(value)));
    /** @type {HTMLElement} */ (split).style.setProperty('--kp-split', `${Math.round(value)}%`);
}

/** @param {Element} wrap @param {Memory} memory */
function paintDatatable(wrap, memory) {
    const density = memory.read('density', null);
    if (density === 'compact') wrap.setAttribute('data-density', 'compact');
    else if (density === 'comfortable') wrap.removeAttribute('data-density');

    const headers = headersOf(wrap);
    // Read as unknown and narrowed here: what came back was written by a
    // page that may be older than this build, so its shape is a question.
    const columns = /** @type {unknown} */ (memory.read('columns', null));
    if (Array.isArray(columns)) {
        for (const header of headers) header.toggleAttribute('data-kp-column-hidden', columns.includes(columnId(header)));
    }

    const sort = /** @type {unknown} */ (memory.read('sort', null));
    if (!Array.isArray(sort)) return;
    // The module reads `aria-sort` and `data-kp-sort-priority` off the
    // markup when it attaches, which is exactly what a server that rendered
    // a sorted table writes. A remembered sort is the same statement.
    for (const header of headers) {
        if (header.dataset.kpSort === undefined) continue;
        const at = sort.findIndex((/** @type {{ column?: string } | null} */ key) => key?.column === columnId(header));
        if (at === -1) {
            header.setAttribute('aria-sort', 'none');
            delete header.dataset.kpSortPriority;
        } else {
            header.setAttribute('aria-sort', sort[at].direction === 'descending' ? 'descending' : 'ascending');
            header.dataset.kpSortPriority = String(at + 1);
        }
    }
}

/** A dismissible alert that stayed closed [wish-1120, homelab 119]: hidden again, as the dismissal left it. @param {Element} element @param {Memory} memory */
function paintAlert(element, memory) {
    if (memory.read('dismissed', /** @type {boolean} */ (false)) === true) /** @type {HTMLElement} */ (element).hidden = true;
}

/** @type {Record<Remembered, (element: Element, memory: Memory) => void>} */
const PAINTERS = {
    sidenav: paintSidenav,
    disclosure: paintDisclosure,
    tree: paintTree,
    split: paintSplit,
    datatable: paintDatatable,
    // A tour has no markup to paint: js/tour.js reads its memory itself.
    tour: () => {},
    // The refresh chooser and the notification centre read their own memory [kpadopt5-ops].
    refresh: () => {},
    notices: () => {},
    // The claim chips, the availability grid, the time field and the console read their own memory [kpadopt6].
    claim: () => {},
    availability: () => {},
    time: () => {},
    console: () => {},
    // The check-in's progress and the picker's folded list are read by their own modules [kpadopt6].
    'focus-steps': () => {},
    picker: () => {},
    // A dismissible alert that stays closed, `data-kp-remember` on a `.kp-alert`; js/overlays.js writes it on a dismissal [wish-1120].
    alert: paintAlert,
};

/**
 * Put what was remembered back on the element, as markup, and hand the
 * caller the memory to go on writing to. Null when the element asked for
 * no memory or its name was taken.
 *
 * @param {Element} element
 * @param {Remembered} component
 * @param {{ storage?: Storage | null }} [options]
 * @returns {Memory | null}
 */
export function paintRemembered(element, component, options) {
    const memory = memoryFor(element, component, options);
    if (memory !== null) PAINTERS[component](element, memory);
    return memory;
}

/** What each component looks like in markup, for the document-wide pass. @type {[Remembered, string][]} */
const KINDS = [
    ['sidenav', '.kp-sidenav'],
    ['tree', '[data-kp-tree]'],
    ['split', '[data-kp-split]'],
    ['datatable', '[data-kp-datatable]'],
    ['disclosure', 'details'],
    ['alert', '.kp-alert'],
];

/**
 * Paint every remembering element under `root`, before anything attaches
 * and before the first frame. Idempotent: each module paints its own
 * element again when it attaches, so a component rendered later is
 * restored too.
 *
 * @param {ParentNode} [root]
 */
export function restoreRemembered(root = document) {
    const selector = `[${REMEMBER_ATTRIBUTE}], [${ALIASES.sidenav}]`;
    for (const element of root.querySelectorAll(selector)) {
        for (const [component, mark] of KINDS) {
            if (!element.matches(mark)) continue;
            paintRemembered(element, component);
            break;
        }
    }
}

