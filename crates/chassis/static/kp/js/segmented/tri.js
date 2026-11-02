// The three-way look [kpadopt4]: a chip's state and its spoken word, the Clear all item, the summary line and the status region.

import { getStrings } from '../strings.js';
import { SAY_DELAY_MS, SEGMENTED, TRI_ATTRIBUTE, TRI_STATES } from './constants.js';
import { getSegmentedTri, isAll, itemsOf, labelOf, triOf, valueOf } from './read.js';
import { roving } from './roving.js';
import { writeGroupTrack } from './track.js';

/**
 * The words of a three-way group's states: its own `data-kp-segmented-words`, else the dictionary's.
 * @param {Element} item
 * @returns {Record<'any' | 'include' | 'exclude', string>}
 */
export function triWords(item) {
    const strings = getStrings();
    const words = { any: strings.triAny, include: strings.triInclude, exclude: strings.triExclude };
    const raw = item.parentElement?.closest(SEGMENTED)?.getAttribute('data-kp-segmented-words');
    if (!raw) return words;
    try {
        const own = JSON.parse(raw);
        for (const state of TRI_STATES) if (typeof own?.[state] === 'string') words[state] = own[state];
    } catch {
        // Words that do not read as JSON leave the dictionary's.
    }
    return words;
}

/**
 * Write one three-way chip's state: the attribute, the word a screen reader
 * hears after its name, and the mark (drawn by the stylesheet from the
 * attribute). The parts are made when the markup left them out.
 * @param {HTMLElement} item
 * @param {'any' | 'include' | 'exclude'} state
 */
export function writeTri(item, state) {
    if (state === 'any') item.removeAttribute(TRI_ATTRIBUTE);
    else item.setAttribute(TRI_ATTRIBUTE, state);
    let mark = item.querySelector(':scope > .kp-segmented__mark');
    if (!mark) {
        mark = document.createElement('span');
        mark.className = 'kp-segmented__mark';
        mark.setAttribute('aria-hidden', 'true');
        item.prepend(mark);
    }
    let word = item.querySelector(':scope > .kp-segmented__state');
    if (!word) {
        word = document.createElement('span');
        word.className = 'kp-sr-only kp-segmented__state';
        item.append(word);
    }
    word.textContent = `, ${triWords(item)[state]}`;
    writeTag(item);
}

/** The visible words of a three-way group (the word look, the default; `data-kp-segmented-tri-look="mark"` hides them) [ux-1101]: its own `data-kp-segmented-tags`, else the dictionary's. @param {Element} item */
function tagWords(item) {
    const strings = getStrings();
    const words = { any: strings.triTagAny, include: strings.triTagInclude, exclude: strings.triTagExclude };
    const raw = item.parentElement?.closest(SEGMENTED)?.getAttribute('data-kp-segmented-tags');
    if (!raw) return words;
    try {
        const own = JSON.parse(raw);
        for (const state of TRI_STATES) if (typeof own?.[state] === 'string') words[state] = own[state];
    } catch (error) {
        console.warn('kp-segmented: data-kp-segmented-tags is not JSON; the dictionary words stay', error);
    }
    return words;
}

/**
 * The state as a visible word inside the chip [ux-1101]. All three words stand stacked in one cell and only the chip's own
 * is drawn, so the chip is as wide as its longest word in every state and nothing moves on a press. Hidden from a screen
 * reader, which hears the state word after the name. Drawn only in the word look; the mark look keeps it out of sight.
 * @param {HTMLElement} item
 */
function writeTag(item) {
    let tag = item.querySelector(':scope > .kp-segmented__tag');
    if (!tag) {
        tag = document.createElement('span');
        tag.className = 'kp-segmented__tag';
        tag.setAttribute('aria-hidden', 'true');
        const label = item.querySelector(':scope > .kp-segmented__label');
        if (label) label.after(tag);
        else item.append(tag);
    }
    const words = tagWords(item);
    tag.replaceChildren(
        ...TRI_STATES.map((one) => {
            const part = document.createElement('span');
            part.dataset.state = one;
            part.textContent = words[one];
            return part;
        }),
    );
    item.setAttribute('aria-keyshortcuts', '+ - Delete');
}

/**
 * The three-way group's Clear all (dimmed while nothing is chosen), its
 * summary line and its roving tab stop.
 * @param {Element} group
 */
export function paintTri(group) {
    const { include, exclude } = getSegmentedTri(group);
    const chosen = include.length + exclude.length > 0;
    for (const item of itemsOf(group)) {
        if (!isAll(item)) continue;
        item.setAttribute('aria-disabled', String(!chosen));
    }
    summaryOf(group, chosen);
    roving(group);
    writeGroupTrack(group);
}

/**
 * The line after a three-way group that asks for one (`data-kp-segmented-summary`):
 * how it works while nothing is chosen, what is chosen once something is. Its
 * value, when it has one, replaces the hint. One line; the whole sentence is
 * its title when it is cut.
 * @param {Element} group @param {boolean} chosen
 */
function summaryOf(group, chosen) {
    if (!group.hasAttribute('data-kp-segmented-summary')) return;
    const next = group.nextElementSibling;
    /** @type {HTMLElement} */
    let line;
    if (next instanceof HTMLElement && next.classList.contains('kp-segmented__summary')) line = next;
    else {
        line = document.createElement('p');
        line.className = 'kp-segmented__summary';
        group.after(line);
    }
    const names = (/** @type {'include' | 'exclude'} */ state) =>
        itemsOf(group)
            .filter((item) => !isAll(item) && triOf(item) === state)
            .map(labelOf);
    const text = chosen
        ? getStrings().triSummary(names('include'), names('exclude'))
        : group.getAttribute('data-kp-segmented-summary') || getStrings().triHint;
    line.textContent = text;
    line.title = text;
    line.toggleAttribute('data-kp-chosen', chosen);
}

/**
 * Say something through a three-way group's status region (made on first
 * need, after the group and its summary line).
 * @param {Element} group @param {string} message
 */
export function sayTri(group, message) {
    let region = group.parentElement?.querySelector(`:scope > .kp-segmented__live[data-for="${CSS.escape(group.id || '')}"]`) ?? null;
    if (!region) {
        if (!group.id) group.id = `kp-segmented-${Math.random().toString(36).slice(2, 9)}`;
        region = document.createElement('span');
        region.className = 'kp-sr-only kp-segmented__live';
        region.setAttribute('role', 'status');
        region.setAttribute('data-for', group.id);
        const summary = group.nextElementSibling?.classList.contains('kp-segmented__summary') ? group.nextElementSibling : group;
        summary.after(region);
    }
    const target = region;
    // Cleared first so the same sentence twice in a row is still heard.
    target.textContent = '';
    setTimeout(() => (target.textContent = message), SAY_DELAY_MS);
}

/**
 * Set a three-way group's chips without firing the event; a value in neither list is let go.
 * @param {Element} group
 * @param {{ include?: Iterable<string>, exclude?: Iterable<string> }} values
 */
export function setTriValues(group, { include = [], exclude = [] }) {
    const inc = new Set(include);
    const exc = new Set(exclude);
    for (const item of itemsOf(group)) {
        if (isAll(item)) continue;
        const value = valueOf(item);
        writeTri(item, inc.has(value) ? 'include' : exc.has(value) ? 'exclude' : 'any');
    }
    paintTri(group);
}
