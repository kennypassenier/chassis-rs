// Pure: the number a quantity stands at, read from its attributes, written in the page's language, typed back in, kept on a step.

import { resolveLocale } from '../locale.js';

/** @typedef {import('../quantity.js').QuantityRules} QuantityRules */

/** @param {Element} root @param {string} name @param {number} fallback */
const numberAt = (root, name, fallback) => {
    const raw = root.getAttribute(name);
    const value = raw === null || raw.trim() === '' ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
};

/**
 * The decimals of a step: 0.5 has one, 50 has none.
 * @param {number} step
 */
export function decimalsOf(step) {
    const text = String(step);
    const at = text.indexOf('.');
    return at < 0 ? 0 : text.length - at - 1;
}

/** @param {Element} root @returns {QuantityRules} */
export function rulesOf(root) {
    const step = Math.abs(numberAt(root, 'data-kp-quantity-step', 1)) || 1;
    return {
        min: numberAt(root, 'data-kp-quantity-min', -Infinity),
        max: numberAt(root, 'data-kp-quantity-max', Infinity),
        step,
        decimals: decimalsOf(step),
        locale: resolveLocale(root.getAttribute('data-kp-quantity-locale') ?? undefined, root),
    };
}

/**
 * The value written in the page's language: no grouping, the step's decimals.
 * @param {number} value @param {QuantityRules} rules
 */
export function formatQuantity(value, rules) {
    return new Intl.NumberFormat(rules.locale, {
        useGrouping: false,
        minimumFractionDigits: 0,
        maximumFractionDigits: rules.decimals,
    }).format(value);
}

/**
 * Read a typed number: a comma or a point is the decimal mark; with both, the
 * last one is, and the other groups thousands. Spaces are ignored. NaN when it
 * is not a number.
 * @param {string} text
 * @returns {number}
 */
export function parseQuantity(text) {
    let t = text
        .replace(/[\s  ]/g, '')
        .replace(/^\+/, '')
        .replace(/^−/, '-');
    if (t === '') return NaN;
    const comma = t.lastIndexOf(',');
    const point = t.lastIndexOf('.');
    if (comma >= 0 && point >= 0) {
        const mark = comma > point ? ',' : '.';
        const group = mark === ',' ? '.' : ',';
        t = t.split(group).join('').replace(mark, '.');
    } else if (comma >= 0) {
        t = t.replace(',', '.');
    }
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
    return Number(t);
}

/**
 * Keep a value inside the bounds and on a step (counted from the minimum when
 * there is one, else from 0), rounded to the step's decimals.
 * @param {number} value @param {QuantityRules} rules
 */
export function settleQuantity(value, rules) {
    const base = Number.isFinite(rules.min) ? rules.min : 0;
    const steps = Math.round((value - base) / rules.step);
    let settled = base + steps * rules.step;
    settled = Math.min(rules.max, Math.max(rules.min, settled));
    const factor = 10 ** rules.decimals;
    return Math.round(settled * factor) / factor;
}
