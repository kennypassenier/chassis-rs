// Reading the options of one banner from its attributes, each time it needs them so they can be switched at runtime.

import { DEFAULT_BACK_MS, DEFAULT_DELAYS, DEFAULT_GRACE_MS } from './values.js';

/** @param {HTMLElement} el */
export const sourceOf = (el) => el.getAttribute('data-kp-connection-source') ?? 'both';

/** A drop shorter than this shows nothing [ms]. @param {HTMLElement} el */
export function graceOf(el) {
    const n = Number(el.getAttribute('data-kp-connection-grace') ?? DEFAULT_GRACE_MS);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_GRACE_MS;
}

/** How long "Connected again" stays [ms]. @param {HTMLElement} el */
export function backMsOf(el) {
    const n = Number(el.getAttribute('data-kp-back-ms') ?? DEFAULT_BACK_MS);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_BACK_MS;
}

/** The seconds between automatic tries; none when the page says "off". @param {HTMLElement} el */
export function delaysOf(el) {
    const raw = el.getAttribute('data-kp-retry-delays');
    if (raw === 'off') return [];
    const list = (raw ?? DEFAULT_DELAYS.join(','))
        .split(/[\s,]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0);
    return list.length ? list : DEFAULT_DELAYS;
}
