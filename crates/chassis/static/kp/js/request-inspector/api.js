// What a page tells an inspector: the list of requests to show, and the card's state.

import { setCardState } from '../card-state.js';
import { controllerOf } from '../controller.js';
import { getStrings } from '../strings.js';
import { RequestInspector } from './controller.js';
import { REQUESTS_MAX, make } from './format.js';
import { draw } from './list.js';

/** @typedef {import('./format.js').Memory} Memory */
/** @typedef {import('./format.js').CapturedRequest} CapturedRequest */

/** The memory of an attached inspector. @param {HTMLElement} el */
const memoryOf = (el) => controllerOf(el, RequestInspector)?.memory;

/**
 * Show a list of requests, newest first. An empty list is the empty state.
 * @param {HTMLElement} el
 * @param {readonly CapturedRequest[]} requests
 */
export function setRequests(el, requests) {
    const memory = memoryOf(el);
    if (!memory) return;
    memory.list = [...requests];
    memory.shown = memory.options.max ?? REQUESTS_MAX;
    draw(el, memory);
    setRequestsState(el, requests.length === 0 ? 'empty' : 'ready');
}

/**
 * Put the list in one of the card's four states.
 * @param {HTMLElement} el
 * @param {'loading' | 'empty' | 'error' | 'ready'} state
 * @param {{ message?: string }} [options] the sentence of a failed list
 */
export function setRequestsState(el, state, options = {}) {
    const strings = getStrings();
    const doc = el.ownerDocument;
    if (state === 'empty') {
        /** @type {HTMLElement | null} */
        let action = null;
        if (el.getAttribute('data-kp-requests-test') !== 'false') {
            action = make(doc, 'kp-button kp-button--primary', 'button');
            action.setAttribute('type', 'button');
            action.setAttribute('data-kp-requests-send', '');
            action.textContent = strings.reqSendTest;
        }
        setCardState(el, 'empty', { title: strings.reqEmptyTitle, text: strings.reqEmptyText, action });
        return;
    }
    if (state === 'error') {
        setCardState(el, 'error', { title: strings.reqFailedTitle, text: options.message });
        return;
    }
    setCardState(el, state, state === 'loading' ? { words: strings.reqLoading } : undefined);
}
