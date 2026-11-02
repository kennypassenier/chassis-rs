// A step's `body`: the longer detail under its text, a Node the page built or Markdown drawn with the package's own reader.

import { markdownFragment } from '../markdown.js';

/** @typedef {import('./constants.js').FocusStep} FocusStep */

/**
 * Add a step's body to the step holder, after its text. A string is Markdown (nothing in it is parsed as HTML); a Node is
 * copied, so drawing the step again never moves the page's own node. A step without a body adds nothing.
 * @param {HTMLElement} holder
 * @param {FocusStep} step
 */
export function appendBody(holder, step) {
    const { body } = step;
    if (body === undefined || body === '') return;
    const detail = holder.ownerDocument.createElement('div');
    detail.className = 'kp-focus-steps__detail';
    detail.append(typeof body === 'string' ? markdownFragment(holder.ownerDocument, body) : body.cloneNode(true));
    holder.append(detail);
}
