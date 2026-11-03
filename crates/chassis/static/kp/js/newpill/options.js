// Reading the options of one scroller: what the page passed beats the attribute, and the attribute beats the default.

import { getStrings } from '../strings.js';
import { resolveKeySpec } from '../key-spec.js';
import { FOLLOW_THRESHOLD, NEWPILL_FOLLOW_HEAD_KEY, NEWPILL_FOLLOW_KEY, NEWPILL_FOLLOW_KEY_ATTRIBUTE } from './values.js';

/** @typedef {import('../newpill.js').NewPillOptions} NewPillOptions */

/**
 * The options read once when the pill attaches.
 * @param {HTMLElement} el
 * @param {NewPillOptions} options
 */
export function readNewPillOptions(el, options) {
    const strings = getStrings();
    const head = (options.follow ?? el.getAttribute('data-kp-follow')) === 'head';
    const unitRaw = (options.unit ?? el.getAttribute('data-kp-pill-unit') ?? '').split(/[,/]/).map((w) => w.trim());
    return {
        strings,
        head,
        threshold: options.threshold ?? (Number(el.getAttribute('data-kp-follow-threshold')) || FOLLOW_THRESHOLD),
        unitOne: unitRaw[0] || strings.newpillUnitOne,
        unitMany: unitRaw[1] || (unitRaw[0] ? `${unitRaw[0]}s` : strings.newpillUnitMany),
        followKey: resolveKeySpec(el, NEWPILL_FOLLOW_KEY_ATTRIBUTE, options.key, head ? NEWPILL_FOLLOW_HEAD_KEY : NEWPILL_FOLLOW_KEY),
        space: options.space ?? el.hasAttribute('data-kp-follow-space'),
        inTbody: (options.rows ?? el.getAttribute('data-kp-follow-rows')) === 'tbody',
    };
}

/**
 * Which end the pill sits at; read again when `data-kp-pill-placement` changes [live-options-1019].
 * @param {HTMLElement} el @param {NewPillOptions} options @param {boolean} head
 */
export function placementOf(el, options, head) {
    const asked = options.placement ?? el.getAttribute('data-kp-pill-placement');
    return asked === 'top' ? 'top' : asked === 'bottom' ? 'bottom' : head ? 'top' : 'bottom';
}

/** Whether the "New since" divider is on; read each time, so it can be switched at runtime. @param {HTMLElement} el @param {NewPillOptions} options */
export function sinceLeftOf(el, options) {
    return options.sinceLeft ?? !['off', 'false'].includes(el.getAttribute('data-kp-since-left') ?? '');
}
