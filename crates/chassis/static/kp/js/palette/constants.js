// The part names, the opener selector, the event names and the empty-state words of the palette.
import { getStrings } from '../strings.js';

export const PALETTE = '[data-kp-palette]';
export const SHEET = '[data-kp-shortcuts]';
export const INPUT = 'input[role="combobox"]';
export const LIST = '[role="listbox"]';
export const STATUS = '[role="status"]';
export const GROUP = '[data-kp-group]';
/** The attribute that opens a palette or a sheet on a press [gap-12]. */
export const OPENER = '[data-kp-palette-open]';

/** An empty `<kbd>` inside an opener that the module fills with the hotkey [scope-48]. */
export const KEYS_SLOT = '[data-kp-palette-keys]';

/** Fired on the palette when a command is chosen, cancelable. A contract value [TH26]: `{ value, option, href }`. */
export const RUN_EVENT = 'kp-palette-run';
/** Fired on the palette or the sheet when it opens or closes: `{ open }`. */
export const OPEN_EVENT = 'kp-palette-open';

/** @param {number} n */
export const RESULTS_TEXT = (n) => {
    const s = getStrings();
    return n === 0 ? s.noCommands : n === 1 ? s.oneCommand : s.manyCommands(n);
};
