// What a press does on a card: say something politely, hide it with an Undo window, copy its words.

import { undoToast } from '../undo-toast.js';
import { getStrings } from '../strings.js';
import { ANNOUNCE_DELAY_MS, COPY_RESET_MS, DEFAULT_UNDO_MS, QUOTE_HIDE_EVENT } from './constants.js';
import { attr } from './dom.js';
import { measureFold } from './render.js';

/** Say something on the card's live line, unless announcing is off. @param {import('./controller.js').QuoteController} c @param {string} text */
export function say(c, text) {
    if ((c.el.getAttribute('data-kp-announce') ?? 'state') === 'off') return;
    c.live.textContent = '';
    window.setTimeout(() => {
        c.live.textContent = text;
    }, ANNOUNCE_DELAY_MS);
}

/** Hide the card at once, with an Undo; the page hears about it when the window closes. @param {import('./controller.js').QuoteController} c */
export function hide(c) {
    if (c.hiding || attr(c.el, 'hide') === 'off') return;
    const s = getStrings();
    const el = c.el;
    c.hiding = true;
    const ms = el.hasAttribute('data-kp-undo-ms') ? Number(el.getAttribute('data-kp-undo-ms')) : DEFAULT_UNDO_MS;
    // The card goes at once and comes back on Undo; the page hears about it when the window closes. The focus moves on
    // to the next card's first control (or the one before it), so the keyboard keeps its place.
    const hadFocus = el.contains(el.ownerDocument.activeElement);
    const next = [el.nextElementSibling, el.previousElementSibling].find((node) => node instanceof HTMLElement && !node.hidden);
    el.hidden = true;
    if (hadFocus) /** @type {HTMLElement | null} */ (next?.querySelector('button, a') ?? null)?.focus();
    const toast = undoToast(s.quoteHideDone, {
        ms,
        commit: () => {
            /** @type {Promise<unknown>[]} */
            const waits = [];
            const wait = (/** @type {Promise<unknown>} */ promise) => void waits.push(promise);
            el.dispatchEvent(new CustomEvent(QUOTE_HIDE_EVENT, { bubbles: true, detail: { text: c.text, wait } }));
            return Promise.all(waits);
        },
        undo: () => {
            el.hidden = false;
            c.hiding = false;
            measureFold(c);
            if (hadFocus) /** @type {HTMLElement | null} */ (el.querySelector('.kp-quote__hide'))?.focus();
        },
    });
    void toast.done.then((outcome) => {
        if (outcome === 'failed') {
            el.hidden = false;
            c.hiding = false;
        }
        if (outcome === 'committed' || outcome === 'left') c.hiding = false;
    });
    say(c, s.quoteAnnounceHidden);
}

/** Show a word on the Copy button for a moment, then its own words again. @param {import('./controller.js').QuoteController} c @param {HTMLButtonElement | null} button @param {string} word */
function flashCopy(c, button, word) {
    if (!button) return;
    button.textContent = word;
    window.clearTimeout(c.copyTimer);
    c.copyTimer = window.setTimeout(() => {
        button.textContent = getStrings().quoteCopy;
    }, COPY_RESET_MS);
}

/** Copy the words to the clipboard and say how it went. @param {import('./controller.js').QuoteController} c */
export async function copy(c) {
    const s = getStrings();
    const button = /** @type {HTMLButtonElement | null} */ (c.el.querySelector('.kp-quote__copy'));
    try {
        await navigator.clipboard.writeText(c.text);
        flashCopy(c, button, s.quoteCopied);
        say(c, s.quoteCopied);
    } catch {
        say(c, s.quoteCopyFailed);
        flashCopy(c, button, s.quoteCopyFailed);
    }
}
