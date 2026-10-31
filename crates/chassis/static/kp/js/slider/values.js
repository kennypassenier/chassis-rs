// A slider's selector, events and states, its pure number helpers, its options as read from the markup once at attach,
// and the words a value is written in.

import { formatBytes, resolveLocale } from '../locale.js';
import { humanDuration } from '../freshness.js';

/** @typedef {ReturnType<typeof import('../strings.js').getStrings>} Strings */


/** A slider. */
export const SLIDER = '[data-kp-slider]';
/** Fired on the slider on every move by a person: `{ values, value, thumb, text }`. */
export const SLIDER_INPUT_EVENT = 'kp-slider-input';
/** Fired on the slider when a value is committed (on release, or at once with `data-kp-commit="input"`). */
export const SLIDER_CHANGE_EVENT = 'kp-slider-change';
/** The states a slider can be in. */
export const SLIDER_STATES = /** @type {const} */ (['ready', 'loading']);

/** @param {number} n */
export const decimalsOf = (n) => {
    const text = String(n);
    const at = text.indexOf('.');
    return at < 0 ? 0 : text.length - at - 1;
};

/**
 * A value snapped to the step from the minimum, clamped, and without floating-point dust. Pure.
 * @param {number} value @param {number} min @param {number} max @param {number} step
 */
export function snapSlider(value, min, max, step) {
    const digits = Math.max(decimalsOf(step), decimalsOf(min));
    const snapped = min + Math.round((value - min) / step) * step;
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(digits));
}

/**
 * Where a value stands along the track, 0 to 100. Pure.
 * @param {number} value @param {number} min @param {number} max
 */
export function sliderPercent(value, min, max) {
    return max === min ? 0 : ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;
}

/**
 * A number typed in the box: the unit and spaces dropped, a comma read as the decimal; NaN when it is not a number. Pure.
 * @param {string} text @param {string} [unit]
 */
export function parseSliderText(text, unit = '') {
    let t = text.trim();
    if (unit && t.endsWith(unit)) t = t.slice(0, -unit.length);
    t = t.replace(/[\s ]/g, '').replace(',', '.');
    return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : Number.NaN;
}

/** A range's thumbs start at a quarter and three quarters of the track, a single one in the middle. */
const LOW_START = 0.25;
const HIGH_START = 0.75;
const MIDDLE = 0.5;

/** The ways a value may be written, and where the number shows; the first of each is the default. */
const FORMATS = ['number', 'percent', 'bytes', 'duration'];
const SHOWS = ['field', 'bubble', 'both', 'none'];

/** Where the number shows: `data-kp-slider-value`, else the field. @param {HTMLElement} el */
export const showOf = (el) => (SHOWS.slice(1).includes(el.dataset.kpSliderValue ?? '') ? /** @type {string} */ (el.dataset.kpSliderValue) : 'field');

/** A list of numbers from an attribute, split on spaces and commas. @param {string | undefined} said */
const numbersIn = (said) => (said ?? '').split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite);

/**
 * The slider's options, read once from the markup and the inputs the page wrote.
 * @param {HTMLElement} el @param {Strings} s
 */
export function readOptions(el, s) {
    const authored = /** @type {HTMLInputElement[]} */ ([...el.querySelectorAll('input[type="range"]')]);
    const first = authored[0];
    const min = Number(el.dataset.kpMin ?? first?.min ?? 0);
    const max = Number(el.dataset.kpMax ?? first?.max ?? 100);
    const step = Number(el.dataset.kpStep ?? first?.step ?? 1) || 1;
    const format = FORMATS.slice(1).includes(el.dataset.kpFormat ?? '') ? /** @type {string} */ (el.dataset.kpFormat) : 'number';
    return {
        authored,
        isRange: el.dataset.kpSlider === 'range' || authored.length === 2,
        min,
        max,
        step,
        gap: Math.max(step, Number(el.dataset.kpMinGap) || step),
        unit: el.dataset.kpUnit ?? (el.dataset.kpFormat === 'percent' ? '%' : ''),
        format,
        typed: format === 'number' || format === 'percent',
        show: showOf(el),
        commitOnInput: el.dataset.kpCommit === 'input',
        vertical: el.dataset.kpOrientation === 'vertical',
        locale: resolveLocale(el.dataset.kpLocale, el),
        label: el.getAttribute('aria-label') ?? s.sliderGroup,
        name: el.dataset.kpName ?? '',
        disabledByPage: el.hasAttribute('data-kp-disabled'),
        digits: Math.max(decimalsOf(step), decimalsOf(min)),
        initial: numbersIn(el.dataset.kpValue),
        defaults: numbersIn(el.dataset.kpDefault),
        ticks: el.dataset.kpTicks ?? '',
    };
}

/** @typedef {ReturnType<typeof readOptions>} SliderOptions */

/**
 * How a value is written: `text` for the readout, the bubble and `aria-valuetext`; `plain`, the number alone, for the box
 * (the unit stands beside it).
 * @param {SliderOptions} o @param {Strings} s
 */
export function writers(o, s) {
    const number = (/** @type {number} */ v) =>
        new Intl.NumberFormat(o.locale, { minimumFractionDigits: o.digits, maximumFractionDigits: o.digits, useGrouping: false }).format(v);
    const text = (/** @type {number} */ v) => {
        if (o.format === 'bytes') return formatBytes(v, o.locale);
        if (o.format === 'duration') return humanDuration(v, s);
        return o.unit ? `${number(v)} ${o.unit}` : number(v);
    };
    const plain = (/** @type {number} */ v) => (o.typed ? number(v) : text(v));
    return { text, plain };
}

/** The values a slider starts with: the markup's, else the page's inputs, else the default places. @param {SliderOptions} o @param {number} count */
export function startValues(o, count) {
    const span = o.max - o.min;
    let values = Array.from({ length: count }, (_, i) => {
        const fallback = o.isRange ? o.min + span * (i === 0 ? LOW_START : HIGH_START) : o.min + span * MIDDLE;
        const own = o.initial[i] ?? (o.authored[i] ? Number(o.authored[i].value) : fallback);
        return snapSlider(own, o.min, o.max, o.step);
    });
    if (o.isRange && values[0] > values[1] - o.gap) values = [values[0], Math.min(o.max, values[0] + o.gap)];
    return values;
}
