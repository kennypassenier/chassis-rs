// The meter: what a share and a mark draw, the words it is read by, and setMeter() that writes its share, mark, tone and ARIA.

import { getStrings } from '../strings.js';
import { FULL_PERCENT } from './values.js';

/**
 * What a meter draws for a share and a mark: the fill (0 to 1), whether the
 * share runs past the end, the mark's place (0 to 1, null without one) and
 * whether it lies past the end, and the `aria-valuenow` (0 to 100). A share
 * or a mark below 0 counts as 0; one that is not a number is not measured.
 * @param {number | null | undefined} value 0..∞ (1 is full)
 * @param {number | null | undefined} [mark] 0..∞
 * @returns {{ measured: boolean, fill: number, over: boolean, mark: number | null, markOver: boolean, now: number | null }}
 */
export function meterParts(value, mark = null) {
    const measured = value != null && Number.isFinite(value);
    const v = measured ? Math.max(0, /** @type {number} */ (value)) : 0;
    const marked = mark != null && Number.isFinite(mark);
    const m = marked ? Math.max(0, /** @type {number} */ (mark)) : 0;
    return {
        measured,
        fill: Math.min(1, v),
        over: v > 1,
        mark: marked ? Math.min(1, m) : null,
        markOver: marked && m > 1,
        now: measured ? Math.min(FULL_PERCENT, Math.round(v * FULL_PERCENT)) : null,
    };
}

/**
 * The words a meter is read by: the real share, never clamped
 * (`130% booked for tonight`), and the mark's share with its label, as
 * `62% full; 80% the target level`. No number reads `meterNotMeasured`.
 * @param {number | null | undefined} value 0..∞ (1 is full)
 * @param {number | null | undefined} [mark] 0..∞
 * @param {{ unit?: string, label?: string, markLabel?: string }} [words] `label` is `meterUsed` unless given
 * @returns {string}
 */
export function meterText(value, mark = null, { unit = '%', label, markLabel = '' } = {}) {
    const strings = getStrings();
    if (value == null || !Number.isFinite(value)) return strings.meterNotMeasured;
    const share = (/** @type {number} */ v) => `${Math.round(v * FULL_PERCENT)}${unit}`;
    let text = `${share(value)} ${label ?? strings.meterUsed}`.trim();
    if (mark != null && Number.isFinite(mark)) text += `; ${share(mark)} ${markLabel}`.trimEnd();
    return text;
}

/**
 * @typedef {object} Meter
 * @property {number | null} [value] the share, 0 up (1 is full; above 1 the bar is full and says so); null is not measured
 * @property {number | null} [mark] a tick at this share (a target, a limit, what is booked), 0 up; null is none
 * @property {'success' | 'neutral' | 'warning' | 'destructive' | null} [tone] the fill's colour (`success` good, `neutral` quiet); a tone on the tile around it does the same
 * @property {string} [label] what the share is, in the words a screen reader hears ("full"); `meterUsed` unless given
 * @property {string} [markLabel] what the mark is ("the target level")
 * @property {boolean} [loading] the track pulses at its height, with no fill and no mark
 */

/**
 * Write a `.kp-meter`'s share, mark, tone and ARIA in one call: `--kp-value`
 * and `--kp-mark`, `role="meter"` with `aria-valuenow` (0 to 100) and an
 * `aria-valuetext` that names the real share (meterText()). Above 1 the
 * fill is full and the meter carries `data-kp-over`; a mark above 1 sits at
 * the end with a ▸ and carries it too. The mark is a `.kp-meter__mark`
 * child, made the first time a meter has one.
 * @param {HTMLElement} el
 * @param {Meter} meter
 */
export function setMeter(el, { value = null, mark = null, tone = null, label, markLabel = '', loading = false }) {
    const parts = meterParts(loading ? null : value, loading ? null : mark);
    el.setAttribute('role', 'meter');
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', String(FULL_PERCENT));
    el.toggleAttribute('data-kp-loading', loading);
    if (loading) el.setAttribute('aria-busy', 'true');
    else el.removeAttribute('aria-busy');
    el.style.setProperty('--kp-value', parts.measured ? String(Math.max(0, /** @type {number} */ (value))) : '0');
    el.toggleAttribute('data-kp-over', parts.over);
    if (parts.now != null) el.setAttribute('aria-valuenow', String(parts.now));
    else el.removeAttribute('aria-valuenow');
    el.setAttribute('aria-valuetext', loading ? getStrings().meterMeasuring : meterText(value, mark, { label, markLabel }));
    if (tone) el.setAttribute('data-kp-tone', tone);
    else el.removeAttribute('data-kp-tone');
    let tick = /** @type {HTMLElement | null} */ (el.querySelector(':scope > .kp-meter__mark'));
    const marked = parts.mark != null;
    if (marked && !tick) {
        tick = el.ownerDocument.createElement('span');
        tick.className = 'kp-meter__mark';
        tick.setAttribute('aria-hidden', 'true');
        el.append(tick);
    }
    if (tick) tick.hidden = !marked;
    if (marked && tick) {
        el.style.setProperty('--kp-mark', String(Math.max(0, /** @type {number} */ (mark))));
        tick.toggleAttribute('data-kp-over', parts.markOver);
    } else el.style.removeProperty('--kp-mark');
}
