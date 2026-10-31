// The keyboard of the row: arrows and Home and End move and choose, Backspace and Delete clear, Space and Enter choose the focused star.

import { clamp } from './math.js';
import { choose, commit, focusStar } from './commit.js';
import { attr, interactive } from './read.js';

/** @typedef {import('./controller.js').RatingController} Rating */

/** The number of the star an event's target is in, 0 when none. @param {EventTarget | null} target */
const starNumber = (target) => (target instanceof HTMLElement ? Number(target.closest('.kp-rating__star')?.getAttribute('data-kp-star')) : 0);

/** Backspace or Delete lets the rating go. @param {Rating} m @param {KeyboardEvent} event */
function clearByKey(m, event) {
    event.preventDefault();
    if (m.value > 0 || m.draft > 0) {
        m.draft = 0;
        commit(m, 0, 'clear');
        focusStar(m);
    }
}

/**
 * The value an arrow, Home or End key moves to, or null for another key. Nothing chosen yet: an arrow goes from the star that has
 * the focus, as a native radio group does.
 * @param {Rating} m @param {KeyboardEvent} event @returns {number | null}
 */
function targetValue(m, event) {
    const rtl = getComputedStyle(m.el).direction === 'rtl';
    const at = m.draft > 0 || m.step === 0.5 ? m.draft : starNumber(event.target) || 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') return at + (event.key === 'ArrowRight' && rtl ? -m.step : m.step);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') return at - (event.key === 'ArrowLeft' && rtl ? -m.step : m.step);
    if (event.key === 'Home') return m.step;
    if (event.key === 'End') return m.max;
    return null;
}

/** @param {Rating} m @param {KeyboardEvent} event */
export function onKey(m, event) {
    if (!interactive(m) || event.altKey || event.ctrlKey || event.metaKey) return;
    const to = targetValue(m, event);
    if (to === null) {
        if ((event.key === 'Backspace' || event.key === 'Delete') && attr(m, 'clear') !== 'off') return clearByKey(m, event);
        if (event.key === ' ' || event.key === 'Enter') {
            const focused = starNumber(event.target);
            if (!focused) return;
            event.preventDefault();
            choose(m, focused, 'keyboard');
        }
        return;
    }
    event.preventDefault();
    choose(m, clamp(to, m.step, m.max), 'keyboard');
    // A pick held for Save stays a draft; the focus follows it either way.
    window.setTimeout(() => focusStar(m), 0);
}
