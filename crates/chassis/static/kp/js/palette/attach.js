// Attaches the command palettes and shortcut sheets of a page: one PaletteControl or SheetControl per dialog.
import { attachOne } from '../controller.js';
import { INPUT, LIST, PALETTE, SHEET } from './constants.js';
import { MATCHERS } from './keys.js';
import { PaletteControl } from './palette-control.js';
import { SheetControl } from './sheet.js';
/** @typedef {import('./types.js').Matcher} Matcher */
/** @typedef {import('./types.js').PaletteHandle} PaletteHandle */

/**
 * Attach every palette and shortcut sheet under `root`.
 *
 * @param {ParentNode} root
 * @param {{ hotkey?: string | null, sheetKey?: string | null, match?: keyof typeof MATCHERS | Matcher, clearOnClose?: boolean, closeOnRun?: boolean, typingSelector?: string }} [options]
 *   Defaults; per element: `data-kp-hotkey` (a letter, or "none"), `data-kp-primary` (this one answers the key when there are several), `data-kp-match` (`intent` by default: words in any order, js/intent.js; or `substring`, `subsequence`, `prefix`), `data-kp-clear-on-close="false"`, `data-kp-close-on-run="false"`.
 * @returns {(() => void) & { handles: PaletteHandle[] }} detach
 */
export function attachPalettes(
    root = document,
    {
        hotkey = 'k',
        sheetKey = '?',
        match = 'intent',
        clearOnClose = true,
        closeOnRun = true,
        typingSelector = 'input, textarea, select, [role="textbox"]',
    } = {},
) {
    // A palette needs its field and its list; a dialog marked attached is wired already.
    const palettes = [...root.querySelectorAll(PALETTE)]
        .filter((dialog) => dialog instanceof HTMLDialogElement && !('kpPaletteAttached' in dialog.dataset))
        .filter((dialog) => dialog.querySelector(INPUT) !== null && dialog.querySelector(LIST) !== null)
        .map((dialog) => attachOne(/** @type {HTMLDialogElement} */ (dialog), PaletteControl, { hotkey, match, clearOnClose, closeOnRun }));
    const sheets = [...root.querySelectorAll(SHEET)]
        .filter((sheet) => sheet instanceof HTMLDialogElement && !('kpShortcutsAttached' in sheet.dataset))
        .map((sheet) => attachOne(/** @type {HTMLDialogElement} */ (sheet), SheetControl, { sheetKey, typingSelector }));
    const made = [...palettes, ...sheets].filter((control) => control !== undefined);
    const detach = () => {
        for (const control of made) control.destroy();
    };
    return Object.assign(detach, { handles: made.map((control) => control.handle) });
}
