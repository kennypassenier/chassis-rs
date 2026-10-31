// Attaches the comboboxes of a page.
import { attachOne, controllerOf } from '../controller.js';
import { COMBOBOX, INPUT, LIST } from './constants.js';
import { ComboboxControl } from './controller.js';
import { MATCHERS } from './matchers.js';
/** @typedef {import('./types.js').ComboboxHandle} ComboboxHandle */
/** @typedef {import('./types.js').Matcher} Matcher */

/**
 * Whether a box is to be wired by this call: not wired yet, not a usual picker still waiting for js/usual-picker.js
 * [kpadopt6], and with its input and its list.
 * @param {HTMLElement} box
 */
function wantsWiring(box) {
    if (box.dataset.kpComboboxAttached !== undefined || controllerOf(box, ComboboxControl)) return false;
    // A picker with the usual on top is made ready by js/usual-picker.js, which attaches it itself [kpadopt6].
    if (box.hasAttribute('data-kp-usual') && box.dataset.kpUsualReady === undefined) return false;
    return box.querySelector(INPUT) !== null && box.querySelector(LIST) !== null;
}

/**
 * Attach every combobox and tag input under `root`.
 *
 * @param {ParentNode} root
 * @param {{ match?: keyof typeof MATCHERS | Matcher, loop?: boolean, openOnFocus?: boolean, closeOnBlur?: boolean, backspaceRemoves?: boolean, stayOpen?: boolean, maxTags?: number, allowDuplicates?: boolean, debounceMs?: number, emptyRow?: boolean, creatable?: boolean, renderTag?: (value: string, label: string) => HTMLElement, removeGlyph?: string }} [options]
 *   Defaults; per box as data-attributes: `data-kp-match`, `data-kp-loop`, `data-kp-open-on-focus`, `data-kp-close-on-blur`, `data-kp-backspace-removes`, `data-kp-stay-open`, `data-kp-max-tags`, `data-kp-duplicates`, `data-kp-debounce`, `data-kp-empty-row`, `data-kp-creatable`.
 *   A tag input adds from typed text with Enter or a comma [scope-60]: text that names an option (its label, any case) takes that option; other text becomes a tag of its own only with `creatable` (default false, as the React channel's prop).
 *   `backspaceRemoves` (default false since Kenny's second nostromo pass, 2026-09-13): Backspace in an empty field removes the last tag; `data-kp-backspace-removes` opts one box in.
 *   `emptyRow` (default true): a query that matches nothing keeps the list open with a "no results" row — the server's own `[data-kp-combobox-empty]` element inside the list if it wrote one, else one built from the dictionary; `false` closes the list instead, as before 6.1 [gap-11].
 * @returns {(() => void) & { handles: ComboboxHandle[] }} detach
 */
export function attachComboboxes(
    root = document,
    {
        match = 'substring',
        loop = false,
        openOnFocus = true,
        closeOnBlur = true,
        backspaceRemoves = false,
        stayOpen = true,
        maxTags = Infinity,
        allowDuplicates = false,
        debounceMs = 0,
        emptyRow = true,
        creatable = false,
        renderTag,
        removeGlyph = '×',
    } = {},
) {
    const settings = { match, loop, openOnFocus, closeOnBlur, backspaceRemoves, stayOpen, maxTags, allowDuplicates, debounceMs, emptyRow, creatable, renderTag, removeGlyph };
    const made = [...root.querySelectorAll(COMBOBOX)]
        .filter((box) => wantsWiring(/** @type {HTMLElement} */ (box)))
        .map((box) => attachOne(/** @type {HTMLElement} */ (box), ComboboxControl, settings))
        .filter((control) => control !== undefined);
    const detach = () => {
        for (const control of made) control.destroy();
    };
    return Object.assign(detach, { handles: made.map((control) => control.handle) });
}
