// The parts a compare slider adds to its two panes, built but not yet placed: the side labels, the divider with its handle, and the loading plate.

import { ALL_AFTER, ALL_BEFORE } from './values.js';

/** A label that marks one side. @param {Document} doc @param {'before' | 'after'} side @param {string} words */
function buildLabel(doc, side, words) {
    const label = doc.createElement('span');
    label.className = `kp-compare__label kp-compare__label--${side}`;
    label.textContent = words;
    label.setAttribute('aria-hidden', 'true');
    return label;
}

/** The divider: a slider handle with its grip. @param {Document} doc @param {string} name the handle's accessible name */
function buildDivider(doc, name) {
    const divider = doc.createElement('div');
    divider.className = 'kp-compare__divider';
    const handle = doc.createElement('span');
    handle.className = 'kp-compare__handle';
    handle.tabIndex = 0;
    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-label', name);
    handle.setAttribute('aria-valuemin', String(ALL_AFTER));
    handle.setAttribute('aria-valuemax', String(ALL_BEFORE));
    handle.setAttribute('aria-orientation', 'horizontal');
    const grip = doc.createElement('span');
    grip.className = 'kp-compare__grip';
    grip.setAttribute('aria-hidden', 'true');
    handle.append(grip);
    divider.append(handle);
    return { divider, handle };
}

/**
 * @param {Document} doc @param {string} wordBefore @param {string} wordAfter @param {string} name the handle's accessible name
 */
export function buildCompareParts(doc, wordBefore, wordAfter, name) {
    // While an image loads, a quiet plate covers the box and the busy card stands in its middle; a failed image says so in its pane.
    const wait = doc.createElement('span');
    wait.className = 'kp-compare__wait';
    wait.setAttribute('aria-hidden', 'true');
    return { labelBefore: buildLabel(doc, 'before', wordBefore), labelAfter: buildLabel(doc, 'after', wordAfter), ...buildDivider(doc, name), wait };
}
