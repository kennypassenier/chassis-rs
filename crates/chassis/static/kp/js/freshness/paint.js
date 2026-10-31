// Writing one freshness line as it stands: its words, its reserved width, its moment, its stale state and what it announces.

import { resolveStrings } from '../strings.js';
import { MS_PER_SECOND, SECONDS, WIDEST_DAYS, WIDEST_HOURS } from './values.js';
import { states, widths } from './state.js';
import { agoMoment, agoText, humanDuration, momentOf, unitsOf } from './text.js';

/** @typedef {import('../freshness.js').AgoContext} AgoContext */
/** @typedef {import('../freshness.js').AgoState} AgoState */
/** @typedef {import('../freshness.js').Strings} Strings */

/**
 * The widest text the line's current unit can reach: under an hour
 * "59 min 59 s", under a day "23 h 59 min", beyond that "99 days 23 h".
 * @param {string} verb @param {number | null} at @param {number} now @param {Strings} strings @param {'days' | undefined} units
 */
function widest(verb, at, now, strings, units) {
    if (at == null) return strings.agoNever(verb || strings.agoVerb);
    const age = Math.max(0, (now - at) / MS_PER_SECOND);
    const top = age < SECONDS.hour ? SECONDS.hour - 1 : age < SECONDS.day ? SECONDS.day - 1 : WIDEST_DAYS * SECONDS.day + WIDEST_HOURS * SECONDS.hour;
    return strings.agoText(verb, humanDuration(top, strings, units)).trim();
}

/**
 * Reserve the line's width for the widest text of its unit: measured once
 * per unit (the only layout read), by writing that text into the line for
 * the length of one synchronous step.
 * @param {HTMLElement} el @param {string} sample
 */
function reserve(el, sample) {
    const own = el.getAttribute('data-kp-ago-width');
    if (own) {
        el.style.setProperty('min-inline-size', own);
        return;
    }
    const style = getComputedStyle(el);
    const key = [
        sample,
        style.fontFamily,
        style.fontSize,
        style.fontWeight,
        style.fontStyle,
        style.fontStretch,
        style.fontVariantNumeric,
        style.letterSpacing,
        style.textTransform,
    ].join('|');
    let width = widths.get(key);
    if (width === undefined) {
        const kept = [...el.childNodes];
        const probe = el.ownerDocument.createElement('span');
        probe.textContent = sample;
        el.replaceChildren(probe);
        width = probe.getBoundingClientRect().width;
        el.replaceChildren(...kept);
        if (width > 0) widths.set(key, width);
    }
    if (width > 0) el.style.setProperty('min-inline-size', `${Math.ceil(width)}px`);
}

/**
 * The absolute moment, rewritten only when the moment changes.
 * @param {HTMLElement} el @param {AgoState} state @param {number | null} at @param {string} timeZone
 */
function writeMoment(el, state, at, timeZone) {
    if (at === state.at) return;
    state.at = at;
    if (at == null) {
        el.removeAttribute('title');
        el.removeAttribute('aria-description');
    } else {
        const moment = agoMoment(at, timeZone);
        el.setAttribute('title', moment);
        el.setAttribute('aria-description', moment);
    }
}

/**
 * The stale state: older than `data-kp-stale-after` seconds the line is marked, and a line that asks says so when it turns.
 * @param {HTMLElement} el @param {AgoState} state @param {number | null} at @param {number} now @param {string} text @param {Strings} strings
 */
function writeStale(el, state, at, now, text, strings) {
    const after = Number(el.getAttribute('data-kp-stale-after') ?? NaN);
    const stale = at != null && Number.isFinite(after) && (now - at) / MS_PER_SECOND > after;
    if (stale) {
        if (!el.hasAttribute('data-kp-stale')) el.setAttribute('data-kp-stale', '');
    } else el.removeAttribute('data-kp-stale');
    if (state.stale !== null && state.stale !== stale && el.getAttribute('data-kp-ago-announce') === 'state')
        announce(el, stale ? strings.agoStale(text) : strings.agoFresh(text));
    state.stale = stale;
}

/**
 * Write one line as it stands at `now`.
 * @param {HTMLElement} el @param {AgoContext} ctx
 */
export function paint(el, ctx) {
    const strings = resolveStrings(ctx.overrides);
    const now = ctx.now();
    const at = momentOf(el);
    // A bare line has no verb ("12 s ago"); with no moment yet it falls back to the dictionary's, so "not updated yet" stays a sentence.
    const verb = el.hasAttribute('data-kp-ago-bare') ? '' : el.getAttribute('data-kp-ago-verb') || strings.agoVerb;
    const units = unitsOf(el);
    const text = agoText(verb || (at == null ? strings.agoVerb : ''), at, now, strings, units).trim();
    let state = states.get(el);
    if (!state) {
        state = { at: undefined, sample: '', stale: null };
        states.set(el, state);
    }
    // Width first, while the old text is still there: only when the unit changed.
    const sample = widest(verb, at, now, strings, units);
    if (sample !== state.sample) {
        state.sample = sample;
        reserve(el, sample);
    }
    if (el.textContent !== text) el.textContent = text;
    writeMoment(el, state, at, ctx.timeZone);
    writeStale(el, state, at, now, text, strings);
}

/**
 * Speak a change of state through a hidden status beside the line.
 * @param {HTMLElement} el @param {string} words
 */
function announce(el, words) {
    let voice = el.nextElementSibling;
    if (!(voice instanceof HTMLElement) || !voice.hasAttribute('data-kp-ago-voice')) {
        voice = el.ownerDocument.createElement('span');
        voice.className = 'kp-sr-only';
        voice.setAttribute('role', 'status');
        voice.setAttribute('data-kp-ago-voice', '');
        el.after(voice);
    }
    voice.textContent = words;
}
