// Command palette and shortcut sheet, framework-free [TH40, TH49].
//
// The palette is a <dialog>, which means the three hard parts are the
// browser's: focus is trapped, Escape closes, and focus returns to
// whatever was focused before. AR15's baseline is what makes that
// affordable, and a hand-written focus trap is how focus traps break.
//
// The commands are markup the consumer's server wrote, not a JavaScript
// array this module owns. That is the same choice the theme picker makes
// and for the same reason: kyu and almanac render HTML from a Rust binary
// and have no build step, so a palette that only exists after JavaScript
// runs would give them an empty box.
//
//   <dialog class="kp-palette" data-kp-palette id="commands" data-kp-hotkey="k">
//     <input class="kp-palette__input" type="text" role="combobox"
//            aria-expanded="true" aria-controls="commands-list" />
//     <ul class="kp-palette__list" id="commands-list" role="listbox">
//       <li role="presentation" class="kp-palette__group" data-kp-group>
//         <span class="kp-palette__group-label">Items</span>
//         <ul role="group" aria-label="Items">
//           <li class="kp-palette__option" role="option" data-kp-option
//               data-value="new" data-kp-keys="n">New item</li>
//         </ul>
//       </li>
//     </ul>
//     <p class="kp-palette__status" role="status" aria-live="polite"></p>
//   </dialog>
//
// Choosing one fires `kp-palette-run` on the dialog with the value in the
// detail. What that command DOES is the consumer's business — a palette
// that also owned the actions would have to know the application.
//
// The shortcut sheet (TH49) is the same dialog machinery with no input:
// `?` opens it, and it lists the keys. A palette without discoverability
// is a secret, which is why these two ship together rather than the sheet
// arriving later as a nicety.
//
// Since 3.0.0 [KT6]: the hotkey is an attribute and can be off; a
// palette opens from code, with a query pre-typed; which palette answers
// the key is the consumer's to nominate; the matcher is a choice; groups
// hide when every command in them is filtered out; `data-kp-keys` is
// finally rendered, three versions after it was documented; and the
// sheet dispatches events like everything else.
//
// Since gap-12: a button opens either one without a line of script —
// `<button data-kp-palette-open="commands">` — through the same open the
// hotkey uses, so the list is filtered and `kp-palette-open` fires. A
// page that opened the dialog with `data-kp-dialog` instead got a modal
// with a stale list and no event. An empty value means the palette that
// answers the key.
//
// Since scope-48: the palette navigates. A trigger in the bar's
// `.kp-nav__search` slot is such an opener, and the module gives it what a
// trigger owes its reader — `aria-haspopup="dialog"` and `aria-keyshortcuts`
// when the markup left them out, and the hotkey printed into an empty
// `<kbd data-kp-palette-keys>` in the platform's own spelling (⌘K, Ctrl K).
// And an option may be a link:
//
//   <li role="presentation">
//     <a class="kp-palette__option" role="option" data-kp-option
//        data-value="reports" href="/reports">Reports</a>
//   </li>
//
// Enter and a click both follow it, and `kp-palette-run` still fires first,
// cancelable: a consumer with a router calls preventDefault() and routes.
// Before the module attaches — or on a page with no JavaScript — it is a
// plain anchor, so the list the server wrote is a list of working links.
// The module takes the link out of the Tab order (`tabindex="-1"`, taken
// back on detach): the highlight is virtual focus, and a Tab that walked
// into the list would leave the input the combobox is built on.

import { createListbox, OPTION_SELECTOR, subsequence } from './listbox.js';
import { getStrings } from './strings.js';

const PALETTE = '[data-kp-palette]';
const SHEET = '[data-kp-shortcuts]';
const INPUT = 'input[role="combobox"]';
const LIST = '[role="listbox"]';
const STATUS = '[role="status"]';
const GROUP = '[data-kp-group]';
/** The attribute that opens a palette or a sheet on a press [gap-12]. */
export const OPENER = '[data-kp-palette-open]';

/**
 * Close a modal dialog on a press outside its box [scope-80].
 *
 * A modal `<dialog>` paints its backdrop as part of itself, so a press on
 * the dimmed page lands on the dialog element with coordinates outside its
 * border box. Both the press and the release have to fall outside: a drag
 * that selects the query and lets go past the box is not a click outside.
 * `dialog.close()` is what Escape does too, so focus goes back to the
 * opener the same way, and the `close` event runs every channel's own
 * bookkeeping. Returns the function that takes the listeners off.
 *
 * @param {HTMLDialogElement} dialog
 * @returns {() => void}
 */
export function closeOnOutsidePress(dialog) {
    /** @param {MouseEvent} event */
    const outside = (event) => {
        if (event.target !== dialog) return false;
        const box = dialog.getBoundingClientRect();
        return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    };
    let pressedOutside = false;
    /** @param {PointerEvent} event */
    const onDown = (event) => {
        pressedOutside = dialog.open && outside(event);
    };
    /** @param {MouseEvent} event */
    const onClick = (event) => {
        const both = pressedOutside && outside(event);
        pressedOutside = false;
        if (both && dialog.open) dialog.close();
    };
    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('click', onClick);
    return () => {
        dialog.removeEventListener('pointerdown', onDown);
        dialog.removeEventListener('click', onClick);
    };
}

/**
 * Whether a click landed on an opener meant for this dialog.
 *
 * @param {Event} event
 * @param {HTMLDialogElement} dialog
 * @param {boolean} answersKey  whether this dialog is the one an empty value means
 */
function openerFor(event, dialog, answersKey) {
    const opener = event.target instanceof Element ? event.target.closest(OPENER) : null;
    if (opener === null) return false;
    const name = opener.getAttribute('data-kp-palette-open') ?? '';
    return name === '' ? answersKey : name === dialog.id;
}

/** An empty `<kbd>` inside an opener that the module fills with the hotkey [scope-48]. */
export const KEYS_SLOT = '[data-kp-palette-keys]';

/** Whether this is a Mac, where the modifier is ⌘ rather than Ctrl. */
export function isMac() {
    if (typeof navigator === 'undefined') return false;
    const platform = /** @type {any} */ (navigator).userAgentData?.platform ?? navigator.platform ?? '';
    return /mac|iphone|ipad/i.test(platform);
}

/** Fired on the palette when a command is chosen, cancelable. A contract value [TH26]: `{ value, option, href }`. */
export const RUN_EVENT = 'kp-palette-run';
/** Fired on the palette or the sheet when it opens or closes: `{ open }`. */
export const OPEN_EVENT = 'kp-palette-open';

/** @param {number} n */
const RESULTS_TEXT = (n) => {
    const s = getStrings();
    return n === 0 ? s.noCommands : n === 1 ? s.oneCommand : s.manyCommands(n);
};

/** @typedef {(optionText: string, query: string) => boolean} Matcher */
/** @type {Record<string, Matcher>} */
export const MATCHERS = {
    // Literal by default [scope-56]: a subsequence let "read" find "Report
    // an incident", which reads as a wrong answer rather than a clever
    // one. `data-kp-match="subsequence"` keeps "thm" finding "Theme" for
    // a palette that wants it.
    subsequence: (text, query) => subsequence(text, query),
    substring: (text, query) => text.toLowerCase().includes(query.toLowerCase()),
    prefix: (text, query) => text.toLowerCase().startsWith(query.toLowerCase()),
};

/**
 * Is this keystroke the palette's? ⌘+key on a Mac, Ctrl+key everywhere
 * else. Checked rather than assumed: a page that binds Ctrl+K on a Mac
 * steals nothing, but a page that binds ⌘K on Windows binds nothing at
 * all.
 *
 * @param {KeyboardEvent} event
 * @param {string} key
 */
function isHotkey(event, key) {
    return event.key.toLowerCase() === key.toLowerCase() && (event.metaKey || event.ctrlKey);
}

/**
 * Is the event coming from somewhere that a bare `?` means a question
 * mark rather than a shortcut?
 *
 * @param {EventTarget | null} target
 * @param {string} typingSelector
 */
function isTyping(target, typingSelector) {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || target.matches(typingSelector);
}

/**
 * @typedef {object} PaletteHandle
 * @property {HTMLDialogElement} element
 * @property {(query?: string) => void} open
 * @property {() => void} close
 * @property {() => void} refresh re-filter after the consumer changed the commands
 */

/** @type {WeakMap<Element, PaletteHandle>} */
const handles = new WeakMap();
/** The handle for an attached palette or sheet. @param {Element} element */
export function palette(element) {
    return handles.get(element) ?? null;
}

/**
 * Attach every palette and shortcut sheet under `root`.
 *
 * @param {ParentNode} root
 * @param {{ hotkey?: string | null, sheetKey?: string | null, match?: keyof typeof MATCHERS | Matcher, clearOnClose?: boolean, closeOnRun?: boolean, typingSelector?: string }} [options]
 *   Defaults; per element: `data-kp-hotkey` (a letter, or "none"), `data-kp-primary` (this one answers the key when there are several), `data-kp-match` (`substring` by default, or `subsequence`, `prefix`), `data-kp-clear-on-close="false"`, `data-kp-close-on-run="false"`.
 * @returns {(() => void) & { handles: PaletteHandle[] }} detach
 */
export function attachPalettes(
    root = document,
    {
        hotkey = 'k',
        sheetKey = '?',
        match = 'substring',
        clearOnClose = true,
        closeOnRun = true,
        typingSelector = 'input, textarea, select, [role="textbox"]',
    } = {},
) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    /** @type {PaletteHandle[]} */
    const created = [];

    /** The one that answers the key: the nominated one, else the first in the document. @param {string} selector @param {Element} me */
    const answers = (selector, me) => {
        const nominated = document.querySelector(`${selector}[data-kp-primary]`);
        return (nominated ?? document.querySelector(selector)) === me;
    };

    for (const element of root.querySelectorAll(PALETTE)) {
        const dialog = element;
        if (!(dialog instanceof HTMLDialogElement) || dialog.dataset.kpPaletteAttached !== undefined) continue;
        const input = /** @type {HTMLInputElement | null} */ (dialog.querySelector(INPUT));
        const list = /** @type {HTMLElement | null} */ (dialog.querySelector(LIST));
        if (input === null || list === null) continue;
        dialog.dataset.kpPaletteAttached = '';

        const status = /** @type {HTMLElement | null} */ (dialog.querySelector(STATUS));
        const key = dialog.dataset.kpHotkey === 'none' ? null : (dialog.dataset.kpHotkey ?? hotkey);
        const clears = dialog.dataset.kpClearOnClose === undefined ? clearOnClose : dialog.dataset.kpClearOnClose !== 'false';
        const closes = dialog.dataset.kpCloseOnRun === undefined ? closeOnRun : dialog.dataset.kpCloseOnRun !== 'false';
        const matcher = typeof match === 'function' ? match : (MATCHERS[dialog.dataset.kpMatch ?? match] ?? MATCHERS.substring);

        // data-kp-keys, rendered: the documented attribute nothing read.
        for (const element of list.querySelectorAll(`${OPTION_SELECTOR}[data-kp-keys]`)) {
            const option = /** @type {HTMLElement} */ (element);
            if (option.querySelector('kbd') !== null) continue;
            const kbd = document.createElement('kbd');
            kbd.className = 'kp-palette__keys';
            kbd.textContent = option.dataset.kpKeys ?? '';
            kbd.dataset.kpGenerated = '';
            option.append(kbd);
        }

        const filter = () => {
            const query = input.value.trim();
            let visible = 0;
            for (const element of list.querySelectorAll(OPTION_SELECTOR)) {
                const option = /** @type {HTMLElement} */ (element);
                // Match on the label, not on the kbd hint.
                const text = [...option.childNodes]
                    .filter((n) => !(n instanceof HTMLElement && n.tagName === 'KBD'))
                    .map((n) => n.textContent ?? '')
                    .join('');
                const shown = matcher(text, query);
                option.hidden = !shown;
                if (shown) visible += 1;
            }
            // A group whose commands all vanished vanishes with them.
            for (const element of list.querySelectorAll(GROUP)) {
                const group = /** @type {HTMLElement} */ (element);
                group.hidden = group.querySelector(`${OPTION_SELECTOR}:not([hidden])`) === null;
            }
            listbox.refresh();
            if (visible > 0) listbox.highlight(0);
            if (status !== null) status.textContent = RESULTS_TEXT(visible);
        };

        // The click a choice rides on, while it is being dispatched: a link
        // chosen by a click is followed by the browser, one chosen by Enter
        // is clicked here so the browser follows it the same way — target,
        // rel and a router's own click handler included.
        /** @type {MouseEvent | null} */
        let clicking = null;
        /** @param {MouseEvent} event */
        const onClickStart = (event) => {
            clicking = event;
        };
        const onClickEnd = () => {
            clicking = null;
        };
        list.addEventListener('click', onClickStart, true);

        const listbox = createListbox({
            input,
            list,
            onChoose: (_, option) => {
                const link = option instanceof HTMLAnchorElement && option.hasAttribute('href') ? option : null;
                if (link !== null && clicking === null) {
                    // Comes straight back through the listbox as a click.
                    link.click();
                    return;
                }
                const value = option.dataset.value ?? (option.textContent ?? '').trim();
                const run = new CustomEvent(RUN_EVENT, { bubbles: true, cancelable: true, detail: { value, option, href: link?.href ?? null } });
                dialog.dispatchEvent(run);
                if (run.defaultPrevented && link !== null) clicking?.preventDefault();
                if (closes) dialog.close();
            },
            onDismiss: () => dialog.close(),
        });
        list.addEventListener('click', onClickEnd);

        // A link option is pointed at, never tabbed to [scope-48].
        /** @type {HTMLElement[]} */
        const untabbed = [];
        for (const element of list.querySelectorAll(`a${OPTION_SELECTOR}[href]:not([tabindex])`)) {
            element.setAttribute('tabindex', '-1');
            untabbed.push(/** @type {HTMLElement} */ (element));
        }

        /** @param {string} [query] */
        const openWith = (query) => {
            if (dialog.open) return;
            if (query !== undefined) input.value = query;
            dialog.showModal();
            filter();
            input.focus();
            dialog.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: true } }));
        };

        const onInput = () => filter();
        input.addEventListener('input', onInput);

        // Reopening with the last query still in the box is a small trap:
        // the list looks filtered for no visible reason.
        const onClose = () => {
            if (clears) {
                input.value = '';
                filter();
            }
            dialog.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: false } }));
        };
        dialog.addEventListener('close', onClose);
        const releaseOutside = closeOnOutsidePress(dialog);

        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            if (key === null || !isHotkey(event, key)) return;
            // Only ONE palette answers the key: the nominated one, else
            // the first in the document. Found by the contract suite: with
            // a palette from each channel on one page, both handlers fired
            // and the second showModal() landed on top of the first.
            if (!answers(PALETTE, dialog)) return;
            event.preventDefault();
            if (dialog.open) dialog.close();
            else openWith();
        };
        if (key !== null) document.addEventListener('keydown', onKey);

        /** @param {Event} event */
        const onOpener = (event) => {
            if (!openerFor(event, dialog, answers(PALETTE, dialog))) return;
            openWith();
        };
        document.addEventListener('click', onOpener);

        // The triggers that open this palette say so, and print its key
        // [scope-48]. Only what the markup left out is written, and only
        // that is taken back.
        /** @type {(() => void)[]} */
        const unstamp = [];
        const mac = isMac();
        for (const opener of document.querySelectorAll(OPENER)) {
            const name = opener.getAttribute('data-kp-palette-open') ?? '';
            if (name === '' ? !answers(PALETTE, dialog) : name !== dialog.id) continue;
            /** @param {string} attribute @param {string} value */
            const stamp = (attribute, value) => {
                if (opener.hasAttribute(attribute)) return;
                opener.setAttribute(attribute, value);
                unstamp.push(() => opener.removeAttribute(attribute));
            };
            stamp('aria-haspopup', 'dialog');
            if (key === null) continue;
            stamp('aria-keyshortcuts', `${mac ? 'Meta' : 'Control'}+${key.toUpperCase()}`);
            for (const slot of opener.querySelectorAll(KEYS_SLOT)) {
                if ((slot.textContent ?? '').trim() !== '') continue;
                slot.textContent = getStrings().paletteHotkey(key, mac);
                unstamp.push(() => (slot.textContent = ''));
            }
        }

        filter();
        /** @type {PaletteHandle} */
        const handle = { element: dialog, open: openWith, close: () => dialog.close(), refresh: filter };
        handles.set(dialog, handle);
        created.push(handle);
        cleanups.push(() => {
            listbox.destroy();
            list.removeEventListener('click', onClickStart, true);
            list.removeEventListener('click', onClickEnd);
            for (const el of untabbed) el.removeAttribute('tabindex');
            for (const undo of unstamp) undo();
            input.removeEventListener('input', onInput);
            dialog.removeEventListener('close', onClose);
            releaseOutside();
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('click', onOpener);
            for (const el of list.querySelectorAll(OPTION_SELECTOR)) /** @type {HTMLElement} */ (el).hidden = false;
            for (const el of list.querySelectorAll(GROUP)) /** @type {HTMLElement} */ (el).hidden = false;
            for (const el of list.querySelectorAll('kbd[data-kp-generated]')) el.remove();
            if (dialog.open) dialog.close();
            handles.delete(dialog);
            delete dialog.dataset.kpPaletteAttached;
        });
    }

    for (const element of root.querySelectorAll(SHEET)) {
        const sheet = element;
        if (!(sheet instanceof HTMLDialogElement) || sheet.dataset.kpShortcutsAttached !== undefined) continue;
        sheet.dataset.kpShortcutsAttached = '';
        const key = sheet.dataset.kpHotkey === 'none' ? null : (sheet.dataset.kpHotkey ?? sheetKey);

        const openSheet = () => {
            if (sheet.open) return;
            sheet.showModal();
            sheet.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: true } }));
        };
        const onClose = () => sheet.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: false } }));
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            // `?` only when nobody is typing one into a field, and never
            // with a modifier — Ctrl+? belongs to the browser.
            if (key === null || event.key !== key || event.ctrlKey || event.metaKey || event.altKey) return;
            if (isTyping(event.target, typingSelector)) return;
            if (!answers(SHEET, sheet)) return;
            event.preventDefault();
            if (sheet.open) sheet.close();
            else openSheet();
        };
        if (key !== null) document.addEventListener('keydown', onKey);
        /** @param {Event} event */
        const onOpener = (event) => {
            if (openerFor(event, sheet, false)) openSheet();
        };
        document.addEventListener('click', onOpener);
        sheet.addEventListener('close', onClose);
        // A press outside the sheet closes it, as it does the palette [scope-80].
        const releaseOutside = closeOnOutsidePress(sheet);
        /** @type {PaletteHandle} */
        const handle = { element: sheet, open: openSheet, close: () => sheet.close(), refresh: () => {} };
        handles.set(sheet, handle);
        created.push(handle);
        cleanups.push(() => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('click', onOpener);
            sheet.removeEventListener('close', onClose);
            releaseOutside();
            if (sheet.open) sheet.close();
            handles.delete(sheet);
            delete sheet.dataset.kpShortcutsAttached;
        });
    }

    const detach = () => {
        for (const c of cleanups) c();
    };
    return Object.assign(detach, { handles: created });
}
