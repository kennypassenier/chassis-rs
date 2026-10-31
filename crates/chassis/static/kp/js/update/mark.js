// The mark an update puts on its host while it plays, and the inline styles it replaces and puts back.

import { UPDATE_STYLE, UPDATING_ATTRIBUTE } from './values.js';

/**
 * Put the mark on: the theme's timing as inline custom properties, an
 * inline host as an inline-block (a transform and an overlay need a box),
 * the attribute last. No reflow of its own: a mark that was on came off
 * before the batch read the host's style, so setting it again starts the
 * keyframes again.
 * @param {HTMLElement} host
 * @param {string} idea
 * @param {{ duration: number, ease: string }} timing
 * @param {{ inline?: boolean }} [options] whether the host is laid out inline now
 * @returns {Record<string, string>} the inline values update() replaced, to put back
 */
export function markUpdating(host, idea, timing, { inline = false } = {}) {
    /** @type {Record<string, string>} */
    const before = {};
    for (const name of UPDATE_STYLE) before[name] = host.style.getPropertyValue(name);
    if (inline) host.style.setProperty('display', 'inline-block');
    host.style.setProperty('--kp-update-duration', `${timing.duration}ms`);
    host.style.setProperty('--kp-update-ease', timing.ease);
    host.setAttribute(UPDATING_ATTRIBUTE, idea);
    return before;
}

/**
 * Take the mark off and put back what markUpdating() replaced.
 * @param {HTMLElement} host
 * @param {Record<string, string>} before
 */
export function unmarkUpdating(host, before) {
    host.removeAttribute(UPDATING_ATTRIBUTE);
    for (const name of UPDATE_STYLE) {
        if (before[name]) host.style.setProperty(name, before[name]);
        else host.style.removeProperty(name);
    }
}
