// Remembering the choice and reading it back: storeTheme() and storedTheme() [AR6, AR25, S29].

import { DEFAULT_THEME } from '../theme-registry.js';
import { asTheme, config, isDropped } from './values.js';
import { reportUnknown } from './report.js';

/** @typedef {import('./values.js').ThemeName} ThemeName */

/**
 * Remember the choice. Returns false when storage refused — private mode,
 * blocked storage, a full quota. The caller shows that; it is not swallowed
 * [AR6], because in a server-rendered dashboard a preference that silently
 * fails to save is indistinguishable from a broken picker.
 *
 * @param {string} theme
 * @param {{ key?: string, storage?: Storage }} [options]
 * @returns {boolean} whether the choice will survive a reload
 */
export function storeTheme(theme, { key, storage } = {}) {
    try {
        (storage ?? localStorage).setItem(key ?? config.storageKey, theme);
        return true;
    } catch {
        return false;
    }
}

/**
 * @param {{ key?: string, storage?: Storage }} [options]
 * @returns {ThemeName | null} the stored choice, or null if there is none or storage is unreadable
 */
export function storedTheme({ key, storage } = {}) {
    /** @type {string | null} */
    let raw = null;
    try {
        raw = (storage ?? localStorage).getItem(key ?? config.storageKey);
    } catch {
        // Unreadable storage is not an unknown name; it is no name.
        return null;
    }
    // Site 1 of 4, and the one almanac actually hit [AR25, S29]: a
    // preference stored while the page knew twenty-four themes, read back
    // by a build that knows eleven. The stored value stays exactly as it
    // is — it will be right again the day that page gets a newer js/.
    if (isDropped(raw)) reportUnknown(raw, DEFAULT_THEME, 'stored');
    return asTheme(raw);
}
