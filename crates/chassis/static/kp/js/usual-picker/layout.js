// Arranges the options and paints the tail and the headers.
import { getStrings } from '../strings.js';
import { exactItem, nearOf, pickedValues } from './lookup.js';
import { attr, bandValues, make, readItems, readPinned, realOptions } from './model.js';
import { usualState } from './state.js';
/** @typedef {import('./types.js').UsualModel} UsualModel */

/** Rebuild the order of the list: pinned, the band, the rest, the rows that open the rest. @param {UsualModel} m */
export function arrange(m) {
    const s = getStrings();
    for (const node of m.list.querySelectorAll('[data-kp-synth]')) node.remove();
    readItems(m);
    const query = m.input.value.trim();
    const hideBand = query !== '' && attr(m, 'usual-while-typing') === 'hide';
    const band = hideBand ? [] : bandValues(m);
    const inBand = new Set(band);
    const byValue = new Map(m.items.map((i) => [i.value, i]));
    const rest = m.items.filter((i) => !inBand.has(i.value));
    if (attr(m, 'order', 'alphabetical') !== 'given') rest.sort((a, b) => a.label.localeCompare(b.label));
    // An item that cannot be picked says why in words under its label, and a screen reader reads it as its description.
    for (const item of m.items) {
        const why = item.el.getAttribute('data-kp-reason');
        if (!why || item.el.querySelector('.kp-usual__reason')) continue;
        usualState.serial += 1;
        const reason = make('span', 'kp-usual__reason', why);
        reason.id = `kp-usual-${usualState.serial}-why`;
        item.el.setAttribute('aria-describedby', reason.id);
        item.el.setAttribute('aria-disabled', 'true');
        item.el.append(reason);
    }
    for (const item of m.items) {
        item.el.toggleAttribute('data-kp-band', inBand.has(item.value));
        item.el.toggleAttribute('data-kp-rest', !inBand.has(item.value));
    }
    /** @type {HTMLElement[]} */
    const order = [];
    const pinned = readPinned(m);
    for (const p of pinned) {
        const row = make('li', 'kp-combobox__option kp-usual__pinned', p.label);
        row.setAttribute('role', 'option');
        row.setAttribute('data-kp-option', '');
        row.setAttribute('data-kp-pinned', '');
        row.setAttribute('data-kp-synth', '');
        row.dataset.value = p.value;
        order.push(row);
    }
    /** @param {string} text @param {string} kind */
    const header = (text, kind) => {
        const h = make('li', 'kp-usual__group', text);
        h.setAttribute('role', 'presentation');
        h.setAttribute('data-kp-synth', '');
        h.setAttribute('data-kp-group', kind);
        return h;
    };
    if (band.length > 0) order.push(header(attr(m, 'usual-label') ?? s.usualLabel, 'usual'));
    for (const v of band) {
        const item = byValue.get(v);
        if (item) order.push(item.el);
    }
    if (band.length > 0 && rest.length > 0) order.push(header(s.usualAll, 'all'));
    for (const item of rest) order.push(item.el);
    const more = make('li', 'kp-combobox__option kp-usual__more');
    more.setAttribute('role', 'option');
    more.setAttribute('data-kp-option', '');
    more.setAttribute('data-kp-synth', '');
    more.setAttribute('data-kp-more', '');
    more.textContent = m.expanded ? s.usualShowFewer : s.usualShowAll(m.items.length);
    order.push(more);
    const empty = m.list.querySelector('[data-kp-combobox-empty]');
    m.list.append(...order);
    if (empty) m.list.append(empty);
}

/**
 * The guard's rows for what is typed. FIRST in the list: "Headache is already picked" for a name (or the near name of one)
 * already picked, then "Did you mean Fatigue?" for each near name not picked yet, whose plain row is folded into it so the
 * name stands once. Under the options: the plate over a search with nothing left, then "Add 'Fatigu' as new". Before, a
 * near name whose row was still shown (the start of a name, "Fatigu") got no question at all, and a name already picked was
 * answered with "No match" (Kenny, 2026-10-18 21:37).
 * @param {UsualModel} m @param {string} typed
 */
export function paintTail(m, typed) {
    const s = getStrings();
    for (const node of m.list.querySelectorAll('.kp-usual__tail')) node.remove();
    if (typed === '') return;
    const empty = m.list.querySelector('[data-kp-combobox-empty]');
    const picked = new Set(pickedValues(m));
    // Identical after case, accents and spaces is never a new name, whatever the guard for close names is set to.
    const exact = exactItem(m, typed);
    /** @param {string} cls @param {string} text @param {boolean} option */
    const row = (cls, text, option) => {
        const li = make('li', `kp-usual__tail ${cls}`, text);
        li.setAttribute('data-kp-synth', '');
        if (option) {
            li.className = `kp-combobox__option ${li.className}`;
            li.setAttribute('role', 'option');
            li.setAttribute('data-kp-option', '');
        } else li.setAttribute('role', 'presentation');
        return li;
    };
    /** @type {HTMLElement[]} */
    const head = [];
    if (exact) {
        // Identical to a name: Enter takes it. Already picked: the list says so where the eyes are.
        if (picked.has(exact.value)) head.push(row('kp-usual__already', s.usualAlreadyPicked(exact.label), false));
        if (head.length) m.list.prepend(...head);
        return;
    }
    const near = nearOf(m, typed);
    const already = near.find((item) => picked.has(item.value));
    if (already) head.push(row('kp-usual__already', s.usualAlreadyPicked(already.label), false));
    for (const item of near.filter((one) => !picked.has(one.value) && !one.el.hasAttribute('aria-disabled'))) {
        const ask = row('kp-usual__near', s.usualDidYouMean(item.label), true);
        ask.dataset.kpNearValue = item.value;
        head.push(ask);
        // The item's own row is folded into its question: one name, once.
        item.el.hidden = true;
    }
    if (head.length) m.list.prepend(...head);
    const realVisible = realOptions(m.list).filter((o) => !o.hidden).length;
    const addOn = attr(m, 'add', 'off') === 'inline';
    /** @type {HTMLElement[]} */
    const foot = [];
    if (realVisible === 0 && head.length === 0) {
        const plate = row('kp-usual__plate', '', false);
        plate.append(
            make('strong', 'kp-usual__plate-title', s.usualNoMatchTitle),
            make('span', 'kp-usual__plate-text', addOn ? s.usualNoMatchText : s.usualNoMatchTextFixed),
        );
        foot.push(plate);
    }
    if (addOn) foot.push(row('kp-usual__add', s.usualAdd(typed), true));
    if (empty) empty.before(...foot);
    else m.list.append(...foot);
}

/** Show or hide the headers by whether any option stands under them. @param {UsualModel} m */
export function paintHeaders(m) {
    const children = /** @type {HTMLElement[]} */ ([...m.list.children]);
    for (let i = 0; i < children.length; i += 1) {
        const node = children[i];
        if (!node?.classList.contains('kp-usual__group')) continue;
        let any = false;
        for (let j = i + 1; j < children.length; j += 1) {
            const next = children[j];
            if (!next || next.classList.contains('kp-usual__group')) break;
            // The guard's rows are no item of a group: "All" over nothing but "Add … as new" is a heading over nothing.
            if (next.classList.contains('kp-usual__tail')) continue;
            if (next.hasAttribute('data-kp-option') && !next.hidden && !next.hasAttribute('data-kp-more')) any = true;
        }
        node.hidden = !any;
    }
}
