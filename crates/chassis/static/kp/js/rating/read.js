// What a rating's attributes say now: its options, its state, and whether it can be changed.

import { getStrings } from '../strings.js';
import { levelOf, plain } from './math.js';

/** @typedef {import('./controller.js').RatingController} Rating */

/** @param {Rating} m @param {string} name @returns {string | undefined} */
export const attr = (m, name) => m.el.getAttribute(`data-kp-rating-${name}`) ?? undefined;

/** @param {Rating} m */
export const itemName = (m) => m.el.getAttribute('data-kp-rating-for') ?? m.el.getAttribute('aria-label') ?? '';

/** @param {Rating} m */
export const disabled = (m) => m.el.hasAttribute('data-kp-disabled');
/** @param {Rating} m */
export const readonly = (m) => m.el.hasAttribute('data-kp-readonly');
/** @param {Rating} m */
export const state = (m) => m.el.getAttribute('data-kp-state') ?? 'ready';
/** @param {Rating} m */
export const interactive = (m) => m.mode === 'input' && !disabled(m) && !readonly(m) && !m.busy && state(m) === 'ready';
/** Whether the row takes the tab stop: a read-only row does too, so its state can be reached. @param {Rating} m */
export const focusable = (m) => m.mode === 'input' && !disabled(m) && state(m) === 'ready';

/** @param {Rating} m */
export const announceLevel = (m) => m.el.getAttribute('data-kp-announce') ?? document.documentElement.getAttribute('data-kp-announce') ?? 'state';

/** The words that go with a value. @param {Rating} m @param {number} value */
export function wordsOf(m, value) {
    const s = getStrings();
    const level = levelOf(value);
    const label = level > 0 ? m.labels[level - 1] : undefined;
    if (m.mode === 'display') {
        if (value <= 0) return attr(m, 'unrated-text') ?? s.ratingUnrated;
        const count = Number(attr(m, 'count'));
        if (Number.isFinite(count) && count > 0) return s.ratingAverage(plain(value), count);
        return label ?? s.ratingOutOf(plain(value), m.max);
    }
    if (value <= 0) return s.ratingTap;
    return label ?? s.ratingOutOf(plain(value), m.max);
}
