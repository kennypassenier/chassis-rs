// Listening for theme changes, whoever made them: this tab's pickers or, unless declined, another tab [AR5, AR25].

import { THEME_EVENT, asTheme, config, isDropped, rootOf } from './values.js';
import { applyTheme } from './apply.js';
import { currentTheme } from './read.js';
import { reportUnknown } from './report.js';

/** @typedef {import('./values.js').ThemeName} ThemeName */

/**
 * Listen for theme changes, whoever made them: this tab's React picker,
 * this tab's framework-free picker, or — unless declined — another tab.
 *
 * @param {(theme: ThemeName, detail: { previous: ThemeName | null, root: Element }) => void} listener
 * @param {{ crossTab?: boolean, root?: Element, key?: string }} [options]
 * @returns {() => void} unsubscribe
 */
export function onThemeChange(listener, { crossTab = true, root, key } = {}) {
    if (typeof document === 'undefined') return () => {};
    const target = root ?? document;
    /** @param {Event} e */
    const onEvent = (e) => {
        const detail = /** @type {CustomEvent} */ (e).detail;
        listener(detail.theme, { previous: detail.previous, root: detail.root });
    };
    /** @param {StorageEvent} e */
    const onStorage = (e) => {
        // Another tab changed the choice. Translate it into the same
        // announcement rather than a second mechanism, so a subscriber
        // never has to know which tab a change came from.
        if (e.key !== (key ?? config.storageKey)) return;
        // Site 4 of 4 [AR25]. The other tab may be a newer deployment of
        // the same app, which is how this one gets a name it does not
        // have. Nothing is applied and nothing is stored; this tab keeps
        // what it is wearing and says so.
        if (isDropped(e.newValue)) {
            reportUnknown(e.newValue, currentTheme({ root }), 'cross-tab', rootOf(root));
            return;
        }
        const next = asTheme(e.newValue);
        if (next && next !== currentTheme({ root })) applyTheme(next, { root });
    };
    target.addEventListener(THEME_EVENT, onEvent);
    if (crossTab) window.addEventListener('storage', onStorage);
    return () => {
        target.removeEventListener(THEME_EVENT, onEvent);
        if (crossTab) window.removeEventListener('storage', onStorage);
    };
}
