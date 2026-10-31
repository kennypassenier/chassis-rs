// A button that shows the result for a moment [kpadopt5].
//
// While its work runs the button shows the theme's spinner; when the work is done it shows a short word ("Copied",
// "Sent", "Refused") for a moment and goes back to its own words. It never changes width: every face it can show
// (rest, busy, result, and the words it may say) shares one grid cell, so the widest sets the width and the row beside
// it does not re-flow under the pointer. It replaces chassis `busy()` / `flash()` / `pinWidth()` (chassis.js) and kyu's
// copy button.
//
//   <button class="kp-button" data-kp-flash-button data-kp-flash-words="Sent,Refused">Send test</button>
//   <button class="kp-button" data-kp-post="/api/clients/7/test" data-kp-flash-word="Sent">Send test</button>
//   runFlashButton(button, async () => { await save(); return 'Saved'; });
//
// Kenny, 2026-10-17 ("Kort woord op de button, zin eronder"): a refusal shows its short word on the button, in the
// button's own width, and the whole sentence (the reason and what to do now) stands in a line right under the button
// until the next press. `data-kp-refusal` chooses another place: `button` (the button grows to hold the sentence) or
// `toast`. The answer shape of a refusal is `{ error, remedy }`, the same as `chassis::Error`.
//
//   data-kp-busy-label       a word beside the spinner while busy (default none: the spinner alone, so nothing widens)
//   data-kp-flash-ms         how long a success stays (default 1500)
//   data-kp-flash-error-ms   how long a refusal's word stays (default 3000)
//   data-kp-flash-word       the success word (default the dictionary's "Done")
//   data-kp-flash-words      every word the button may say, comma separated, so the width holds them all
//   data-kp-width            `keep` (default: the button holds the width of its widest word) or `grow` (as wide as what it says now; set by hand it
//                            works at rest and busy too)
//   data-kp-refusal          `line` (default), `button` or `toast`
//   data-kp-flash-line       a selector for the element that holds the line (default: one made after the button)
//   data-kp-post, data-kp-method, data-kp-post-body, data-kp-reload (`none` default, `page`, `region` with
//                            `data-kp-reload-target`): the chassis pattern, POST then show the answer
//
// A second press while busy does nothing. The result is announced politely whatever its length. Nothing runs on import.

import { attachOne, controllerOf } from './controller.js';
import { FlashButton } from './flash/controller.js';
import { FLASH_BUTTON } from './flash/values.js';

export { FLASH_BUTTON, FLASH_EVENT, FLASH_RELOAD_EVENT, FLASH_MS, FLASH_ERROR_MS } from './flash/values.js';

/**
 * What the work may answer: nothing or a word for a success, or a refusal.
 * @typedef {string | void | { word?: string, line?: string } | { error: string, remedy?: string, word?: string }} FlashAnswer
 */

/**
 * @typedef {object} FlashOptions
 * @property {number} [flashMs]
 * @property {number} [errorMs]
 * @property {string} [busyLabel]
 * @property {'keep' | 'grow'} [width]
 * @property {'line' | 'button' | 'toast'} [refusal]
 */

/** @typedef {{ stack: HTMLElement, rest: HTMLElement, busy: HTMLElement, result: HTMLElement, status: HTMLElement, line: HTMLElement, ownLine: boolean, timer: number, running: boolean, off: () => void }} Wired */

/**
 * Run `work` behind a button: busy while it runs, then its result for a moment.
 *
 * @param {HTMLElement} button
 * @param {() => Promise<FlashAnswer> | FlashAnswer} work
 * @param {FlashOptions} [options]
 * @returns {Promise<{ ok: boolean, word: string, line: string } | null>} null when the press was ignored (already busy)
 */
export async function runFlashButton(button, work, options = {}) {
    // The button is given its faces on the first press, once.
    const flash = attachOne(button, FlashButton, options);
    return flash ? flash.run(work, options) : null;
}

/**
 * Wire every flash button under `root`.
 *
 * @param {ParentNode} [root]
 * @param {FlashOptions} [options]
 * @returns {() => void} detach
 */
export function attachFlashButtons(root = document, options = {}) {
    /** @type {FlashButton[]} */
    const made = [];
    // Below the root only; a button that has its faces already (a press ran before) is left alone.
    for (const found of root.querySelectorAll(FLASH_BUTTON)) {
        const button = /** @type {HTMLElement} */ (found);
        if (controllerOf(button, FlashButton)) continue;
        const flash = attachOne(button, FlashButton, options);
        if (!flash) continue;
        flash.listenPress();
        made.push(flash);
    }
    return () => {
        for (const flash of made) flash.destroy();
    };
}
