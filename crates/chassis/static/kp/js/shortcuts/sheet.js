// The help sheet: its body written from the registry, in groups of rows.

import { getStrings } from '../strings.js';
import { available, scopeActive } from './entries.js';
import { displayShortcutKeys } from './keys.js';

/** @typedef {import('./board.js').ShortcutBoard} ShortcutBoard */
/** @typedef {{ keys: string, what: string, off: boolean, reason: string }} Row */
/** @typedef {{ group: string, rows: Row[], scoped: boolean }} Group */

/** A group's place in the sheet when it is not in the wanted order. */
const UNRANKED = 1000;
/** Where a scope's own groups rank among the sheet's. */
const SCOPED_RANK = 0.5;

/** A comma-separated attribute value as a list. @param {string | null} value */
const listOf = (value) =>
    (value ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

/** The body the sheet writes into, made on first use. @param {HTMLElement} sheet */
function bodyOf(sheet) {
    let body = /** @type {HTMLElement | null} */ (sheet.querySelector('[data-kp-shortcuts-body]'));
    if (!body) {
        body = sheet.ownerDocument.createElement('div');
        body.setAttribute('data-kp-shortcuts-body', '');
        sheet.append(body);
    }
    return body;
}

/** The groups of the sheet, the palette's and the sheet's own keys first. @param {ShortcutBoard} board @param {HTMLElement} sheet @param {string} fixed @param {import('./entries.js').Entry[]} sorted */
function collectGroups(board, sheet, fixed, sorted) {
    const s = getStrings();
    /** @type {Map<string, Group>} */
    const groups = new Map();
    /** @param {string} name @param {boolean} scoped */
    const groupFor = (name, scoped) => {
        let g = groups.get(name);
        if (!g) groups.set(name, (g = { group: name, rows: [], scoped }));
        if (scoped) g.scoped = true;
        return g;
    };
    const fixedGroup = groupFor(fixed, false);
    if (sheet.ownerDocument.querySelector('[data-kp-palette]')) fixedGroup.rows.push({ keys: 'Mod K', what: s.shortcutsPalette, off: false, reason: '' });
    fixedGroup.rows.push({ keys: '?', what: s.shortcutsSheet, off: false, reason: '' });
    for (const entry of sorted) {
        if (!scopeActive(entry)) continue;
        const group = groupFor(entry.shortcut.group ?? 'Shortcuts', typeof entry.scope !== 'string');
        group.rows.push({ keys: entry.shortcut.keys, what: entry.shortcut.what, off: !available(entry), reason: entry.shortcut.reason ?? s.shortcutsUnavailable });
    }
    return [...groups.values()].filter((g) => g.rows.length > 0);
}

/** The scope's keys first, then the sheet's fixed group, then the wanted order, then registration order. @param {Group[]} list @param {string[]} wanted @param {string} fixed */
function sortGroups(list, wanted, fixed) {
    const rank = (/** @type {Group} */ g) => {
        if (g.group === fixed) return wanted.includes(fixed) ? wanted.indexOf(fixed) + 1 : 0;
        if (g.scoped) return SCOPED_RANK;
        const at = wanted.indexOf(g.group);
        return at < 0 ? UNRANKED : at + 1;
    };
    list.sort((a, b) => (a.scoped === b.scoped ? rank(a) - rank(b) : a.scoped ? -1 : 1));
}

/** The plate shown when nothing is registered. @param {Document} doc */
function emptyPlate(doc) {
    const s = getStrings();
    const empty = doc.createElement('div');
    empty.className = 'kp-empty kp-shortcuts__empty';
    const title = doc.createElement('p');
    title.className = 'kp-empty__title';
    title.textContent = s.shortcutsEmptyTitle;
    const text = doc.createElement('p');
    text.className = 'kp-empty__body';
    text.textContent = s.shortcutsEmptyText;
    empty.append(title, text);
    return empty;
}

/** One row of the sheet: the keys and what they do, dimmed with its reason when not available. @param {Document} doc @param {Row} row */
function rowOf(doc, row) {
    const wrap = doc.createElement('div');
    wrap.className = row.off ? 'kp-shortcuts__row kp-shortcuts__row--off' : 'kp-shortcuts__row';
    const dt = doc.createElement('dt');
    const kbd = doc.createElement('kbd');
    kbd.className = 'kp-palette__keys';
    kbd.textContent = displayShortcutKeys(row.keys);
    dt.append(kbd);
    const dd = doc.createElement('dd');
    dd.append(row.what);
    if (row.off) {
        const why = doc.createElement('span');
        why.className = 'kp-shortcuts__reason';
        why.textContent = row.reason;
        dd.append(why);
    }
    wrap.append(dt, dd);
    return wrap;
}

/** @param {Document} doc @param {Group} g */
function sectionOf(doc, g) {
    const section = doc.createElement('section');
    const heading = doc.createElement('h3');
    heading.className = 'kp-shortcuts__group-label';
    heading.textContent = g.group;
    const dl = doc.createElement('dl');
    dl.className = 'kp-shortcuts__list';
    for (const row of g.rows) dl.append(rowOf(doc, row));
    section.append(heading, dl);
    return section;
}

/**
 * Write the sheet's body from the registry: groups of rows, the scope's own keys first, the palette's and the sheet's
 * keys in a fixed first group, a dimmed row for a key that is not available now, an empty plate when nothing is
 * registered.
 *
 * @param {ShortcutBoard} board
 * @param {HTMLElement} sheet
 */
export function renderSheet(board, sheet) {
    const doc = sheet.ownerDocument;
    const body = bodyOf(sheet);
    const fixed = sheet.getAttribute('data-kp-shortcuts-reserved-group') ?? 'Anywhere';
    // `data-kp-shortcuts-scope="page, table"` lists only the shortcuts registered under those scope names.
    const only = listOf(sheet.getAttribute('data-kp-shortcuts-scope'));
    const sorted = [...board.entries]
        .filter((e) => only.length === 0 || (typeof e.scope === 'string' && only.includes(e.scope)))
        .sort((a, b) => a.order - b.order);
    const list = collectGroups(board, sheet, fixed, sorted);
    sortGroups(list, listOf(sheet.getAttribute('data-kp-shortcuts-group')).concat(board.config.groupOrder ?? []), fixed);
    const registered = sorted.some(scopeActive);
    body.replaceChildren();
    if (!registered && sheet.getAttribute('data-kp-shortcuts-empty') !== 'off') {
        body.append(emptyPlate(doc));
        return;
    }
    for (const g of list) body.append(sectionOf(doc, g));
}
