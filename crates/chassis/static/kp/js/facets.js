// The facet list: checkbox rows with a count and an "only" button
// [kpadopt2-tiles; the dashboard's `hl-opt`, the host log's Source and Level].
//
// Narrowing a list by one property (the source of a log line, a level, a
// status) is a column of checkboxes, each with how many items it would show,
// and a shortcut for the most common move: "only this one".
//
//   <div class="kp-facets" data-kp-facets data-kp-facets-all="Everything" role="group" aria-label="Source">
//     <ul class="kp-facets__list"></ul>
//     <p class="kp-facets__empty" hidden>No sources yet.</p>
//   </div>
//
//   setFacetItems(group, [{ value: 'HOST', label: 'Host', count: 120 }, …]);
//   group.addEventListener('kp-facet-change', (e) => show(e.detail.values));
//
// The rows are made by setFacetItems(), or written by hand as
// `li.kp-facet[data-value]` (see css/components.css for the parts): either way
// attachFacets() wires them.
//
// What it does:
//   - Each row is a real checkbox in a `<label>`; the "only" button is a
//     sibling of the label, never inside it (a control inside a label is a
//     second, hidden target). The checkbox is named by the row's name and
//     described by its count; "only" says which row it is for.
//   - "only" selects that row and unchecks every other; the "Everything" row
//     (`data-kp-facets-all`) checks every row, and shows a mixed state
//     (`indeterminate`) while only some are on.
//   - setFacetItems() reconciles by value and changes the rows in place: a row
//     that was there keeps its focus and its state, a new one is inserted at
//     its place, a gone one is removed. Nothing is rebuilt, so a log that
//     brings a new source every second never takes the keyboard away.
//   - A visually hidden `role="status"` region after the group says "Showing
//     only Host" or "Showing everything" after an "only" or an "Everything".
//
//   - A swatch can carry an identity pattern as well as a hue [kpadopt3]: the
//     item's `pattern` (or `data-kp-facet-pattern` on a hand-written
//     `.kp-facet__swatch`) is a seed, a name, from which a 5 by 5 pattern
//     mirrored about its middle column is drawn over the swatch's colour, the
//     same for the same name wherever it is drawn (identityCells()). So two
//     sources whose hues are close are still told apart, and the colour never
//     carries the identity alone.
//
// Every word it adds is in js/strings.js. Nothing runs on import.

import { getStrings } from './strings.js';

/** The groups this module looks after. */
export const FACETS = '[data-kp-facets]';
/** Fired on the group, bubbling, when the choice changed: `{ group, values, source: 'toggle' | 'only' | 'all' | 'set', value }`. */
export const FACET_EVENT = 'kp-facet-change';

/**
 * @typedef {object} FacetItem
 * @property {string} value what the row stands for
 * @property {string} label
 * @property {number | string | null} [count] shown at the end of the row; null leaves its place empty
 * @property {string} [swatch] a CSS colour for the small square before the name
 * @property {string} [pattern] a seed (a name) for an identity pattern drawn over the swatch [kpadopt3]; '' takes it away
 * @property {boolean} [checked] a new row is on when absent; a row that is already there keeps its state when absent
 * @property {boolean} [disabled] cannot be turned on or off, and has no "only"
 */

let serial = 0;

/**
 * The cells of an identity pattern: FNV-1a over the seed, then a 5 by 5 grid mirrored about its middle column, a cell
 * filled where its bit is set. Pure and the same everywhere, so a name has one pattern on every page [kpadopt3].
 * @param {string} seed
 * @returns {[number, number][]} filled cells as [column, row], 0 to 4
 */
export function identityCells(seed) {
    let hash = 2166136261;
    for (const ch of seed) hash = Math.imul(hash ^ (ch.codePointAt(0) ?? 0), 16777619);
    hash >>>= 0;
    /** @type {[number, number][]} */
    const cells = [];
    for (let y = 0; y < 5; y += 1)
        for (let x = 0; x < 3; x += 1)
            if ((hash >>> (y * 3 + x + 4)) & 1) {
                cells.push([x, y]);
                if (x < 2) cells.push([4 - x, y]);
            }
    return cells;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Draw (or take away) the identity pattern over a swatch: an SVG of the filled cells in the pattern's ink, inside a
 * one-cell margin, so the swatch's colour stays its ground.
 * @param {HTMLElement} swatch
 * @param {string | null} seed
 */
function drawPattern(swatch, seed) {
    const old = swatch.querySelector(':scope > .kp-facet__pattern');
    if (!seed) {
        old?.remove();
        swatch.removeAttribute('data-kp-facet-pattern');
        return;
    }
    if (old && swatch.getAttribute('data-kp-facet-drawn') === seed) return;
    swatch.setAttribute('data-kp-facet-pattern', seed);
    swatch.setAttribute('data-kp-facet-drawn', seed);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'kp-facet__pattern');
    svg.setAttribute('viewBox', '0 0 7 7');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('shape-rendering', 'crispEdges');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute(
        'd',
        identityCells(seed)
            .map(([x, y]) => `M${x + 1} ${y + 1}h1v1h-1z`)
            .join(''),
    );
    svg.append(path);
    if (old) old.replaceWith(svg);
    else swatch.append(svg);
}

/** @param {string} className @param {string} [tag] */
const el = (className, tag = 'span') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {number | string | null | undefined} count */
const countText = (count) => (typeof count === 'number' ? count.toLocaleString() : (count ?? ''));

/** @param {Element} group @returns {HTMLElement[]} the value rows, in order */
const rowsOf = (group) => /** @type {HTMLElement[]} */ ([...group.querySelectorAll('.kp-facet:not([data-kp-facet-all])')]);

/** @param {Element} row @returns {HTMLInputElement | null} */
const checkOf = (row) => row.querySelector('.kp-facet__check');

/** @param {Element} group @returns {HTMLElement} */
function listOf(group) {
    let list = /** @type {HTMLElement | null} */ (group.querySelector('.kp-facets__list'));
    if (!list) {
        list = el('kp-facets__list', 'ul');
        group.append(list);
    }
    return list;
}

/** @param {Element} row */
const nameOf = (row) => row.querySelector('.kp-facet__name')?.textContent?.trim() ?? '';

/**
 * Give a row its ids, its checkbox's name and description, and its "only"
 * button's name. Safe to run again.
 * @param {HTMLElement} row
 */
function wireRow(row) {
    const check = checkOf(row);
    const swatch = /** @type {HTMLElement | null} */ (row.querySelector('.kp-facet__swatch[data-kp-facet-pattern]'));
    if (swatch) drawPattern(swatch, swatch.getAttribute('data-kp-facet-pattern'));
    const name = row.querySelector('.kp-facet__name');
    const count = row.querySelector('.kp-facet__count');
    serial += 1;
    if (name && !name.id) name.id = `kp-facet-${serial}-name`;
    if (count && !count.id) count.id = `kp-facet-${serial}-count`;
    if (check) {
        if (name) check.setAttribute('aria-labelledby', name.id);
        if (count) check.setAttribute('aria-describedby', count.id);
    }
    const only = row.querySelector('.kp-facet__only');
    if (only && !row.hasAttribute('data-kp-facet-all')) {
        only.setAttribute('aria-label', getStrings().facetOnlyLabel(nameOf(row)));
        if (!only.textContent?.trim()) only.textContent = getStrings().facetOnly;
    }
}

/**
 * Build one row.
 * @param {FacetItem} item
 * @returns {HTMLLIElement}
 */
function buildRow(item) {
    const row = /** @type {HTMLLIElement} */ (el('kp-facet', 'li'));
    row.setAttribute('data-value', item.value);
    const option = el('kp-facet__option', 'label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'kp-field__check kp-facet__check';
    check.checked = item.checked ?? true;
    option.append(check);
    if (item.swatch !== undefined || item.pattern) option.append(el('kp-facet__swatch'));
    option.append(el('kp-facet__name'), el('kp-facet__count'));
    const only = document.createElement('button');
    only.type = 'button';
    only.className = 'kp-button kp-button--ghost kp-button--sm kp-facet__only';
    row.append(option, only);
    paintRow(row, item);
    return row;
}

/**
 * Write a row's text, count and swatch from an item.
 * @param {HTMLElement} row
 * @param {FacetItem} item
 */
function paintRow(row, item) {
    row.querySelector('.kp-facet__name')?.replaceChildren(item.label);
    const count = row.querySelector('.kp-facet__count');
    if (count && item.count !== undefined) count.textContent = String(countText(item.count));
    const swatch = /** @type {HTMLElement | null} */ (row.querySelector('.kp-facet__swatch'));
    if (swatch && item.swatch !== undefined) swatch.style.setProperty('--kp-facet-swatch-colour', item.swatch);
    if (swatch && item.pattern !== undefined) drawPattern(swatch, item.pattern || null);
    const check = checkOf(row);
    if (check) {
        if (item.disabled !== undefined) check.disabled = item.disabled;
        if (item.checked !== undefined) check.checked = item.checked;
    }
    wireRow(row);
}

/**
 * The "Everything" row, made when the group asks for it.
 * @param {Element} group
 * @returns {HTMLElement | null}
 */
function ensureAll(group) {
    const word = group.getAttribute('data-kp-facets-all');
    let row = /** @type {HTMLElement | null} */ (group.querySelector('.kp-facet[data-kp-facet-all]'));
    if (row || word === null) return row;
    row = el('kp-facet', 'li');
    row.setAttribute('data-kp-facet-all', '');
    const option = el('kp-facet__option', 'label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'kp-field__check kp-facet__check';
    option.append(check, el('kp-facet__name'), el('kp-facet__count'));
    row.append(option);
    row.querySelector('.kp-facet__name')?.replaceChildren(word || getStrings().facetAll);
    listOf(group).prepend(row);
    wireRow(row);
    return row;
}

/**
 * Bring the "Everything" row, the empty message and every row's wiring in step.
 * @param {Element} group
 */
function syncGroup(group) {
    const rows = rowsOf(group);
    for (const row of rows) wireRow(row);
    const all = ensureAll(group);
    const on = rows.filter((row) => checkOf(row)?.checked).length;
    const check = all ? checkOf(all) : null;
    if (check) {
        check.checked = rows.length > 0 && on === rows.length;
        check.indeterminate = on > 0 && on < rows.length;
    }
    const empty = group.querySelector('.kp-facets__empty');
    if (empty instanceof HTMLElement) empty.hidden = rows.length > 0;
}

/**
 * The values that are on.
 * @param {Element} group
 * @returns {string[]}
 */
export function getFacetValues(group) {
    return rowsOf(group)
        .filter((row) => checkOf(row)?.checked)
        .map((row) => row.getAttribute('data-value') ?? '');
}

/**
 * @param {Element} group
 * @param {string} source
 * @param {string} [value]
 */
function emit(group, source, value) {
    group.dispatchEvent(new CustomEvent(FACET_EVENT, { bubbles: true, detail: { group, values: getFacetValues(group), source, value } }));
}

/**
 * Turn exactly these values on (every other off); `null` turns all on. The
 * event is not fired: the page that calls this knows.
 *
 * @param {Element} group
 * @param {string[] | null} values
 */
export function setFacetValues(group, values) {
    for (const row of rowsOf(group)) {
        const check = checkOf(row);
        if (check) check.checked = values === null || values.includes(row.getAttribute('data-value') ?? '');
    }
    syncGroup(group);
}

/**
 * Write the counts. `counts` maps a value to its count; a value not in it
 * keeps its count. `all` is the "Everything" row's (the sum of the numbers
 * when absent). The group stops being busy.
 *
 * @param {Element} group
 * @param {Record<string, number | string | null>} counts
 * @param {{ all?: number | string | null }} [options]
 */
export function setFacetCounts(group, counts, { all } = {}) {
    let sum = 0;
    for (const row of rowsOf(group)) {
        const value = row.getAttribute('data-value') ?? '';
        if (Object.hasOwn(counts, value)) row.querySelector('.kp-facet__count')?.replaceChildren(String(countText(counts[value])));
        const shown = Number(row.querySelector('.kp-facet__count')?.textContent?.replace(/\D/g, '') || 0);
        sum += shown;
    }
    const total = group.querySelector('.kp-facet[data-kp-facet-all] .kp-facet__count');
    if (total) total.textContent = String(countText(all === undefined ? sum : all));
    group.removeAttribute('aria-busy');
}

/**
 * Make the rows these items, in this order, changing what is there in place.
 *
 * @param {Element} group
 * @param {FacetItem[]} items
 */
export function setFacetItems(group, items) {
    const list = listOf(group);
    ensureAll(group);
    const existing = new Map(rowsOf(group).map((row) => [row.getAttribute('data-value') ?? '', row]));
    /** @type {HTMLElement | null} the row the next one goes after */
    let previous = /** @type {HTMLElement | null} */ (group.querySelector('.kp-facet[data-kp-facet-all]'));
    for (const item of items) {
        let row = existing.get(item.value);
        if (row) {
            paintRow(row, item);
            existing.delete(item.value);
        } else row = buildRow(item);
        const expected = previous ? previous.nextElementSibling : list.firstElementChild;
        // Insert only when the row is not already where it belongs: a row that stays keeps its focus.
        if (row !== expected) previous ? previous.after(row) : list.prepend(row);
        previous = row;
    }
    for (const gone of existing.values()) gone.remove();
    if (!items.some((item) => item.count !== undefined)) group.removeAttribute('aria-busy');
    syncGroup(group);
}

/**
 * The group's status region, made on first need (right after the group).
 * @param {Element} group
 * @returns {HTMLElement}
 */
function regionOf(group) {
    const next = group.nextElementSibling;
    if (next instanceof HTMLElement && next.classList.contains('kp-facets__live')) return next;
    const region = el('kp-sr-only kp-facets__live');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    group.after(region);
    return region;
}

/**
 * Say something through the group's region.
 * @param {Element} group
 * @param {string} message
 */
function say(group, message) {
    const fresh = !(group.nextElementSibling?.classList.contains('kp-facets__live') ?? false);
    const region = regionOf(group);
    // Cleared first so the same sentence twice in a row is still heard.
    region.textContent = '';
    setTimeout(() => (region.textContent = message), fresh ? 100 : 30);
}

/**
 * Wire every facet group under `root`: the checkboxes, the "only" buttons and
 * the "Everything" row. Rows written later by setFacetItems() are covered
 * because the listeners are on the group.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachFacets(root = document) {
    const groups = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(FACETS) ? [root] : []),
        ...root.querySelectorAll(FACETS),
    ]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const group of groups) {
        syncGroup(group);
        regionOf(group);
        /** @param {Event} event */
        const change = (event) => {
            const check = event.target instanceof HTMLInputElement ? event.target : null;
            const row = check?.closest('.kp-facet');
            if (!check || !row || !group.contains(row)) return;
            if (row.hasAttribute('data-kp-facet-all')) {
                // Everything always means every row on; unchecking it again changes nothing.
                const before = getFacetValues(group).length;
                setFacetValues(group, null);
                say(group, getStrings().facetShowingAll);
                if (before !== rowsOf(group).length) emit(group, 'all');
                return;
            }
            syncGroup(group);
            emit(group, 'toggle', row.getAttribute('data-value') ?? '');
        };
        /** @param {Event} event */
        const press = (event) => {
            const only = event.target instanceof Element ? event.target.closest('.kp-facet__only') : null;
            const row = only?.closest('.kp-facet');
            if (!only || !row || !group.contains(row)) return;
            const value = row.getAttribute('data-value') ?? '';
            setFacetValues(group, [value]);
            say(group, getStrings().facetShowingOnly(nameOf(row)));
            emit(group, 'only', value);
        };
        group.addEventListener('change', change);
        group.addEventListener('click', press);
        undo.push(() => {
            group.removeEventListener('change', change);
            group.removeEventListener('click', press);
        });
    }
    return () => undo.forEach((u) => u());
}
