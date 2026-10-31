// Brings the stars, the names, the caption and the buttons in step with the rating's model.

import { getStrings } from '../strings.js';
import { attr, disabled, focusable, interactive, itemName, readonly, state, wordsOf } from './read.js';
import { clamp, plain } from './math.js';

/** @typedef {import('./controller.js').RatingController} Rating */

/** The host's classes, busy mark and the scale. @param {Rating} m */
function paintHost(m) {
    const st = state(m);
    const size = attr(m, 'size') ?? (m.mode === 'display' ? 'sm' : 'md');
    m.el.toggleAttribute('data-kp-rating-busy', m.busy);
    m.el.classList.toggle('kp-rating--display', m.mode === 'display');
    m.el.classList.toggle('kp-rating--input', m.mode === 'input');
    for (const name of ['sm', 'md', 'lg']) m.el.classList.toggle(`kp-rating--${name}`, name === size);
    m.el.setAttribute('aria-busy', String(st === 'loading' || m.busy));
    m.el.toggleAttribute('data-kp-previewing', m.preview !== null);
    m.el.style.setProperty('--kp-rating-max', String(m.max));
}

/** How much of each star is lit. @param {Rating} m @param {number} shown */
function paintStars(m, shown) {
    m.stars.forEach((star, i) => {
        const lit = clamp(shown - i, 0, 1);
        star.style.setProperty('--kp-rating-fill', String(lit));
        star.toggleAttribute('data-kp-lit', lit > 0);
        star.toggleAttribute('data-kp-whole', lit >= 1);
    });
}

/** The row as one image (display), one slider (half stars), or a radio group of stars. @param {Rating} m */
function paintRole(m) {
    const s = getStrings();
    const item = itemName(m);
    const total = m.max;
    if (m.mode === 'display') {
        const count = Number(attr(m, 'count'));
        m.row.setAttribute('role', 'img');
        m.row.setAttribute(
            'aria-label',
            m.value <= 0
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
    if (m.mode === 'display') for (const star of m.stars) star.removeAttribute('role');
    if (m.mode === 'input' && disabled(m)) m.row.setAttribute('aria-disabled', 'true');
    else m.row.removeAttribute('aria-disabled');
}

/** The caption (it keeps its line in every state), the reason a rating is locked, and what describes the row. @param {Rating} m @param {number} shown */
function paintCaption(m, shown) {
    m.caption.textContent = state(m) === 'ready' ? wordsOf(m, shown) : ' ';
    // The reason a rating cannot be changed now, visible under the row and described to a screen reader.
    const why = disabled(m) ? (m.el.getAttribute('data-kp-disabled-reason') ?? '') : '';
    m.reason.textContent = why;
    m.reason.hidden = why === '';
    const describe = [m.caption.id, why ? m.reason.id : ''].filter(Boolean).join(' ');
    if (m.mode === 'input') m.row.setAttribute('aria-describedby', describe);
    else m.row.removeAttribute('aria-describedby');
    if (m.mode === 'input' && readonly(m)) m.row.setAttribute('aria-readonly', 'true');
    else m.row.removeAttribute('aria-readonly');
}

/** The Clear button, the pending Save and Cancel pair, the pending caption and the hidden field. @param {Rating} m */
function paintActions(m) {
    const s = getStrings();
    const item = itemName(m);
    const pending = m.draft !== m.value;
    const clearButton = /** @type {HTMLButtonElement} */ (m.actions.querySelector('.kp-rating__clear'));
    clearButton.textContent = s.ratingClear;
    clearButton.setAttribute('aria-label', item ? s.ratingClearName(item) : s.ratingClear);
    const canClear = m.mode === 'input' && attr(m, 'clear') !== 'off';
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
    if (pending) m.caption.textContent = s.ratingPending(plain(m.draft), m.max);
    if (m.field) m.field.value = m.value > 0 ? String(plain(m.value)) : '';
}

/** Bring the stars, the names and the caption in step with the model. @param {Rating} m */
export function paint(m) {
    const shown = m.preview ?? m.draft;
    paintHost(m);
    paintStars(m, shown);
    paintRole(m);
    paintCaption(m, shown);
    paintActions(m);
}
