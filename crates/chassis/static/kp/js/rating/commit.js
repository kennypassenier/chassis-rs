// A person changes the rating: choosing a value (held for Save or at once), the event that can be refused, the save that is waited for, and Undo.

import { getStrings } from '../strings.js';
import { motionAllowed } from '../calm.js';
import { undoToast } from '../undo-toast.js';
import { DEFAULT_FLASH_MS, DEFAULT_UNDO_MS, RATING_EVENT, SAY_DELAY_MS } from './constants.js';
import { paint } from './paint.js';
import { announceLevel, attr, interactive, itemName } from './read.js';
import { plain, snapRating } from './math.js';

/** @typedef {import('./controller.js').RatingController} Rating */
/** @typedef {import('./constants.js').RatingSource} RatingSource */

/** Say something through the polite live region. @param {Rating} m @param {string} text */
export function say(m, text) {
    m.live.textContent = '';
    window.setTimeout(() => {
        m.live.textContent = text;
    }, SAY_DELAY_MS);
}

/** Tell the person something under the row, for a while. @param {Rating} m @param {string} text */
export function tell(m, text) {
    window.clearTimeout(m.flashTimer);
    m.flash.textContent = text;
    m.flash.hidden = text === '';
    if (text === '') return;
    const ms = Number(m.el.getAttribute('data-kp-flash-error-ms'));
    m.flashTimer = window.setTimeout(() => tell(m, ''), Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_FLASH_MS);
}

/** The pop of the star just chosen, where motion is allowed. @param {Rating} m @param {number} value */
function pop(m, value) {
    if (value <= 0 || !motionAllowed(m.el)) return;
    const star = m.stars[Math.ceil(value) - 1];
    if (!star) return;
    star.removeAttribute('data-kp-popped');
    void star.offsetWidth;
    star.setAttribute('data-kp-popped', '');
}

/**
 * The sentence and the Undo toast after a change went through. The words and the item's name are the ones from when the change
 * was made, not from when a slow save came back.
 * @param {Rating} m @param {number} value @param {number} previous @param {RatingSource} source
 * @param {import('../strings.js').Strings} s @param {string} item
 */
function afterChange(m, value, previous, source, s, item) {
    m.busy = false;
    paint(m);
    if (announceLevel(m) !== 'off') say(m, value > 0 ? s.ratingAnnounce(item, plain(value), m.max) : s.ratingAnnounceCleared(item));
    const ms = m.el.hasAttribute('data-kp-undo-ms') ? Number(m.el.getAttribute('data-kp-undo-ms')) : DEFAULT_UNDO_MS;
    if (source !== 'undo' && ms > 0) {
        undoToast(value > 0 ? s.ratingToast(item, value) : s.ratingToastCleared(item), {
            mode: 'revert',
            ms,
            undo: () => commit(m, previous, 'undo'),
        });
    }
}

/**
 * A person changed the rating. The event can be refused; `wait()` hands over a save.
 * @param {Rating} m @param {number} next @param {RatingSource} source
 */
export function commit(m, next, source) {
    if (!interactive(m) && source !== 'undo') return;
    const previous = m.value;
    const value = snapRating(next, m.max, m.step);
    if (value === previous) {
        m.draft = previous;
        paint(m);
        return;
    }
    /** @type {Promise<unknown>[]} */
    const waits = [];
    const event = new CustomEvent(RATING_EVENT, {
        bubbles: true,
        cancelable: true,
        detail: { value, previous, source, wait: (/** @type {Promise<unknown>} */ promise) => void waits.push(promise) },
    });
    m.value = m.draft = value;
    tell(m, '');
    const kept = m.el.dispatchEvent(event);
    if (!kept) {
        m.value = m.draft = previous;
        paint(m);
        return;
    }
    const s = getStrings();
    const item = itemName(m);
    pop(m, value);
    if (waits.length === 0) {
        afterChange(m, value, previous, source, s, item);
        return;
    }
    m.busy = true;
    paint(m);
    void Promise.all(waits).then(
        () => afterChange(m, value, previous, source, s, item),
        () => {
            m.value = m.draft = previous;
            m.busy = false;
            paint(m);
            tell(m, s.ratingSaveFailed(item));
        },
    );
}

/** A star's value from a pointer: a half where the step is a half. @param {Rating} m @param {number} n @param {PointerEvent | MouseEvent} event */
export function valueAt(m, n, event) {
    if (m.step !== 0.5) return n;
    const star = m.stars[n - 1];
    if (!star) return n;
    const box = star.getBoundingClientRect();
    const rtl = getComputedStyle(star).direction === 'rtl';
    const left = rtl ? event.clientX > box.left + box.width / 2 : event.clientX < box.left + box.width / 2;
    return left ? n - 0.5 : n;
}

/** @param {Rating} m @param {number} value @param {RatingSource} source */
export function choose(m, value, source) {
    const confirm = attr(m, 'commit') === 'confirm';
    const next = snapRating(value, m.max, m.step);
    if (confirm && source !== 'clear' && source !== 'undo') {
        m.draft = next;
        paint(m);
        return;
    }
    // The chosen star again clears the rating.
    if (attr(m, 'clear') !== 'off' && next === m.value && next > 0 && source !== 'keyboard') commit(m, 0, 'clear');
    else commit(m, next, source);
}

/** @param {Rating} m */
export function focusStar(m) {
    const target = m.step === 0.5 ? m.row : (m.stars[Math.max(0, Math.round(m.draft) - 1)] ?? m.stars[0]);
    target?.focus({ preventScroll: true });
}
