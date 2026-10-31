// The shortcut engine: one list that both handles the keys and fills the help sheet [kpadopt5].
//
// Moved out of homelab's admin/web/js/shortcuts.js (the chords "g o", `CHORD_MS`, the sheet drawn from the same table),
// so the sheet cannot promise a key that does nothing. It extends the palette's sheet (`?`, js/palette.js) and the
// caps of js/keys.js; it does not replace either.
//
//   const stop = registerShortcuts('page', [
//       { keys: 'g s', what: 'Go to Stacks', group: 'Anywhere', run: () => go('/stacks') },
//       { keys: 'j', what: 'Next row', group: 'In the table', run: () => rows.next(), when: () => rows.count() > 0 },
//   ]);
//
//   <dialog class="kp-shortcuts" data-kp-shortcuts data-kp-shortcuts-live aria-labelledby="sheet-title">…</dialog>
//
// `keys` is a chord of steps separated by spaces ("g s"), each step the key alone ("j", "?", "ArrowDown") or modifiers
// then the key ("Mod K", "Shift L", "Space"); `Mod` is Ctrl or ⌘. A letter never fires while a person types in a field (`inFields: true` on
// a shortcut lets it: "Esc closes the change form" [wish-1120, homelab 122]); a step
// with `Mod` still does. The scope is a name (a page's keys) or an element (keys that only live while that element is on
// screen, such as a table's j/k/x). Kenny, 2026-10-17: a key that needs AltGr on his AZERTY keyboard (`[`, `]`, `{`, `@`)
// is warned about at registration, not refused (`layoutGuard`, default `warn`). A digit step ("Alt 1", "2") is matched by the
// key's place on the digit row (`event.code`) as well as by `event.key`, so it works on AZERTY, where that row types `&`, `é` …
// without Shift; Shift must still be as the step says [homelab 69]. Two registrations of one key in one
// scope are a fault: in development they throw and list both, elsewhere they log and the first one wins. Nothing runs on
// import; the key listener is added with the first registration and removed with the last.
//
// The small cap a chord shows while it waits ("g …") stands in the middle of the screen by default; `bottom-centre`
// puts it at the foot, as homelab had it (Kenny, 2026-10-18 18:42: "ik dacht dat die onderaan in het midden kwam, of
// misschien moet die centraal in het midden komen te staan?"). The option is `data-kp-shortcuts-hint="centre |
// bottom-centre"` on <html> or `configureShortcuts({ hintPlace })`, switched at runtime; never the top. A page that shows
// only part of itself (a frame taller than what is in view) sets `--kp-shortcuts-view-top` and `--kp-shortcuts-view-height`
// on the root, so the cap stands in what can be seen.
//
// A page embedded in another (a frame) can ask `shortcutClaims(event)` whether a key is the engine's before it hands the
// key up, and hears `kp-shortcut-pending` on the document while a chord waits, so the page around it can send the next
// key down (research/_review/review.js does both for the review dialog's lanes).

// The page's registry is one ShortcutBoard (js/shortcuts/board.js) made on import; the sheet, the chord's cap and the
// registration have their own parts, and each live sheet is a LiveSheet controller (js/controller.js). The parts are
// listed in js/README.md.

import { attachOne } from './controller.js';
import { ShortcutBoard } from './shortcuts/board.js';
import { SHORTCUTS_LIVE_SHEET } from './shortcuts/constants.js';
import { LiveSheet } from './shortcuts/live.js';
import { registerOn } from './shortcuts/register.js';
import { renderSheet } from './shortcuts/sheet.js';

export {
    CHORD_MS,
    UNKNOWN_MS,
    SHORTCUTS_LIVE_SHEET,
    SHORTCUT_EVENT,
    SHORTCUT_PENDING_EVENT,
    SHORTCUT_HINT_PLACES,
    ALTGR_KEYS,
} from './shortcuts/constants.js';
export { parseShortcutKeys, displayShortcutKeys } from './shortcuts/keys.js';

/**
 * One shortcut.
 * @typedef {object} Shortcut
 * @property {string} keys "g s", "Mod K", "?", "j"
 * @property {string} what the sheet's words for it
 * @property {string} [group] the sheet's heading for it (default "Shortcuts")
 * @property {(event: KeyboardEvent) => unknown} run called when the keys are pressed; returning `false` leaves the browser's own handling alone
 * @property {() => boolean} [when] false: the key does nothing now and the sheet shows it dimmed
 * @property {string} [reason] the sheet's sentence for why it is not available now
 * @property {boolean} [inFields] true: the keys also fire while the focus is in a field (an input, a textarea, a select), where a plain key
 *   is the typing's own and does nothing by default; for a key that means the same there ("Esc closes the change form") [wish-1120, homelab 122]
 */

/**
 * @typedef {object} EngineOptions
 * @property {number} [chordMs] the wait for a chord's next key (default 1500)
 * @property {'warn' | 'refuse' | 'off'} [layoutGuard] what to do with a key that needs AltGr on AZERTY (default `warn`)
 * @property {string} [typingSelector] where letters never fire (default the palette's)
 * @property {boolean} [unknownHint] show "No shortcut on g x" after a chord that does nothing (default false)
 * @property {boolean} [dev] throw on a conflict instead of logging it (default: on localhost)
 * @property {(message: string) => void} [onWarn] where warnings go (default the console)
 * @property {string[]} [groupOrder] the sheet's group order; others follow in registration order
 * @property {'centre' | 'bottom-centre'} [hintPlace] where the chord's cap stands (default: the root's
 *   `data-kp-shortcuts-hint`, else `centre`)
 */

/**
 * @typedef {object} Step
 * @property {string[]} mods sorted modifier names: `alt`, `mod`, `shift`
 * @property {string} key the key, as `KeyboardEvent.key` spells it
 */

/**
 * @typedef {object} Entry
 * @property {Shortcut} shortcut
 * @property {Step[]} steps
 * @property {string} normal
 * @property {string | Element} scope
 * @property {number} order
 */

/** The one board of this document. */
const board = new ShortcutBoard();

/**
 * Change the engine's defaults for the whole page.
 * @param {EngineOptions} next
 */
export function configureShortcuts(next) {
    board.configure(next);
}

/**
 * Whether the engine would take this key: a chord waits for its next key, or a registered shortcut that is on screen
 * starts with it (a letter not while a person types in a field). For a page embedded in another, which hands its
 * keys up to the page around it unless they are its own.
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
export function shortcutClaims(event) {
    return board.claims(event);
}

/**
 * Register a list of shortcuts under a scope.
 *
 * @param {string | Element} scope a name (the page's keys) or an element (keys that live while it is on screen)
 * @param {readonly Shortcut[]} list
 * @param {EngineOptions} [options] overrides the page's defaults for this list
 * @returns {() => void} unregister
 */
export function registerShortcuts(scope, list, options = {}) {
    return registerOn(board, scope, list, options);
}

/**
 * The registered shortcuts, for a consumer's own listing.
 * @returns {{ keys: string, what: string, group: string, scope: string, available: boolean }[]}
 */
export function listShortcuts() {
    return board.list();
}

/**
 * Write the sheet's body from the registry: groups of rows, the scope's own keys first, the palette's and the sheet's
 * keys in a fixed first group, a dimmed row for a key that is not available now, an empty plate when nothing is
 * registered.
 *
 * @param {HTMLElement} sheet
 */
export function renderShortcutSheet(sheet) {
    renderSheet(board, sheet);
}

/**
 * Keep every live sheet under `root` filled from the registry, and fresh each time it opens.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachShortcuts(root = document) {
    /** @type {LiveSheet[]} */
    const made = [];
    for (const found of root.querySelectorAll(SHORTCUTS_LIVE_SHEET)) {
        const sheet = /** @type {HTMLElement} */ (found);
        if (sheet.dataset.kpShortcutsLiveAttached !== undefined) continue;
        const live = attachOne(sheet, LiveSheet, { board });
        if (live) made.push(live);
    }
    return () => {
        for (const live of made) live.destroy();
    };
}
