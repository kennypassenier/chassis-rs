// Calm tones: a day on which nothing was logged is quiet, not failed [kpadopt6; Life's trackers, the plant-care dashboard].
//
// The calendar (js/calendar.js), the heat grid (js/heat.js) and the uptime strip (js/uptime.js) tone their cells `ok`, `warn`
// and `bad`: a green, an amber and a red plate. That is right for a backup (a missed backup IS a fault) and wrong for a mood
// or movement tracker, where a day without an entry is simply empty. `data-kp-tones="calm"` on one of them swaps the
// vocabulary for three tones of its own, and the shared `future`, `before` and `loading`:
//
//   logged   something was logged: filled in the theme's accent (`data-kp-logged-fill="success"` for the success plate)
//   quiet    nothing was logged: lighter than `muted`, no border, no glyph, never a count, never the word "missed"
//   paused   a day inside a pause (`data-kp-paused-range="2026-10-03/2026-10-14"`): hatched like `before`
//
// A consumer that hands over `ok`, `warn`, `bad` or `none` by habit is mapped (`data-kp-calm-map="quiet"`, the default: ok to
// logged, the rest to quiet) and told once in the console, so a red cannot appear in a calm calendar by mistake;
// `data-kp-calm-map="none"` passes the tones through. A quiet cell still has an accessible name ("14/10/2026, nothing
// logged"; `data-kp-quiet-words="none"` leaves the words out) and keeps its visible text empty; the count of a day prints
// only on a logged day. The uptime strip follows the same attribute: `up` and `degraded` are logged, `down` is quiet and its
// word is "nothing logged". Nothing runs on import.

import { getStrings } from './strings.js';

/** The attribute that makes one of them calm. */
export const CALM_TONES_ATTRIBUTE = 'data-kp-tones';
/** The tones only a calm component draws, and the ones it shares. */
export const CALM_TONES = /** @type {const} */ (['logged', 'quiet', 'paused', 'future', 'before', 'loading']);

/** @typedef {'logged' | 'quiet' | 'paused' | 'future' | 'before' | 'loading'} CalmTone */

/** The tones a calm component has been warned about, so each is said once. */
const warned = new Set();

/**
 * Is this component calm?
 * @param {Element | null | undefined} el
 */
export const isCalmTones = (el) => el?.getAttribute(CALM_TONES_ATTRIBUTE) === 'calm';

/**
 * A tone in the calm vocabulary. Pure apart from the one console warning per foreign tone.
 * @param {string | undefined} tone what the page handed over
 * @param {Element | null} [el] the calm component (its `data-kp-calm-map` decides)
 * @returns {string} a calm tone, or the tone itself when the page switched the mapping off
 */
export function calmTone(tone, el = null) {
    const t = tone ?? 'quiet';
    if (/** @type {readonly string[]} */ (CALM_TONES).includes(t)) return t;
    if (el?.getAttribute('data-kp-calm-map') === 'none') return t;
    const mapped = t === 'ok' ? 'logged' : 'quiet';
    // `none` and `muted` are what a calendar says for a day nobody wrote about: quiet, and not worth a warning.
    if (t !== 'none' && t !== 'muted' && !warned.has(t)) {
        warned.add(t);
        console.warn(`[kp-calm] the tone "${t}" is not calm; it is drawn as "${mapped}". Use logged, quiet or paused.`);
    }
    return mapped;
}

/**
 * The words of a calm tone, for a screen reader and a tooltip: "logged", "nothing logged", "paused", never "missed".
 * @param {string} tone
 * @returns {string | null} null for a tone this vocabulary does not name
 */
export function calmWord(tone) {
    const s = getStrings();
    if (tone === 'logged') return s.calmLogged;
    if (tone === 'quiet') return s.calmQuiet;
    if (tone === 'paused') return s.calmPaused;
    return null;
}

/**
 * Whether `iso` (`YYYY-MM-DD`) lies in a pause given as `from/to` (both inclusive; `from/` has no end, `/to` no start).
 * @param {string | null | undefined} range
 * @param {string} iso
 */
export function inPausedRange(range, iso) {
    if (!range) return false;
    const [from = '', to = ''] = range.split('/');
    return (from === '' || iso >= from) && (to === '' || iso <= to);
}

/**
 * The legend of a calm component: logged, nothing logged, paused, in the words of the dictionary (`calmLegend…`). A heat grid draws
 * it by itself (js/heat.js) unless `data-kp-legend="hide"`.
 * @returns {{ tone: 'logged' | 'quiet' | 'paused', label: string }[]}
 */
export function calmLegendEntries() {
    const s = getStrings();
    return [
        { tone: 'logged', label: s.calmLegendLogged },
        { tone: 'quiet', label: s.calmLegendQuiet },
        { tone: 'paused', label: s.calmLegendPaused },
    ];
}
