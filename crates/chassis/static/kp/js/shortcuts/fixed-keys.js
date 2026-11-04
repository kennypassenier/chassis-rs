// The two keys the palette and the shortcut sheet bind themselves [keys4-1104].
//
// The palette's key and the sheet's key are options like every other (`data-kp-hotkey` on the palette and on the sheet, or the `hotkey` /
// `sheetKey` options of attachPalettes; defaults PALETTE_KEY and SHEET_KEY in palette/constants.js). Whoever binds one announces the key it
// resolved here, and the sheet's first group lists exactly those keys, so a key that was changed or switched off is never documented wrongly.
// The engine also refuses a registration on them (`isReserved`). Before anything is announced the defaults stand.

import { keyCaps, parseKeySpec } from '../key-spec.js';
import { normal, parseShortcutKeys } from './keys.js';
import { PALETTE_KEY, SHEET_KEY } from '../palette/constants.js';

/** @typedef {'palette' | 'sheet'} FixedKey */
/** @typedef {import('../key-spec.js').KeySpec} KeySpec */

/** What each control announced; absent until it does. @type {Partial<Record<FixedKey, KeySpec>>} */
const announced = {};
/** The defaults that stand until a control announces. */
const DEFAULTS = { palette: PALETTE_KEY, sheet: SHEET_KEY };

/** @param {FixedKey} which @param {KeySpec} spec the key the control resolved; empty when it is off */
export function announceFixedKey(which, spec) {
    announced[which] = spec;
}

/** Forget what a control announced (it was removed), so the default stands again. @param {FixedKey} which */
export function forgetFixedKey(which) {
    delete announced[which];
}

/** The key as the sheet's key cap spells it (`Mod K`, `?`), or null when it is off. @param {FixedKey} which @returns {string | null} */
export function fixedKeyText(which) {
    const caps = keyCaps(announced[which] ?? parseKeySpec(DEFAULTS[which]));
    return caps === null ? null : [caps].flat().join(' ');
}

/** Whether a normalized key id (`mod+k`) is one of the two keys. @param {string} id */
export function isReserved(id) {
    return ['palette', 'sheet'].some((which) => {
        const text = fixedKeyText(/** @type {FixedKey} */ (which));
        return text !== null && normal(parseShortcutKeys(text)) === id;
    });
}
