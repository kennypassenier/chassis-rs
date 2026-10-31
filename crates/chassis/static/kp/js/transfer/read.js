// What a transfer row's attributes ask for: the byte base, a number option, the parts shown, and a byte count in words.

import { formatBytes } from '../locale.js';

/** The two byte bases: 1000, or 1024 to match a host's MB. */
const BASE_DECIMAL = 1000;
const BASE_BINARY = 1024;

/** @param {Element} row */
const baseOf = (row) => (row.getAttribute('data-kp-bytes-base') === String(BASE_BINARY) ? BASE_BINARY : BASE_DECIMAL);

/** @param {Element} row @param {string} name @param {number} fallback */
export const numberOf = (row, name, fallback) => {
    const n = Number(row.getAttribute(name));
    return row.hasAttribute(name) && Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** @param {Element} row @param {number} bytes */
export const size = (row, bytes) => formatBytes(bytes, undefined, { base: baseOf(row) });

/** @param {Element} row @param {string} part */
export const shows = (row, part) => {
    const list = row.getAttribute('data-kp-show');
    return list === null || list.split(/[\s,]+/).includes(part);
};
