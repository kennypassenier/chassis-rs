// What the gates of a page share: the registry of attached gates, the controls a gate guards, the gates that guard the same control, and whether one still holds it.

import { ACK_GATE } from './values.js';

/** @typedef {import('../ack-gate.js').AckHandle} AckHandle */

/** The handle of every attached gate. @type {WeakMap<Element, AckHandle>} */
export const HANDLES = new WeakMap();

/** @param {Element} gate @returns {HTMLElement[]} */
export const targetsOf = (gate) => {
    const selector = gate.getAttribute('data-kp-ack-for');
    if (!selector) return [];
    try {
        return /** @type {HTMLElement[]} */ ([...gate.ownerDocument.querySelectorAll(selector)]);
    } catch {
        return [];
    }
};

/** The gates that guard the same control as `gate`, itself included. @param {Element} gate @returns {HTMLElement[]} */
export const siblingsOf = (gate) => {
    const mine = targetsOf(gate);
    return /** @type {HTMLElement[]} */ ([...gate.ownerDocument.querySelectorAll(ACK_GATE)]).filter(
        (other) => HANDLES.has(other) && targetsOf(other).some((t) => mine.includes(t)),
    );
};

/** Whether a gate holds the control back: unticked and in play. @param {HTMLElement} gate */
export const open = (gate) => {
    const state = gate.getAttribute('data-kp-state');
    if (state === 'empty' || gate.hidden) return false;
    return HANDLES.get(gate)?.checked() !== true;
};
