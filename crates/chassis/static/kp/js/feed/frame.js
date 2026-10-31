// Builds the fixed frame of a feed (head, body, foot, live line) and the skeleton rows a loading feed shows.

import { SKELETON_DAYS, SKELETON_ROWS } from './constants.js';
import { make } from './dom.js';

/**
 * The parts of a feed that stay for its whole life; the rows and plates are poured into them.
 * @param {Document} doc
 */
export function buildFrame(doc) {
    const head = make(doc, 'div', 'kp-feed__head');
    const count = make(doc, 'span', 'kp-feed__count');
    const fresh = make(doc, 'time', 'kp-ago kp-feed__fresh');
    fresh.setAttribute('data-kp-ago', '');
    const stale = make(doc, 'div', 'kp-feed__stale');
    const staleText = make(doc, 'span', 'kp-feed__stale-text');
    const staleAction = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-button--sm kp-feed__stale-action'));
    staleAction.type = 'button';
    staleAction.setAttribute('data-kp-feed-retry', '');
    stale.append(staleText, staleAction);
    head.append(count, fresh, stale);
    const body = make(doc, 'div', 'kp-feed__body');
    const skeleton = make(doc, 'div', 'kp-feed__skeleton');
    skeleton.setAttribute('aria-hidden', 'true');
    const list = make(doc, 'ol', 'kp-feed__list');
    const state = make(doc, 'div', 'kp-feed__state');
    body.append(skeleton, list, state);
    const foot = make(doc, 'div', 'kp-feed__foot');
    const voice = make(doc, 'span', 'kp-sr-only');
    voice.setAttribute('role', 'status');
    voice.setAttribute('aria-live', 'polite');
    return { head, count, fresh, stale, staleText, staleAction, body, skeleton, list, state, foot, voice };
}

/** Skeleton rows with the final geometry: two days, the marks, two lines, a chip and a time each. @param {Document} doc */
export function skeletonRows(doc) {
    const out = [];
    for (let day = 0; day < SKELETON_DAYS; day += 1) {
        const group = make(doc, 'div', 'kp-feed__skel-group');
        group.append(make(doc, 'span', 'kp-feed__skel-day kp-skeleton'));
        for (let row = 0; row < SKELETON_ROWS; row += 1) {
            const line = make(doc, 'div', 'kp-feed__skel-row');
            line.append(
                make(doc, 'span', 'kp-feed__skel-mark kp-skeleton kp-skeleton--circle'),
                make(doc, 'span', 'kp-feed__skel-text kp-skeleton'),
                make(doc, 'span', 'kp-feed__skel-chip kp-skeleton'),
                make(doc, 'span', 'kp-feed__skel-when kp-skeleton'),
            );
            group.append(line);
        }
        out.push(group);
    }
    return out;
}
