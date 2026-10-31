// The tour's memory, through js/remember.js: whether a tour of a name was taken before, and forgetting it.

import { REMEMBER_ATTRIBUTE, memoryFor } from '../remember.js';

/** The slot a tour's memory is kept under. */
export const TOUR_SLOT = 'done';

/**
 * The tour's memory, through js/remember.js: component `tour`, the tour's
 * name as the element's name. A tour has no element of its own, so a
 * stand-in answers to the name; it is never in a document, so two tours of
 * one name never refuse each other.
 * @param {string} name
 * @param {Storage | null} [storage]
 */
export function tourMemory(name, storage) {
    const holder = /** @type {Element} */ (
        /** @type {unknown} */ ({ getAttribute: (/** @type {string} */ attr) => (attr === REMEMBER_ATTRIBUTE ? name : null), isConnected: false })
    );
    return memoryFor(holder, 'tour', storage === undefined ? {} : { storage });
}

/**
 * The storage key a finished tour writes, as js/remember.js composes it:
 * `kp-remember:tour:<name>:done` with the default prefix.
 * @param {string} name
 * @returns {string}
 */
export const tourMemoryKey = (name) => tourMemory(name)?.key(TOUR_SLOT) ?? '';

/**
 * Whether the tour of this name was taken before (finished or skipped).
 * @param {string} name
 * @param {{ storage?: Storage | null }} [options]
 * @returns {boolean}
 */
export const tourRemembered = (name, { storage } = {}) => tourMemory(name, storage)?.read(TOUR_SLOT, /** @type {unknown} */ (false)) === true;

/**
 * Forget that the tour of this name was taken, so it starts by itself again.
 * @param {string} name
 * @param {{ storage?: Storage | null }} [options]
 */
export const forgetTour = (name, { storage } = {}) => tourMemory(name, storage)?.forget(TOUR_SLOT);
