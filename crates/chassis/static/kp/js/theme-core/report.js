// Saying once, out loud, that a theme name was dropped: the once-per-session memory, the console warning and the event [TH97, AR25].

import { getStrings } from '../strings.js';
import { UNKNOWN_THEME_EVENT, rootOf } from './values.js';

/** @typedef {import('./values.js').ThemeName} ThemeName */

/**
 * Where "already said this" is remembered [AR25].
 *
 * **sessionStorage, not a module-level flag, and that is the decision.**
 * In a server-rendered dashboard — almanac, kyu, kp-soft — every click is
 * a page load, so the module is evaluated again and a module-level flag
 * is a fresh flag. The warning would then fire on every click, and the
 * event with it, which is precisely what AR25 forbids: a consumer
 * listening to `kp-theme-unknown` would get one per navigation and have
 * to build its own throttle. sessionStorage survives a navigation inside
 * the tab and dies with the tab, which is what "a session" means here.
 *
 * The module-level Set in front of it is a cache, not the mechanism, and
 * it is also the fallback where sessionStorage throws — private mode, a
 * blocked cookie policy, a sandboxed iframe. There the warning lasts as
 * long as the document, which is the best a page with no storage can do,
 * and it is still better than silence.
 *
 * Kept per NAME rather than as one boolean: a page whose stored choice
 * and whose markup name two different unknown themes has two faults, and
 * hearing about one of them is how the second one stays hidden. No name
 * is ever reported twice, which is the property AR25 is about.
 *
 * Its own key. `STORAGE_KEY` is never written here: persisting the
 * fallback would destroy a preference that starts working again the day
 * the consumer copies a newer stylesheet.
 */
const REPORT_KEY = 'kp-themes-unknown-reported';

/** @type {Set<string>} */
const reported = new Set();

/** @param {string} name @returns {boolean} */
function alreadyReported(name) {
    if (reported.has(name)) return true;
    try {
        const raw = sessionStorage.getItem(REPORT_KEY);
        if (raw !== null && raw.split(' ').includes(name)) {
            reported.add(name);
            return true;
        }
    } catch {
        // No session storage: the Set above is all there is.
    }
    return false;
}

/** @param {string} name */
function remember(name) {
    reported.add(name);
    try {
        const raw = sessionStorage.getItem(REPORT_KEY);
        const names = raw === null || raw === '' ? [] : raw.split(' ');
        if (!names.includes(name)) sessionStorage.setItem(REPORT_KEY, [...names, name].join(' '));
    } catch {
        // See above.
    }
}

/**
 * Say once, out loud, that a name was dropped [TH97, AR25].
 *
 * The console for a developer reading the page, the event for code that
 * wants to do something about it — a health banner, a log line, a fetch
 * to the server that served the wrong name. Both are behind the same
 * once-per-session gate: an event nobody can afford to listen to is not
 * an improvement on silence.
 *
 * @param {unknown} requested the name that was asked for
 * @param {ThemeName} applied the name that was used instead
 * @param {'stored' | 'current' | 'apply' | 'cross-tab'} source which of the four places dropped it
 * @param {Element} [root] where the event is dispatched from
 * @returns {boolean} whether this call was the one that reported it
 */
export function reportUnknown(requested, applied, source, root) {
    const name = String(requested);
    if (alreadyReported(name)) return false;
    remember(name);
    console.warn(getStrings().themeUnknown(name, applied));
    if (typeof document === 'undefined') return true;
    const element = root ?? rootOf(undefined);
    element.dispatchEvent(new CustomEvent(UNKNOWN_THEME_EVENT, { bubbles: true, detail: { requested: name, applied, source } }));
    return true;
}
