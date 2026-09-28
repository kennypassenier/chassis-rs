// Remembered state [Kenny, 2026-09-16].
//
// Kenny, after closing a group in the review site's side navigation and
// following a link: "de sidenav moet zijn state onthouden, ik heb bv de
// components dropdown gesloten en klik op een link, dan moet die nog altijd
// dicht zijn. Dit gedrag moet tellen voor alle elementen waar dit verwacht
// wordt door een user." And, in the same breath: "en die key in localStorage
// moet niet hardcoded zijn, stel dat we twee van dezelfde elementen naast
// mekaar op de pagina willen ofzo".
//
// So: ONE mechanism, the way js/theme-core.js is the one place the theme is
// remembered, and a key that comes from the element rather than from the
// module.
//
// ## The key
//
//     <prefix>:<component>:<name>:<slot>
//     kp-remember:sidenav:main-nav:groups
//
//   · prefix     `kp-remember`, settable once with configureRemember() so a
//                consumer can park everything this package writes under a
//                namespace of their own.
//   · component  the package's name for the KIND of thing — `sidenav`,
//                `disclosure`, `tree`, `split`, `datatable`. The module
//                supplies it; an author never writes it. Two different
//                components may carry the same name without colliding.
//   · name       the value of `data-kp-remember` on the element, verbatim.
//                No attribute, no memory: remembering is opt-in, and a page
//                that never asks for it gets nothing written into its
//                storage — the same promise `data-kp-sidenav-remember` made
//                before this file existed.
//   · slot       which piece of that component's state: `open`, `rail`,
//                `groups`, `value`, `branches`, `columns`, `sort`,
//                `density`. One entry per slot rather than one blob, so a
//                component that grows a state does not invalidate the four
//                it already had.
//
// **The page is deliberately not in the key.** Kenny's case IS a
// navigation: a group he closed must still be closed on the page the link
// led to, so the state has to cross pages inside the origin. An author who
// wants a per-page memory gives the element a per-page name — which is
// exactly what naming it from the element buys.
//
// ## Two of the same thing on one page
//
// Two elements of the same component with the same name are a fault, not a
// feature: they would mirror each other's state, which is the bug the name
// exists to prevent. So the FIRST element to ask owns the key; a second one
// is refused a memory entirely — it works, at its markup default, and
// writes nothing — and the clash is said out loud once, in the console and
// as `kp-remember-clash` on the element that was refused. Two of the same
// component with DIFFERENT names keep separate state, which is the whole
// point of the attribute.
//
// ## Before first paint
//
// The memory paints MARKUP, and the components go on reading markup. That
// is the trick that keeps this one mechanism: `paintRemembered()` writes
// the stored state onto the element as the attributes an author could have
// written by hand — `data-kp-sidenav-expanded`, `aria-sort`, `open`,
// `aria-valuenow` — and every module then does what it always did, which is
// read its own markup. `restoreRemembered()` does that pass for a whole
// document at module-evaluation time (js/auto.js calls it beside
// applyStoredTheme(), for the same reason), so nothing paints the wrong
// state first and snaps.
//
// ## When there is no storage
//
// Every read and every write is in a try/catch, and the property access
// itself is too: a browser set to refuse site data throws on
// `globalThis.localStorage` rather than returning null. No storage means no
// memory, never a broken component.

import { getStrings } from './strings.js';

/** The attribute an author writes to ask for a memory. A contract value [TH26]. */
export const REMEMBER_ATTRIBUTE = 'data-kp-remember';

/** Fired on the element that was refused a memory because its name was taken: `{ name, component, other }`. */
export const REMEMBER_CLASH_EVENT = 'kp-remember-clash';

/** The first segment of every key this package writes. */
export const REMEMBER_PREFIX = 'kp-remember';

/**
 * The kinds of state this package remembers.
 *
 * @typedef {'sidenav' | 'disclosure' | 'tree' | 'split' | 'datatable'} Remembered
 */

/**
 * A memory for one element.
 *
 * @typedef {object} Memory
 * @property {string} name the name the element gave itself
 * @property {(slot: string) => string} key the composed storage key, so a consumer can read or clear it themselves [KT6]
 * @property {<T>(slot: string, fallback: T) => T} read
 * @property {(slot: string, value: unknown) => boolean} write whether it will survive a reload
 * @property {(slot: string) => void} forget
 */

/** @typedef {{ prefix?: string, storage?: Storage | null }} RememberConfig */

/** The document-wide defaults, settable once by a consumer. */
const config = { prefix: REMEMBER_PREFIX, storage: /** @type {Storage | null | undefined} */ (undefined) };

/**
 * Set the defaults once: the first key segment, and where the values go.
 * `storage: null` turns the whole mechanism off without touching a
 * component — the way out KT6 asks for.
 *
 * @param {RememberConfig} next
 */
export function configureRemember(next) {
    if (next.prefix !== undefined) config.prefix = next.prefix;
    if (next.storage !== undefined) config.storage = next.storage;
}

/**
 * localStorage where there is one, null where reaching it throws.
 *
 * @param {Storage | null | undefined} given what this call was handed
 * @returns {Storage | null}
 */
function storage(given) {
    if (given !== undefined) return given;
    if (config.storage !== undefined) return config.storage;
    try {
        return globalThis.localStorage ?? null;
    } catch {
        // A browser set to refuse site data throws on the property itself.
        return null;
    }
}

/**
 * The older spelling each component accepts, so markup written before this
 * file existed keeps its memory. The name is the same; the key it composes
 * is the one above.
 *
 * @type {Partial<Record<Remembered, string>>}
 */
const ALIASES = { sidenav: 'data-kp-sidenav-remember' };

/**
 * The name an element gave itself, or null when it asked for nothing.
 *
 * @param {Element} element
 * @param {Remembered} component
 * @returns {string | null}
 */
export function rememberedName(element, component) {
    const own = element.getAttribute(REMEMBER_ATTRIBUTE);
    if (own !== null && own !== '') return own;
    const alias = ALIASES[component];
    const older = alias === undefined ? null : element.getAttribute(alias);
    return older === null || older === '' ? null : older;
}

/** Who holds each `<component>:<name>` on this page. @type {Map<string, Element>} */
const claims = new Map();
/** Clashes already reported, so a render loop cannot shout. @type {Set<string>} */
const reported = new Set();

/**
 * Drop every claim. For a test, and for a consumer who tears a page down
 * and builds it again inside one document [KT6].
 */
export function forgetClaims() {
    claims.clear();
    reported.clear();
}

/**
 * @param {Element} element
 * @param {Remembered} component
 * @param {string} name
 * @param {Element} other
 */
function reportClash(element, component, name, other) {
    const claim = `${component}:${name}`;
    if (!reported.has(claim)) {
        reported.add(claim);
        console.warn(getStrings().rememberClash(name, component));
    }
    element.dispatchEvent(new CustomEvent(REMEMBER_CLASH_EVENT, { bubbles: true, detail: { name, component, other } }));
}

/**
 * The memory for one element, or null when it asked for none — and null
 * too when another element of the same component already answers to that
 * name, because two of them sharing one key is the fault the name prevents.
 *
 * @param {Element} element
 * @param {Remembered} component
 * @param {{ storage?: Storage | null }} [options] where the values go, for this element alone
 * @returns {Memory | null}
 */
export function memoryFor(element, component, { storage: given } = {}) {
    const name = rememberedName(element, component);
    if (name === null) return null;
    const claim = `${component}:${name}`;
    const holder = claims.get(claim);
    // A holder that has left the document releases its claim: a page that
    // rebuilds its navigation must not lose the memory to its own ghost.
    if (holder !== undefined && holder !== element && holder.isConnected) {
        reportClash(element, component, name, holder);
        return null;
    }
    claims.set(claim, element);
    const key = (/** @type {string} */ slot) => `${config.prefix}:${component}:${name}:${slot}`;
    return {
        name,
        key,
        read: (slot, fallback) => {
            const store = storage(given);
            if (store === null) return fallback;
            try {
                const raw = store.getItem(key(slot));
                if (raw === null) return fallback;
                return JSON.parse(raw);
            } catch {
                // No storage, or a value somebody else wrote: no memory is
                // a valid answer, and a broken one is the same answer.
                return fallback;
            }
        },
        write: (slot, value) => {
            const store = storage(given);
            if (store === null) return false;
            try {
                store.setItem(key(slot), JSON.stringify(value));
                return true;
            } catch {
                // A full or refused quota loses the memory, never the component.
                return false;
            }
        },
        forget: (slot) => {
            const store = storage(given);
            if (store === null) return;
            try {
                store.removeItem(key(slot));
            } catch {
                /* nothing to forget */
            }
        },
    };
}

/* ------------------------------------------------------------ painters */

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
function paintDisclosure(element, memory) {
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

/** @type {Record<Remembered, (element: Element, memory: Memory) => void>} */
const PAINTERS = {
    sidenav: paintSidenav,
    disclosure: paintDisclosure,
    tree: paintTree,
    split: paintSplit,
    datatable: paintDatatable,
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

/**
 * Wire the disclosures that remember — a `<details data-kp-remember>`, the
 * accordion's own element. Every other component writes its state from its
 * own module; a `<details>` has no module, so this is it.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachRemembered(root = document) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    for (const element of root.querySelectorAll(`details[${REMEMBER_ATTRIBUTE}]`)) {
        const details = /** @type {HTMLDetailsElement} */ (element);
        if (details.dataset.kpRememberAttached !== undefined) continue;
        details.dataset.kpRememberAttached = '';
        const memory = paintRemembered(details, 'disclosure');
        if (memory === null) {
            delete details.dataset.kpRememberAttached;
            continue;
        }
        const onToggle = () => memory.write('open', details.open);
        details.addEventListener('toggle', onToggle);
        cleanups.push(() => {
            details.removeEventListener('toggle', onToggle);
            delete details.dataset.kpRememberAttached;
        });
    }
    return () => {
        for (const cleanup of cleanups) cleanup();
    };
}
