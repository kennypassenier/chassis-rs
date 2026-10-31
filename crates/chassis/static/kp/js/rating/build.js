// Builds one rating's elements: the row of stars, the caption, the Clear, Save and Cancel buttons, and the lines for reason, flash and failure.

import { STAR_PATH } from './constants.js';
import { nextRatingNumber } from './state.js';

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {string} [className] @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
export const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

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

/** The row of stars. @param {number} max */
function buildRow(max) {
    const row = make('div', 'kp-rating__row');
    const stars = Array.from({ length: max }, (_, i) => {
        const star = make('span', 'kp-rating__star');
        star.dataset.kpStar = String(i + 1);
        star.append(glyph());
        return star;
    });
    row.append(...stars);
    return { row, stars };
}

/** The Clear, Save and Cancel buttons. */
function buildActions() {
    const actions = make('span', 'kp-rating__actions');
    const clear = make('button', 'kp-button kp-button--sm kp-rating__clear');
    clear.type = 'button';
    const save = make('button', 'kp-button kp-button--sm kp-button--primary kp-rating__save');
    save.type = 'button';
    const drop = make('button', 'kp-button kp-button--sm kp-rating__drop');
    drop.type = 'button';
    actions.append(clear, save, drop);
    return { actions, clear, save, drop };
}

/** The failed-read plate with its Retry. */
function buildFailure() {
    const failure = make('span', 'kp-alert kp-alert--destructive kp-rating__failure');
    failure.setAttribute('role', 'alert');
    failure.hidden = true;
    const failureText = make('span', 'kp-rating__failure-text');
    const retry = make('button', 'kp-button kp-rating__retry');
    retry.type = 'button';
    failure.append(failureText, retry);
    return { failure, failureText, retry };
}

/**
 * Build the rating into `el`: nothing is wired here.
 * @param {HTMLElement} el @param {number} max
 */
export function buildRating(el, max) {
    const serial = nextRatingNumber();
    const { row, stars } = buildRow(max);
    const caption = make('span', 'kp-rating__caption');
    caption.id = `kp-rating-${serial}-caption`;
    const { actions, clear, save, drop } = buildActions();
    const reason = make('span', 'kp-rating__reason');
    reason.id = `kp-rating-${serial}-reason`;
    reason.hidden = true;
    const flash = make('span', 'kp-rating__flash');
    flash.setAttribute('role', 'alert');
    flash.hidden = true;
    const live = make('span', 'kp-sr-only kp-rating__live');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    const { failure, failureText, retry } = buildFailure();
    const name = el.getAttribute('data-kp-rating-name');
    const field = name ? Object.assign(make('input'), { type: 'hidden', name }) : null;
    const foot = make('span', 'kp-rating__foot');
    foot.append(caption, actions);
    const body = make('span', 'kp-rating__body');
    body.append(row, foot, reason, flash, failure, live, ...(field ? [field] : []));
    el.replaceChildren(body);
    return { row, stars, caption, actions, clear, save, drop, reason, flash, live, failure, failureText, retry, foot, field };
}
