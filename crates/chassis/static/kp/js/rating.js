// A star rating: give something a score, or show one [kpadopt6; the parked recipes app's "how was it", Kenny's example is four of five].
//
// A row of stars that is a radio group (one tab stop, the arrows move and choose, Home and End, Backspace clears) and, with
// `data-kp-rating-mode="display"`, the same row read only, one image with a full text name.
//
//   <div class="kp-rating" data-kp-rating data-kp-rating-for="Lasagne" data-kp-rating-value="4"></div>
//   <div class="kp-rating" data-kp-rating data-kp-rating-mode="display" data-kp-rating-value="4.5" data-kp-rating-count="12"></div>
//
// Options, each a markup attribute and a field of attachRatings(root, options) (KT6); the default is what writing nothing gives
// (Kenny, 2026-10-17: five whole stars):
//   data-kp-rating-max        3 to 10                              5
//   data-kp-rating-step       1 | 0.5                              1   (0.5 turns the row into one slider, `aria-valuetext` "3.5 of 5")
//   data-kp-rating-mode       input | display                      input
//   data-kp-rating-value      0 to max; 0 is "not rated"           0
//   data-kp-rating-clear      present | off                        present: the chosen star again, Backspace or Delete clear
//   data-kp-rating-labels     "Not for me|Okay|Good|Great|Make again" or a JSON list, one word per level; the caption shows it
//   data-kp-rating-size       sm | md | lg                         md (input), sm (display)
//   data-kp-rating-commit     immediate | confirm                  immediate (one tap saves; confirm holds the pick until Save)
//   data-kp-rating-preview    present | off                        present: the star about to be set under the pointer
//   data-kp-rating-unrated-text   the words of an empty row        "Not rated yet"
//   data-kp-rating-count      display only: "4.5 (12)"             none
//   data-kp-readonly          drawn as an input, not changeable    absent; data-kp-disabled with data-kp-disabled-reason locks it for now
//   data-kp-rating-name       a hidden input for a plain form      none
//   data-kp-rating-for        the item's name for the sentences    the element's aria-label
//   data-kp-undo-ms           the Undo window after a change       6000 (0 for none)
//   data-kp-flash-error-ms    how long a refused save is told      3000
//   data-kp-announce          off | state | all                    state
//   data-kp-state             loading | error | ready              ready (setRatingState)
//
// Events (bubbling, on the element): `kp-rating-change` `{ value, previous, source: 'pointer' | 'keyboard' | 'clear' | 'undo',
// wait(promise) }`, cancelable (the page refuses and the row goes back). A page that saves asynchronously calls `wait(promise)`:
// the row is busy, and a rejection puts the previous value back and tells it under the row for `data-kp-flash-error-ms`.
// `kp-rating-retry` is fired by the Retry of a rating that could not be read. A table cell: ratingCell(cell, value) draws the
// display row and writes the number the data table sorts by. Every word is in js/strings.js; nothing runs on import.

import { getStrings } from './strings.js';
import { motionAllowed } from './calm.js';
import { undoToast } from './undo-toast.js';

/** A rating. */
export const RATING = '[data-kp-rating]';
/** Fired on the rating when a person changes it: `{ value, previous, source, wait }`. */
export const RATING_EVENT = 'kp-rating-change';
/** Fired on the rating when Retry is pressed on a rating that could not be read. */
export const RATING_RETRY_EVENT = 'kp-rating-retry';
/** The states a rating can be in. */
export const RATING_STATES = /** @type {const} */ (['ready', 'loading', 'error']);
/** The star, as one path in a 24 by 24 box. */
const STAR_PATH = 'M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.2 1.2-6.5L2.5 9.5l6.6-.9z';

/**
 * @typedef {'pointer' | 'keyboard' | 'clear' | 'undo'} RatingSource
 * @typedef {object} RatingModel
 * @property {HTMLElement} el
 * @property {number} max
 * @property {1 | 0.5} step
 * @property {'input' | 'display'} mode
 * @property {number} value
 * @property {number} draft the pick held back by commit confirm, else the value
 * @property {number | null} preview
 * @property {string[]} labels
 * @property {HTMLElement} row
 * @property {HTMLElement[]} stars
 * @property {HTMLElement} caption
 * @property {HTMLElement} reason
 * @property {HTMLElement} flash
 * @property {HTMLElement} live
 * @property {HTMLElement} failure
 * @property {HTMLElement} actions
 * @property {HTMLInputElement | null} field
 * @property {boolean} busy
 * @property {number} flashTimer
 */

/** @type {WeakMap<Element, RatingModel>} */
const models = new WeakMap();
let serial = 0;

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {string} [className] @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

/** @param {number} n @param {number} lo @param {number} hi */
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** A value snapped to the step and the scale. Pure. @param {number} value @param {number} max @param {number} step */
export function snapRating(value, max, step = 1) {
    if (!Number.isFinite(value)) return 0;
    return clamp(Math.round(value / step) * step, 0, max);
}

/** The numbers as a person says them: 4, 4.5, never 4.50 (a number, so a sentence prints it plain). Pure. @param {number} n */
const plain = (n) => Number(n.toFixed(2));

/** @param {string | undefined} raw @returns {string[]} */
function parseLabels(raw) {
    if (!raw) return [];
    const text = raw.trim();
    if (text.startsWith('[')) {
        try {
            const list = JSON.parse(text);
            return Array.isArray(list) ? list.map(String) : [];
        } catch {
            return [];
        }
    }
    return text.split('|').map((word) => word.trim());
}

/** @param {RatingModel} m @param {string} name @returns {string | undefined} */
const attr = (m, name) => m.el.getAttribute(`data-kp-rating-${name}`) ?? undefined;

/** @param {RatingModel} m */
const itemName = (m) => m.el.getAttribute('data-kp-rating-for') ?? m.el.getAttribute('aria-label') ?? '';

/** @param {RatingModel} m */
const disabled = (m) => m.el.hasAttribute('data-kp-disabled');
/** @param {RatingModel} m */
const readonly = (m) => m.el.hasAttribute('data-kp-readonly');
/** @param {RatingModel} m */
const state = (m) => m.el.getAttribute('data-kp-state') ?? 'ready';
/** @param {RatingModel} m */
const interactive = (m) => m.mode === 'input' && !disabled(m) && !readonly(m) && !m.busy && state(m) === 'ready';
/** Whether the row takes the tab stop: a read-only row does too, so its state can be reached. @param {RatingModel} m */
const focusable = (m) => m.mode === 'input' && !disabled(m) && state(m) === 'ready';

/** The level a value is at, for the labels: 1 to max, 0 for none. @param {number} value */
const levelOf = (value) => Math.ceil(value);

/** @param {RatingModel} m */
const announceLevel = (m) => m.el.getAttribute('data-kp-announce') ?? document.documentElement.getAttribute('data-kp-announce') ?? 'state';

/** The star glyph: an outline under a fill that is cut to the share of the star that is lit. */
function glyph() {
    const ns = 'http://www.w3.org/2000/svg';
    const wrap = make('span', 'kp-rating__glyph');
    wrap.setAttribute('aria-hidden', 'true');
    for (const part of ['empty', 'full']) {
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('class', `kp-rating__${part}`);
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', STAR_PATH);
        svg.append(path);
        wrap.append(svg);
    }
    return wrap;
}

/** The words that go with a value. @param {RatingModel} m @param {number} value */
function wordsOf(m, value) {
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

/** Bring the stars, the names and the caption in step with the model. @param {RatingModel} m */
function paint(m) {
    const s = getStrings();
    const shown = m.preview ?? m.draft;
    const mode = m.mode;
    const item = itemName(m);
    const st = state(m);
    m.el.toggleAttribute('data-kp-rating-busy', m.busy);
    m.el.classList.toggle('kp-rating--display', mode === 'display');
    m.el.classList.toggle('kp-rating--input', mode === 'input');
    const size = attr(m, 'size') ?? (mode === 'display' ? 'sm' : 'md');
    for (const name of ['sm', 'md', 'lg']) m.el.classList.toggle(`kp-rating--${name}`, name === size);
    m.el.setAttribute('aria-busy', String(st === 'loading' || m.busy));
    m.el.toggleAttribute('data-kp-previewing', m.preview !== null);
    m.el.style.setProperty('--kp-rating-max', String(m.max));
    m.stars.forEach((star, i) => {
        const lit = clamp(shown - i, 0, 1);
        star.style.setProperty('--kp-rating-fill', String(lit));
        star.toggleAttribute('data-kp-lit', lit > 0);
        star.toggleAttribute('data-kp-whole', lit >= 1);
    });
    const unrated = m.value <= 0;
    const total = m.max;
    if (mode === 'display') {
        const count = Number(attr(m, 'count'));
        m.row.setAttribute('role', 'img');
        m.row.setAttribute(
            'aria-label',
            unrated
                ? (attr(m, 'unrated-text') ?? s.ratingUnrated)
                : Number.isFinite(count) && count > 0
                  ? s.ratingRatedCount(plain(m.value), total, count)
                  : s.ratingRated(plain(m.value), total),
        );
    } else if (m.step === 0.5) {
        m.row.setAttribute('role', 'slider');
        m.row.setAttribute('aria-valuemin', '0');
        m.row.setAttribute('aria-valuemax', String(total));
        m.row.setAttribute('aria-valuenow', String(plain(m.draft)));
        m.row.setAttribute('aria-valuetext', m.draft <= 0 ? s.ratingUnrated : s.ratingOutOf(plain(m.draft), total));
        m.row.setAttribute('aria-label', item ? s.ratingGroupName(item) : s.ratingGroupNameBare);
        m.row.tabIndex = focusable(m) ? 0 : -1;
    } else {
        m.row.setAttribute('role', 'radiogroup');
        m.row.setAttribute('aria-label', item ? s.ratingGroupName(item) : s.ratingGroupNameBare);
        const stop = m.draft > 0 ? Math.round(m.draft) - 1 : 0;
        m.stars.forEach((star, i) => {
            const n = i + 1;
            const label = m.labels[i];
            star.setAttribute('role', 'radio');
            star.setAttribute('aria-checked', String(Math.round(m.draft) === n));
            star.setAttribute('aria-label', label ? s.ratingStarNameLabel(n, total, label) : s.ratingStarName(n, total));
            star.tabIndex = focusable(m) && i === stop ? 0 : -1;
            star.setAttribute('aria-disabled', String(!interactive(m)));
        });
    }
    if (mode === 'display') for (const star of m.stars) star.removeAttribute('role');
    if (mode === 'input' && disabled(m)) m.row.setAttribute('aria-disabled', 'true');
    else m.row.removeAttribute('aria-disabled');
    // The caption keeps its line in every state, so a value arriving moves nothing.
    m.caption.textContent = st === 'ready' ? wordsOf(m, shown) : ' ';
    // The reason a rating cannot be changed now, visible under the row and described to a screen reader.
    const why = disabled(m) ? (m.el.getAttribute('data-kp-disabled-reason') ?? '') : '';
    m.reason.textContent = why;
    m.reason.hidden = why === '';
    const describe = [m.caption.id, why ? m.reason.id : ''].filter(Boolean).join(' ');
    if (mode === 'input') m.row.setAttribute('aria-describedby', describe);
    else m.row.removeAttribute('aria-describedby');
    if (mode === 'input' && readonly(m)) m.row.setAttribute('aria-readonly', 'true');
    else m.row.removeAttribute('aria-readonly');
    // The clear button and the pending pair.
    const pending = m.draft !== m.value;
    const clearButton = /** @type {HTMLButtonElement} */ (m.actions.querySelector('.kp-rating__clear'));
    clearButton.textContent = s.ratingClear;
    clearButton.setAttribute('aria-label', item ? s.ratingClearName(item) : s.ratingClear);
    const canClear = mode === 'input' && attr(m, 'clear') !== 'off';
    const clearNow = canClear && interactive(m) && m.value > 0 && !pending;
    clearButton.hidden = !canClear;
    clearButton.toggleAttribute('data-kp-off', !clearNow);
    clearButton.disabled = !clearNow;
    const save = /** @type {HTMLButtonElement} */ (m.actions.querySelector('.kp-rating__save'));
    const drop = /** @type {HTMLButtonElement} */ (m.actions.querySelector('.kp-rating__drop'));
    save.textContent = s.ratingConfirm;
    drop.textContent = s.ratingCancel;
    save.hidden = drop.hidden = !pending;
    m.actions.hidden = clearButton.hidden && save.hidden;
    if (pending) m.caption.textContent = s.ratingPending(plain(m.draft), total);
    if (m.field) m.field.value = m.value > 0 ? String(plain(m.value)) : '';
}

/** @param {RatingModel} m @param {string} text */
function say(m, text) {
    m.live.textContent = '';
    window.setTimeout(() => {
        m.live.textContent = text;
    }, 30);
}

/** @param {RatingModel} m @param {string} text */
function tell(m, text) {
    window.clearTimeout(m.flashTimer);
    m.flash.textContent = text;
    m.flash.hidden = text === '';
    if (text === '') return;
    const ms = Number(m.el.getAttribute('data-kp-flash-error-ms'));
    m.flashTimer = window.setTimeout(() => tell(m, ''), Number.isFinite(ms) && ms > 0 ? ms : 3000);
}

/** The pop of the star just chosen, where motion is allowed. @param {RatingModel} m @param {number} value */
function pop(m, value) {
    if (value <= 0 || !motionAllowed(m.el)) return;
    const star = m.stars[Math.ceil(value) - 1];
    if (!star) return;
    star.removeAttribute('data-kp-popped');
    void star.offsetWidth;
    star.setAttribute('data-kp-popped', '');
}

/**
 * A person changed the rating. The event can be refused; `wait()` hands over a save.
 * @param {RatingModel} m @param {number} next @param {RatingSource} source
 */
function commit(m, next, source) {
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
    const finish = () => {
        m.busy = false;
        paint(m);
        if (announceLevel(m) !== 'off') say(m, value > 0 ? s.ratingAnnounce(item, plain(value), m.max) : s.ratingAnnounceCleared(item));
        const ms = m.el.hasAttribute('data-kp-undo-ms') ? Number(m.el.getAttribute('data-kp-undo-ms')) : 6000;
        if (source !== 'undo' && ms > 0) {
            undoToast(value > 0 ? s.ratingToast(item, value) : s.ratingToastCleared(item), {
                mode: 'revert',
                ms,
                undo: () => commit(m, previous, 'undo'),
            });
        }
    };
    if (waits.length === 0) {
        finish();
        return;
    }
    m.busy = true;
    paint(m);
    void Promise.all(waits).then(finish, () => {
        m.value = m.draft = previous;
        m.busy = false;
        paint(m);
        tell(m, s.ratingSaveFailed(item));
    });
}

/** A star's value from a pointer: a half where the step is a half. @param {RatingModel} m @param {number} n @param {PointerEvent | MouseEvent} event */
function valueAt(m, n, event) {
    if (m.step !== 0.5) return n;
    const star = m.stars[n - 1];
    if (!star) return n;
    const box = star.getBoundingClientRect();
    const rtl = getComputedStyle(star).direction === 'rtl';
    const left = rtl ? event.clientX > box.left + box.width / 2 : event.clientX < box.left + box.width / 2;
    return left ? n - 0.5 : n;
}

/** @param {RatingModel} m @param {number} value @param {RatingSource} source */
function choose(m, value, source) {
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

/** @param {RatingModel} m */
function focusStar(m) {
    const target = m.step === 0.5 ? m.row : (m.stars[Math.max(0, Math.round(m.draft) - 1)] ?? m.stars[0]);
    target?.focus({ preventScroll: true });
}

/**
 * Draw the stars of one rating and wire it.
 * @param {HTMLElement} el @param {RatingOptions} options
 * @returns {() => void}
 */
function wire(el, options) {
    serial += 1;
    const number = (/** @type {string} */ name, /** @type {number} */ fallback) => {
        const raw = el.getAttribute(`data-kp-rating-${name}`);
        const n = raw === null ? Number.NaN : Number(raw);
        return Number.isFinite(n) ? n : fallback;
    };
    const max = Math.round(clamp(number('max', options.max ?? 5), 3, 10));
    const step = el.getAttribute('data-kp-rating-step') === '0.5' || options.step === 0.5 ? 0.5 : 1;
    const mode = (el.getAttribute('data-kp-rating-mode') ?? options.mode) === 'display' ? 'display' : 'input';
    const value = snapRating(number('value', 0), max, mode === 'display' ? 0.01 : step);
    const before = [...el.childNodes];
    const row = make('div', 'kp-rating__row');
    const stars = Array.from({ length: max }, (_, i) => {
        const star = make('span', 'kp-rating__star');
        star.dataset.kpStar = String(i + 1);
        star.append(glyph());
        return star;
    });
    row.append(...stars);
    const caption = make('span', 'kp-rating__caption');
    caption.id = `kp-rating-${serial}-caption`;
    const actions = make('span', 'kp-rating__actions');
    const clear = make('button', 'kp-button kp-button--sm kp-rating__clear');
    clear.type = 'button';
    const save = make('button', 'kp-button kp-button--sm kp-button--primary kp-rating__save');
    save.type = 'button';
    const drop = make('button', 'kp-button kp-button--sm kp-rating__drop');
    drop.type = 'button';
    actions.append(clear, save, drop);
    const reason = make('span', 'kp-rating__reason');
    reason.id = `kp-rating-${serial}-reason`;
    reason.hidden = true;
    const flash = make('span', 'kp-rating__flash');
    flash.setAttribute('role', 'alert');
    flash.hidden = true;
    const live = make('span', 'kp-sr-only kp-rating__live');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    const failure = make('span', 'kp-alert kp-alert--destructive kp-rating__failure');
    failure.setAttribute('role', 'alert');
    failure.hidden = true;
    const failureText = make('span', 'kp-rating__failure-text');
    const retry = make('button', 'kp-button kp-rating__retry');
    retry.type = 'button';
    failure.append(failureText, retry);
    const name = el.getAttribute('data-kp-rating-name');
    const field = name ? Object.assign(make('input'), { type: 'hidden', name }) : null;
    const foot = make('span', 'kp-rating__foot');
    foot.append(caption, actions);
    const body = make('span', 'kp-rating__body');
    body.append(row, foot, reason, flash, failure, live, ...(field ? [field] : []));
    el.replaceChildren(body);
    /** @type {RatingModel} */
    const m = {
        el,
        max,
        step,
        mode,
        value,
        draft: value,
        preview: null,
        labels: parseLabels(el.getAttribute('data-kp-rating-labels') ?? undefined),
        row,
        stars,
        caption,
        reason,
        flash,
        live,
        failure,
        actions,
        field,
        busy: false,
        flashTimer: 0,
    };
    models.set(el, m);
    const syncState = () => {
        const st = state(m);
        const s = getStrings();
        failure.hidden = st !== 'error';
        failureText.textContent = s.ratingFailedRead;
        retry.textContent = s.ratingRetry;
        // The stars and their words stay laid out (hidden from sight and from the keyboard), so the plate that stands over them is exactly their size.
        row.inert = foot.inert = st === 'error';
        el.toggleAttribute('data-kp-loading', st === 'loading');
        paint(m);
    };
    syncState();

    /** @param {Event} event @returns {number} the star's number, 0 when none */
    const starOf = (event) => {
        const star = event.target instanceof Element ? event.target.closest('.kp-rating__star') : null;
        return star instanceof HTMLElement ? Number(star.dataset.kpStar) : 0;
    };
    /** @param {PointerEvent} event */
    const onOver = (event) => {
        if (attr(m, 'preview') === 'off' || event.pointerType !== 'mouse' || !interactive(m)) return;
        const n = starOf(event);
        if (!n) return;
        m.preview = valueAt(m, n, event);
        paint(m);
    };
    const onLeave = () => {
        if (m.preview === null) return;
        m.preview = null;
        paint(m);
    };
    /** @param {MouseEvent} event */
    const onClick = (event) => {
        const n = starOf(event);
        if (!n || !interactive(m)) return;
        m.preview = null;
        choose(m, valueAt(m, n, event), 'pointer');
    };
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        if (!interactive(m) || event.altKey || event.ctrlKey || event.metaKey) return;
        const rtl = getComputedStyle(el).direction === 'rtl';
        // Nothing chosen yet: an arrow goes from the star that has the focus, as a native radio group does.
        const focusedStar = event.target instanceof HTMLElement ? Number(event.target.closest('.kp-rating__star')?.getAttribute('data-kp-star')) : 0;
        const at = m.draft > 0 || m.step === 0.5 ? m.draft : focusedStar || 1;
        /** @type {number | null} */
        let to = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') to = at + (event.key === 'ArrowRight' && rtl ? -m.step : m.step);
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') to = at - (event.key === 'ArrowLeft' && rtl ? -m.step : m.step);
        else if (event.key === 'Home') to = m.step;
        else if (event.key === 'End') to = m.max;
        else if ((event.key === 'Backspace' || event.key === 'Delete') && attr(m, 'clear') !== 'off') {
            event.preventDefault();
            if (m.value > 0 || m.draft > 0) {
                m.draft = 0;
                commit(m, 0, 'clear');
                focusStar(m);
            }
            return;
        } else if (event.key === ' ' || event.key === 'Enter') {
            const focused = event.target instanceof HTMLElement ? Number(event.target.closest('.kp-rating__star')?.getAttribute('data-kp-star')) : 0;
            if (!focused) return;
            event.preventDefault();
            choose(m, focused, 'keyboard');
            return;
        }
        if (to === null) return;
        event.preventDefault();
        const next = clamp(to, m.step, m.max);
        choose(m, next, 'keyboard');
        // A pick held for Save stays a draft; the focus follows it either way.
        window.setTimeout(() => focusStar(m), 0);
    };
    /** @param {MouseEvent} event */
    const onActions = (event) => {
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (!button) return;
        if (button === clear) commit(m, 0, 'clear');
        else if (button === save) commit(m, m.draft, 'pointer');
        else if (button === drop) {
            m.draft = m.value;
            paint(m);
        }
    };
    const onRetry = () => el.dispatchEvent(new CustomEvent(RATING_RETRY_EVENT, { bubbles: true }));
    row.addEventListener('pointerover', onOver);
    row.addEventListener('pointerleave', onLeave);
    row.addEventListener('click', onClick);
    row.addEventListener('keydown', onKey);
    actions.addEventListener('click', onActions);
    retry.addEventListener('click', onRetry);
    // A change of the scale, the step or the mode draws the row again; the other options are read as they are used.
    const watch = new MutationObserver((records) => {
        if (
            records.some(
                (r) =>
                    r.attributeName === 'data-kp-rating-max' ||
                    r.attributeName === 'data-kp-rating-step' ||
                    r.attributeName === 'data-kp-rating-mode',
            )
        ) {
            const value = number('value', m.value);
            detach();
            const again = wire(el, options);
            const next = models.get(el);
            if (next) {
                next.value = next.draft = snapRating(value, next.max, next.mode === 'display' ? 0.01 : next.step);
                paint(next);
            }
            void again;
            return;
        }
        m.labels = parseLabels(el.getAttribute('data-kp-rating-labels') ?? undefined);
        if (records.some((r) => r.attributeName === 'data-kp-rating-value'))
            m.value = m.draft = snapRating(number('value', m.value), m.max, m.mode === 'display' ? 0.01 : m.step);
        syncState();
    });
    watch.observe(el, {
        attributes: true,
        attributeFilter: [
            'data-kp-rating-max',
            'data-kp-rating-step',
            'data-kp-rating-mode',
            'data-kp-rating-value',
            'data-kp-rating-labels',
            'data-kp-rating-size',
            'data-kp-rating-unrated-text',
            'data-kp-rating-clear',
            'data-kp-state',
            'data-kp-disabled',
            'data-kp-disabled-reason',
            'data-kp-readonly',
            'data-kp-rating-for',
            'aria-label',
            'data-kp-rating-count',
        ],
    });
    const detach = () => {
        window.clearTimeout(m.flashTimer);
        watch.disconnect();
        row.removeEventListener('pointerover', onOver);
        row.removeEventListener('pointerleave', onLeave);
        row.removeEventListener('click', onClick);
        row.removeEventListener('keydown', onKey);
        actions.removeEventListener('click', onActions);
        retry.removeEventListener('click', onRetry);
        el.replaceChildren(...before);
        el.removeAttribute('aria-busy');
        el.style.removeProperty('--kp-rating-max');
        models.delete(el);
    };
    return detach;
}

/**
 * @typedef {object} RatingOptions
 * @property {number} [max] the scale, 3 to 10 (default 5)
 * @property {1 | 0.5} [step] whole or half stars (default 1)
 * @property {'input' | 'display'} [mode] a row to set, or one to read (default input)
 */

/**
 * Draw and wire every rating under `root`.
 * @param {ParentNode} [root]
 * @param {RatingOptions} [options] defaults; each element's own `data-kp-rating-*` wins
 * @returns {() => void} detach
 */
export function attachRatings(root = document, options = {}) {
    /** @type {(() => void)[]} */
    const undo = [];
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(RATING) ? [root] : []),
        ...root.querySelectorAll(RATING),
    ]);
    for (const el of found) if (!models.has(el)) undo.push(wire(el, options));
    return () => undo.splice(0).forEach((off) => off());
}

/**
 * @typedef {object} RatingHandle
 * @property {HTMLElement} element
 * @property {() => number} value 0 is not rated
 * @property {(value: number) => void} set replace the value (no event)
 * @property {(state: 'ready' | 'loading' | 'error') => void} setState
 * @property {() => void} focus
 */

/**
 * The handle of an attached rating.
 * @param {Element} element
 * @returns {RatingHandle | null}
 */
export function rating(element) {
    const m = models.get(element);
    if (!m) return null;
    return {
        element: m.el,
        value: () => m.value,
        set: (value) => setRating(m.el, value),
        setState: (next) => setRatingState(m.el, next),
        focus: () => focusStar(m),
    };
}

/**
 * Set the value from a script, without the event (the page read it from somewhere).
 * @param {Element} element @param {number} value 0 clears
 */
export function setRating(element, value) {
    const m = models.get(element);
    if (!m) return;
    m.value = m.draft = snapRating(value, m.max, m.mode === 'display' ? 0.01 : m.step);
    m.el.setAttribute('data-kp-rating-value', String(m.value));
    paint(m);
}

/**
 * The state: `loading` (dashed stars that pulse, the row's size kept), `error` (the stars replaced at the same size by
 * "Could not read the rating" and Retry), `ready`.
 * @param {Element} element @param {'ready' | 'loading' | 'error'} next
 */
export function setRatingState(element, next) {
    if (!(element instanceof HTMLElement)) return;
    if (next === 'ready') element.removeAttribute('data-kp-state');
    else element.setAttribute('data-kp-state', next);
}

/**
 * A rating inside a data table cell: the display row, and the number the table sorts and filters the cell by.
 * @param {HTMLElement} cell the `td` (or any element inside one)
 * @param {number} value 0 is not rated
 * @param {{ max?: number, count?: number, for?: string }} [options]
 * @returns {HTMLElement} the rating element
 */
export function ratingCell(cell, value, { max = 5, count, for: item } = {}) {
    let host = /** @type {HTMLElement | null} */ (cell.querySelector(':scope > .kp-rating'));
    if (!host) {
        host = make('span', 'kp-rating');
        cell.replaceChildren(host);
    }
    host.setAttribute('data-kp-rating', '');
    host.setAttribute('data-kp-rating-mode', 'display');
    host.setAttribute('data-kp-rating-max', String(max));
    host.setAttribute('data-kp-rating-value', String(value));
    if (count !== undefined) host.setAttribute('data-kp-rating-count', String(count));
    if (item !== undefined) host.setAttribute('data-kp-rating-for', item);
    const target = cell.closest('td, th') ?? cell;
    target.setAttribute('data-kp-sort-value', String(value));
    const known = models.get(host);
    if (known) {
        known.value = known.draft = snapRating(value, known.max, 0.01);
        paint(known);
    } else {
        attachRatings(host);
    }
    return host;
}
