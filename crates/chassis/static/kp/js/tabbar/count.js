// The count on a tab of the underline row [gap-tab-count]: read from the tab's attributes, drawn as a badge part that is made when missing and kept in place, and written by `setTabCount`.

import { getStrings } from '../strings.js';

/** A tab of the underline row. */
export const TAB = '.kp-tab';

/** The tones a count may carry; each is a plate the badge already has. */
export const TAB_COUNT_TONES = /** @type {const} */ (['neutral', 'info', 'success', 'warning', 'error']);

/** @typedef {import('../tabbar.js').TabCountTone} TabCountTone */

/** Fired on a tab (bubbling) when what its count shows changed: `{ tab, count, state, tone }`. */
export const TAB_COUNT_EVENT = 'kp-tab-count';

/** The attributes a count is drawn from. */
export const COUNT_ATTRIBUTES = [
    'data-kp-tab-count',
    'data-kp-tab-count-tone',
    'data-kp-tab-count-unit',
    'data-kp-tab-count-state',
    'data-kp-tab-count-zero',
    'data-kp-tab-count-show-unit',
];

/** The badge class of each tone. @type {Record<string, string>} */
const TONE_CLASS = { info: 'kp-badge--info', success: 'kp-badge--success', warning: 'kp-badge--warning', error: 'kp-badge--destructive' };

/** The digits whose room a count holds at least, so a number that grows a digit moves no tab. */
const LEAST_DIGITS = 2;

/** What each tab last drew, so a redraw of the same count says nothing and writes nothing. @type {WeakMap<Element, string>} */
const DRAWN = new WeakMap();

/**
 * What a tab's attributes ask for.
 * @param {Element} tab
 * @returns {{ state: 'none' | 'loading' | 'error' | 'ready', count: number | null, tone: TabCountTone, unit: string[], zero: boolean, showUnit: boolean }}
 */
function countOf(tab) {
    const raw = tab.getAttribute('data-kp-tab-count');
    const asked = tab.getAttribute('data-kp-tab-count-state');
    const number = raw === null || raw.trim() === '' || Number.isNaN(Number(raw)) ? null : Math.max(0, Math.trunc(Number(raw)));
    const state =
        raw === 'loading' || asked === 'loading' ? 'loading' : raw === 'error' || asked === 'error' ? 'error' : number === null ? 'none' : 'ready';
    const tone = /** @type {TabCountTone} */ (TAB_COUNT_TONES.find((t) => t === tab.getAttribute('data-kp-tab-count-tone')) ?? 'neutral');
    const unit = (tab.getAttribute('data-kp-tab-count-unit') ?? '')
        .split(',')
        .map((word) => word.trim())
        .filter(Boolean);
    return {
        state,
        count: number,
        tone,
        unit,
        zero: tab.getAttribute('data-kp-tab-count-zero') === 'show',
        showUnit: tab.hasAttribute('data-kp-tab-count-show-unit'),
    };
}

/** @param {Document} doc @param {string} text @param {string} [className] */
function span(doc, text, className) {
    const node = doc.createElement('span');
    if (className) node.className = className;
    node.textContent = text;
    return node;
}

/** The room of the digits, held: the last number's, two at least. Loading keeps what the last number had. @param {HTMLElement} part @param {string} state @param {number | null} count */
function holdDigits(part, state, count) {
    if (state === 'ready' && count !== null) part.style.setProperty('--kp-tab-count-digits', String(Math.max(LEAST_DIGITS, String(count).length)));
    else if (!part.style.getPropertyValue('--kp-tab-count-digits')) part.style.setProperty('--kp-tab-count-digits', String(LEAST_DIGITS));
}

/** The children of the count part: a skeleton, a dash, or the number with its unit. @param {HTMLElement} part @param {string} state @param {number | null} count @param {string} word @param {boolean} showUnit */
function fillPart(part, state, count, word, showUnit) {
    const doc = part.ownerDocument;
    const s = getStrings();
    // The tab's name reads "Logs, 12 errors": the comma is for the screen reader only.
    const lead = span(doc, ', ', 'kp-sr-only');
    if (state === 'loading') {
        const bone = doc.createElement('span');
        bone.className = 'kp-skeleton kp-tab__bone';
        bone.setAttribute('role', 'img');
        bone.setAttribute('aria-label', s.tabCountCounting);
        part.replaceChildren(lead, bone);
    } else if (state === 'error') {
        const dash = span(doc, '–');
        dash.setAttribute('aria-hidden', 'true');
        part.replaceChildren(lead, dash, span(doc, s.tabCountFailed, 'kp-sr-only'));
        part.title = s.tabCountFailed;
    } else {
        const nodes = [lead, span(doc, String(count))];
        if (word) nodes.push(showUnit ? span(doc, ` ${word}`, 'kp-tab__unit') : span(doc, ` ${word}`, 'kp-sr-only'));
        part.replaceChildren(...nodes);
    }
}

/**
 * Draw the count part of one tab from its attributes. Made when missing, kept in place otherwise.
 *
 * @param {Element} tab a `.kp-tab`
 * @returns {HTMLElement | null} the count part, null while the tab has none
 */
export function drawTabCount(tab) {
    const { state, count, tone, unit, zero, showUnit } = countOf(tab);
    let part = /** @type {HTMLElement | null} */ (tab.querySelector(':scope > .kp-tab__count'));
    const shown = state === 'loading' || state === 'error' || (state === 'ready' && (zero || (count ?? 0) > 0));
    if (!shown) {
        part?.remove();
        if (DRAWN.has(tab)) {
            DRAWN.delete(tab);
            tab.dispatchEvent(new CustomEvent(TAB_COUNT_EVENT, { bubbles: true, detail: { tab, count: null, state: 'none', tone } }));
        }
        return null;
    }
    if (!part) {
        part = tab.ownerDocument.createElement('span');
        tab.append(part);
    }
    // The key of what is drawn: nothing below is touched when it is the same (a refresh that reads the same number).
    const word = unit.length === 0 ? '' : count === 1 || unit.length === 1 ? unit[0] : unit[1];
    const key = [state, count, tone, word, showUnit].join('|');
    if (DRAWN.get(tab) === key && part.isConnected) return part;
    DRAWN.set(tab, key);
    part.className = `kp-badge kp-tab__count${TONE_CLASS[tone] ? ` ${TONE_CLASS[tone]}` : ''}`;
    part.setAttribute('data-kp-tone', tone);
    part.setAttribute('data-kp-state', state);
    part.removeAttribute('title');
    holdDigits(part, state, count);
    fillPart(part, state, count, word, showUnit);
    tab.dispatchEvent(new CustomEvent(TAB_COUNT_EVENT, { bubbles: true, detail: { tab, count: state === 'ready' ? count : null, state, tone } }));
    return part;
}

/**
 * Write the count of a tab of the underline row: every digit of it (12 is 12 and 1534 is 1534, never `9+` or `1.5k`), nothing at
 * `null` (a tab that has not been counted is not a tab with 0), nothing at 0 unless `zero: 'show'`. `'loading'` draws a skeleton
 * the width of the last number, `'error'` a dash with the words "could not be counted" for a screen reader. An option left out keeps
 * what the tab already says, so a refresh is `setTabCount(tab, 13)`; `null` as an option takes it away. The call writes the
 * `data-kp-tab-count…` attributes and draws, so markup and call are one thing.
 *
 * @param {Element} tab a `.kp-tab`
 * @param {number | null | 'loading' | 'error'} count
 * @param {{ tone?: TabCountTone | null, unit?: string | null, zero?: 'show' | 'hide' | null, showUnit?: boolean | null }} [options]
 *        `unit` is the singular and the plural, "error,errors"
 * @returns {HTMLElement | null} the count part
 */
export function setTabCount(tab, count, options = {}) {
    if (count === 'loading' || count === 'error') {
        // The last number stays on the tab: the skeleton keeps its width, and the number comes back with the next call.
        tab.setAttribute('data-kp-tab-count-state', count);
    } else {
        tab.removeAttribute('data-kp-tab-count-state');
        const whole = count === null || !Number.isFinite(count) ? null : Math.max(0, Math.trunc(count));
        if (whole === null) tab.removeAttribute('data-kp-tab-count');
        else tab.setAttribute('data-kp-tab-count', String(whole));
    }
    /** @param {string} name @param {string | null | undefined} value */
    const put = (name, value) => {
        if (value === undefined) return;
        if (value === null || value === '') tab.removeAttribute(name);
        else tab.setAttribute(name, value);
    };
    put('data-kp-tab-count-tone', options.tone);
    put('data-kp-tab-count-unit', options.unit);
    put('data-kp-tab-count-zero', options.zero === 'hide' ? null : options.zero);
    if (options.showUnit !== undefined) tab.toggleAttribute('data-kp-tab-count-show-unit', options.showUnit === true);
    return drawTabCount(tab);
}
