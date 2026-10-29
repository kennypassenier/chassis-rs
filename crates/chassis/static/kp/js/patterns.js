// The small patterns, framework-free [TH50, TH51, TH53].
//
// None of these is a component in the usual sense. They are the things
// every application rewrites badly, and they are here for the same reason
// the data-showing classes are: the fifth reimplementation of "copy this
// value" is not better than the first, it is just differently wrong.
//
//   TH53  a value with a copy button that confirms
//   TH51  a row action that happens optimistically, with an undo
//   TH50  an empty state that knows the difference between "nothing yet"
//         and "nothing matched your filter"
//   kpadopt4  a secret field: a masked value shown on request for a few
//         seconds, then hidden again, and copied without being shown
//
// TH52 (status parts) and TH54 (diff) are markup and CSS only — there is
// no behaviour to attach, so they live in the stylesheet and in the React
// components, and nothing here needs to know about them.
//
// Since 3.0.0 [KT6]: the commit and undo events carry a detail — which
// row, which button, its key, and a restore() for a delete the server
// refused; the copy button dispatches its own events and reads its
// revert delay from an attribute; detach cancels every pending timer,
// restores every row still in flight and removes its toasts.

import { toast } from './overlays.js';
import { getStrings } from './strings.js';
import { watchOptions } from './live-options.js';

const COPY = '[data-kp-copy]';
const UNDO = '[data-kp-undo-action]';
/** A secret field [kpadopt4]: `.kp-secret[data-kp-secret]`. */
export const SECRET = '[data-kp-secret]';
/** How long a shown secret stays before it hides again, in seconds. Per element as `data-kp-secret-ttl` (0: until hidden). */
export const SECRET_TTL = 30;
/** The mask's length, in characters. Per element as `data-kp-secret-mask`. */
export const SECRET_MASK = 12;
/** Fired on the field, bubbling, when the clipboard was emptied after a copy (`data-kp-secret-clear`) or left alone: `{ cleared, reason }`. */
export const SECRET_CLIPBOARD_EVENT = 'kp-secret-clipboard';
/** Fired on the field, bubbling, when a secret is shown or hidden: `{ shown, reason }`, reason `press` | `hold` | `timer` | `away` | `call`. */
export const SECRET_EVENT = 'kp-secret';
/** Fired on the field, bubbling and cancelable, when it needs the value: `{ respond(value), fail(reason), purpose }`; call preventDefault() to answer. */
export const SECRET_REQUEST_EVENT = 'kp-secret-request';

/** How long the undo stays offered before the action is committed. An operational knob; per element as `data-kp-undo-ms`. */
export const UNDO_MS = 6000;
/** How long "copied" stays on the button. Per element as `data-kp-copied-ms`. */
export const COPIED_MS = 1500;

/** @typedef {{ target: HTMLElement, button: HTMLElement, key: string | null, restore: () => void }} ActionDetail */

/** Fired on the row when an optimistic action commits — the undo window closed [TH26]. Detail: ActionDetail. */
export const COMMIT_EVENT = 'kp-action-commit';
/** Fired on the row when it is undone instead. Detail: ActionDetail. */
export const UNDO_EVENT = 'kp-action-undo';
/** How long after a Copy the clipboard is emptied again, in ms [wish-1120, homelab 108]. */
export const CLEAR_AFTER_MS = 30_000;
const CLEAR_UNITS = /** @type {Record<string, number>} */ ({ ms: 1, s: 1000, sec: 1000, min: 60_000, m: 60_000, h: 3_600_000 });
/**
 * The clear delay of a field in ms: its attribute (a number of seconds, or a number with ms, s, min or h; 0, off, never,
 * false: none) or the option's value. 0 means never.
 * @param {string | undefined} attribute
 * @param {number | false} fallback
 */
function clearDelay(attribute, fallback) {
    const text = (attribute ?? '').trim().toLowerCase();
    if (text === '') return fallback || 0;
    if (['off', 'never', 'false', 'none'].includes(text)) return 0;
    const match = /^(\d*\.?\d+)\s*(ms|sec|s|min|m|h)?$/.exec(text);
    if (!match) return fallback || 0;
    return Number.parseFloat(/** @type {string} */ (match[1])) * (CLEAR_UNITS[match[2] ?? 's'] ?? 1000);
}
/** Fired on the copy button after a successful copy: `{ text }`. */
export const COPY_EVENT = 'kp-copy';
/** Fired on the copy button when the clipboard refused: `{ text, error }`. */
export const COPY_FAILED_EVENT = 'kp-copy-failed';

/**
 * Attach the patterns under `root`.
 *
 * `secretLoad(field, purpose)` reads a secret field's value when it is shown or copied (purpose `reveal` or `copy`), so the
 * value is in the page only while it is shown; without it a field asks through `kp-secret-request`, and last reads its
 * own `data-kp-secret-value`.
 *
 * `clearAfterMs` is how long after a Copy the clipboard is emptied again (default 30 000 ms; 0 or false: never), for every
 * secret field without its own `data-kp-secret-clear`.
 *
 * @param {ParentNode} root
 * @param {{ copiedMs?: number, undoMs?: number, clearAfterMs?: number | false, toastOnCopyFailure?: boolean, undoClassName?: string, secretLoad?: SecretLoad }} [options]
 * @returns {() => void} detach
 */
export function attachPatterns(
    root = document,
    { copiedMs = COPIED_MS, undoMs = UNDO_MS, clearAfterMs = CLEAR_AFTER_MS, toastOnCopyFailure = true, undoClassName = 'kp-button kp-button--ghost', secretLoad } = {},
) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    cleanups.push(attachSecrets(root, { copiedMs, clearAfterMs, ...(secretLoad ? { load: secretLoad } : {}) }));

    for (const element of root.querySelectorAll(COPY)) {
        const button = /** @type {HTMLButtonElement} */ (element);
        if (button.dataset.kpCopyAttached !== undefined) continue;
        button.dataset.kpCopyAttached = '';
        const idle = button.textContent ?? '';
        const done = button.dataset.kpCopiedText ?? getStrings().copied;
        const revertMs = Number.parseInt(button.dataset.kpCopiedMs ?? '', 10) || copiedMs;
        let revert = 0;

        const onClick = async () => {
            const target = button.dataset.kpCopy ?? '';
            // By id on the document, not on root: the value a button copies
            // may sit outside the subtree this call attached.
            const source = target === '' ? null : document.getElementById(target);
            const text = source?.textContent?.trim() ?? button.dataset.kpCopyValue ?? '';
            try {
                await navigator.clipboard.writeText(text);
            } catch (error) {
                // Refused — an insecure context, or the permission denied.
                // Saying nothing here is how a copy button becomes the
                // control people click twice and then distrust.
                button.dataset.kpCopyFailed = '';
                if (toastOnCopyFailure && button.dataset.kpCopyToast !== 'false') toast(getStrings().copyBlockedAnnouncement);
                button.dispatchEvent(new CustomEvent(COPY_FAILED_EVENT, { bubbles: true, detail: { text, error } }));
                return;
            }
            delete button.dataset.kpCopyFailed;
            // Confirmed in words on the button itself, and announced: a
            // colour change is invisible to a screen reader, and a toast
            // alone is invisible to someone looking at the button.
            button.textContent = done;
            button.dataset.kpCopied = '';
            button.dispatchEvent(new CustomEvent(COPY_EVENT, { bubbles: true, detail: { text } }));
            clearTimeout(revert);
            revert = window.setTimeout(() => {
                button.textContent = idle;
                delete button.dataset.kpCopied;
            }, revertMs);
        };

        button.addEventListener('click', onClick);
        cleanups.push(() => {
            button.removeEventListener('click', onClick);
            clearTimeout(revert);
            button.textContent = idle;
            delete button.dataset.kpCopied;
            delete button.dataset.kpCopyFailed;
            delete button.dataset.kpCopyAttached;
        });
    }

    for (const element of root.querySelectorAll(UNDO)) {
        const button = /** @type {HTMLButtonElement} */ (element);
        if (button.dataset.kpUndoAttached !== undefined) continue;
        button.dataset.kpUndoAttached = '';
        const ms = Number.parseInt(button.dataset.kpUndoMs ?? '', 10) || undoMs;
        /** Everything still inside its undo window, so detach can settle it. */
        /** @type {Set<() => void>} */
        const inFlight = new Set();

        const onClick = () => {
            // What goes: the element the consumer named by selector, the
            // nearest marked ancestor, the row, or the parent.
            const selector = button.dataset.kpUndoSelector;
            const target =
                (selector ? button.closest(selector) : null) ??
                button.closest('[data-kp-undo-target]') ??
                button.closest('tr') ??
                button.parentElement;
            if (!(target instanceof HTMLElement)) return;
            const key = target.dataset.kpRowKey ?? target.dataset.kpKey ?? (target.id || null);

            // Optimistic: the row goes now. Waiting for the server first
            // is what makes an interface feel slow, and the undo is what
            // makes going first safe.
            target.hidden = true;
            target.dataset.kpUndoPending = '';
            let settled = false;

            const restore = () => {
                target.hidden = false;
                delete target.dataset.kpUndoPending;
            };
            /** @type {ActionDetail} */
            const detail = { target, button, key, restore };

            let timer = 0;
            const message = toast(button.dataset.kpUndoText ?? getStrings().deleted, {
                ms: Number.parseInt(button.dataset.kpUndoToastMs ?? '', 10) || ms,
                action: {
                    label: button.dataset.kpUndoLabel ?? getStrings().undo,
                    onClick: () => {
                        if (settled) return;
                        settled = true;
                        inFlight.delete(cancel);
                        clearTimeout(timer);
                        restore();
                        message.dismiss();
                        target.dispatchEvent(new CustomEvent(UNDO_EVENT, { bubbles: true, detail }));
                    },
                },
            });
            for (const b of message.querySelectorAll('button')) b.className = undoClassName;

            timer = window.setTimeout(() => {
                if (settled) return;
                settled = true;
                inFlight.delete(cancel);
                delete target.dataset.kpUndoPending;
                // Only now is it real. The consumer deletes here, so a
                // click that was taken back never reached the server —
                // and restore() is in the detail for the delete the
                // server refuses.
                target.dispatchEvent(new CustomEvent(COMMIT_EVENT, { bubbles: true, detail }));
            }, ms);
            const cancel = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                restore();
                message.dismiss();
            };
            inFlight.add(cancel);
        };

        button.addEventListener('click', onClick);
        cleanups.push(() => {
            button.removeEventListener('click', onClick);
            // Nothing commits after detach: a row still in its window
            // comes back, and its toast goes.
            for (const cancel of inFlight) cancel();
            delete button.dataset.kpUndoAttached;
        });
    }

    return () => {
        for (const c of cleanups) c();
    };
}

// ── The secret field [kpadopt4] ─────────────────────────────────────────
//
// A token, a password, a key: shown as a mask, shown in full on request for
// a few seconds and then hidden again, copied without being shown. Seen in
// three of Kenny's apps, each drawn by hand (homelab's Secrets page, kyu's
// topic snippets, chassis's client tokens):
//
//   <div class="kp-secret" data-kp-secret data-kp-secret-ttl="30" data-kp-secret-label="API token"></div>
//
// The module builds what the markup leaves out: the value box with the mask,
// Reveal and Copy (package buttons, `.kp-copyable__button` for the copied
// and blocked looks), and the line under them that holds the countdown, the
// reason a field is disabled, or why it could not be read. That line always
// has its height, so nothing moves when it fills.
//
//   data-kp-secret-ttl="30"        seconds a shown value stays; 0: until Hide is pressed (the ttl, the mask and reveal-on
//                                  are read again when the attribute changes, js/live-options.js)
//   data-kp-secret-mask="12"       the mask's length (`data-kp-secret-mask-char`, default •)
//   data-kp-secret-reveal-on="hold" shown only while the button is held (pointer, or Space / Enter held)
//   data-kp-secret-copy="false"    no Copy button
//   data-kp-secret-clear="30"      how long after a Copy the clipboard is emptied again [wish-1120, homelab 108]; absent: 30 s (the
//                                  `clearAfterMs` option of attachPatterns / attachSecrets, 30 000). Any duration: `45` (seconds),
//                                  `500ms`, `90s`, `5min`, `1h`; `0`, `off`, `never` or `false`: never. Where the browser lets the page read the clipboard (`readText`), it is emptied only if
//                                  it still holds the copied secret (something copied since stays); where reading is refused it is
//                                  emptied anyway, as soon as the page can write (it needs the focus and, in Firefox, a press or a key
//                                  of the person's, so it may wait for the next one). A polite "Clipboard cleared"
//                                  is announced and `kp-secret-clipboard` fires on the field: `{ cleared, reason }`, reason
//                                  `timer`, `changed` (the clipboard held something else) or `unavailable`. The value is
//                                  never in the event
//   data-kp-secret-wrap="wrap"     a long value wraps (the box keeps `data-kp-secret-lines`, 2, lines of room);
//                                  by default it stays on one line and scrolls inside its box
//   data-kp-secret-disabled="why"  both buttons off, and the sentence under them says why
//   data-kp-secret-value="…"       the value itself, for a page that has it anyway; a page that does not
//                                  answers `kp-secret-request` or passes `secretLoad`, and the value is in
//                                  the page only while it is shown
//
// While shown the countdown ticks each second (a drain rule under the value
// runs out with it), and pauses while the reader selects the value or holds
// the focus in it; it hides at once when the tab goes to the background. A
// screen reader hears "Shown. Hides in 30 s.", "Hides in 10 s" and "Hidden
// again" from a polite region, not every second. The state is
// `data-kp-secret-state` on the field: hidden, loading, shown, error, disabled.

/**
 * Empty the clipboard again `wait` ms from now, only if it still holds `secret` where the page may read it [wish-1120, homelab 108].
 * Shared by the display field's Copy and the input field's Copy [wish-1028].
 * @param {HTMLElement} field @param {string} secret @param {number} wait @param {(text: string) => void} say
 * @returns {() => void} cancel
 */
function clearClipboardLater(field, secret, wait, say) {
    const s = getStrings();
    /** @type {(() => void) | null} */
    let dropFocus = null;
    /** @param {boolean} cleared @param {string} reason */
    const done = (cleared, reason) => {
        if (cleared) say(s.secretClipboardCleared);
        field.dispatchEvent(new CustomEvent(SECRET_CLIPBOARD_EVENT, { bubbles: true, detail: { cleared, reason } }));
    };
    const clear = async () => {
        let reason = 'timer';
        try {
            // Only if the clipboard still holds what was copied; a refusal to read does not stop the clearing.
            const now = await navigator.clipboard.readText();
            if (now !== secret) return done(false, 'changed');
        } catch {
            reason = 'unavailable';
        }
        try {
            await navigator.clipboard.writeText('');
            done(true, reason);
        } catch {
            // A write needs the page in focus and, in some browsers, a press or a key of the person's (Firefox): try
            // again at the next one, or when the page gets the focus back.
            const events = ['pointerdown', 'keydown'];
            const again = () => {
                for (const name of events) document.removeEventListener(name, again, true);
                window.removeEventListener('focus', again);
                dropFocus = null;
                void clear();
            };
            for (const name of events) document.addEventListener(name, again, true);
            window.addEventListener('focus', again);
            dropFocus = () => {
                for (const name of events) document.removeEventListener(name, again, true);
                window.removeEventListener('focus', again);
            };
        }
    };
    const timer = window.setTimeout(() => void clear(), wait);
    return () => {
        window.clearTimeout(timer);
        dropFocus?.();
    };
}

/** @typedef {(field: HTMLElement, purpose: 'reveal' | 'copy') => string | Promise<string>} SecretLoad */
/** @typedef {'hidden' | 'loading' | 'shown' | 'error' | 'disabled'} SecretState */

/** @type {WeakMap<Element, { reveal: (reason?: string) => void, hide: (reason?: string) => void }>} */
const secrets = new WeakMap();

/**
 * Show a secret field's value, as Reveal does; no-op on a disabled field.
 * @param {Element} field
 */
export function revealSecret(field) {
    secrets.get(field)?.reveal('call');
}

/**
 * Hide a secret field's value again and take it out of the page.
 * @param {Element} field
 */
export function hideSecret(field) {
    secrets.get(field)?.hide('call');
}

// ── The secret INPUT [wish-1028, chassis-rs 1] ───────────────────────────
//
// The same `.kp-secret` field, typed into instead of read: a token or a password a person enters, with its typing hidden. Built from
// the package's own parts (`.kp-field__input`, `.kp-button`, `.kp-copyable__button`, the line and drain of the display field):
//
//   <div class="kp-secret" data-kp-secret data-kp-secret-mode="input" data-kp-secret-label="API token" data-kp-secret-name="token"></div>
//
//   data-kp-secret-mode="input"    the input mode (read when the field attaches); without it the field only displays a value
//   data-kp-secret-name="token"    the input's name (and its form field)
//   data-kp-secret-placeholder     placeholder words
//   data-kp-secret-autocomplete    default `off`; `new-password` or `current-password` lets a password manager in
//   data-kp-secret-ttl="30"        how long a shown (unhidden) value stays: a number of seconds or a number with ms, s, min or h
//                                  (every unit of time); 0: until Hide is pressed. Default 30 s. Read again when it changes
//   data-kp-secret-hide-on-blur    default on: leaving the field (or the tab) hides the value; `false` keeps it shown
//   data-kp-secret-paste="false"   no Paste button (Paste reads the clipboard; where that is refused the line says to press Ctrl+V)
//   data-kp-secret-copy="false"    no Copy button; the Copy empties the clipboard again after `data-kp-secret-clear` like the display field
//   data-kp-secret-invalid="why"   the input is marked invalid and the line under it says why (read again when it changes)
//   data-kp-secret-disabled="why"  the input and the buttons are off and the line says why
//
// The value is `secretInputValue(field)` and the input's own `input` and `change` events; it is never in a custom event. Show and Hide
// fire `kp-secret` (`{ shown, reason }`) as the display field does. The state is `data-kp-secret-state`: hidden, shown, error, disabled.
// The line under the box always keeps its height: it says "Typing is hidden", the number of characters, the countdown, or the reason.

/** @type {WeakMap<Element, HTMLInputElement>} */
const secretInputs = new WeakMap();

/**
 * What has been typed into a secret input field (empty for a field that is not one).
 * @param {Element} field
 */
export function secretInputValue(field) {
    return secretInputs.get(field)?.value ?? '';
}

/**
 * Put a value into a secret input field, or empty it with an empty string; the field hides it again.
 * @param {Element} field @param {string} value
 */
export function setSecretInputValue(field, value) {
    const input = secretInputs.get(field);
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * @param {HTMLElement} field
 * @param {{ copiedMs: number, clearAfterMs: number | false }} options
 * @returns {() => void} detach
 */
function wireSecretInput(field, { copiedMs, clearAfterMs }) {
    const doc = field.ownerDocument;
    const s = getStrings();
    const make = (/** @type {string} */ tag, /** @type {string} */ className) => {
        const el = doc.createElement(tag);
        el.className = className;
        return el;
    };
    field.classList.add('kp-secret');
    if (!field.hasAttribute('role')) field.setAttribute('role', 'group');
    const name = field.getAttribute('aria-label') ?? field.dataset.kpSecretLabel ?? s.secretLabel;
    if (!field.hasAttribute('aria-label') && !field.hasAttribute('aria-labelledby')) field.setAttribute('aria-label', name);

    const built = /** @type {Element[]} */ ([]);
    let entry = /** @type {HTMLElement | null} */ (field.querySelector(':scope > .kp-secret__entry'));
    if (!entry) {
        entry = make('div', 'kp-secret__entry');
        field.prepend(entry);
        built.push(entry);
    }
    let input = /** @type {HTMLInputElement | null} */ (entry.querySelector('input'));
    const authored = input !== null;
    if (!input) {
        input = /** @type {HTMLInputElement} */ (make('input', 'kp-field__input kp-secret__input'));
        entry.append(input);
    }
    input.classList.add('kp-secret__input');
    input.type = 'password';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    if (!input.hasAttribute('autocomplete')) input.setAttribute('autocomplete', field.dataset.kpSecretAutocomplete ?? 'off');
    if (!input.name && field.dataset.kpSecretName) input.name = field.dataset.kpSecretName;
    if (!input.placeholder && field.dataset.kpSecretPlaceholder) input.placeholder = field.dataset.kpSecretPlaceholder;
    if (!input.hasAttribute('aria-label') && !input.id) input.setAttribute('aria-label', name);
    secretInputs.set(field, input);

    let actions = /** @type {HTMLElement | null} */ (field.querySelector(':scope > .kp-secret__actions'));
    if (!actions) {
        actions = make('div', 'kp-secret__actions');
        entry.after(actions);
        built.push(actions);
    }
    const button = (/** @type {string} */ className, /** @type {string} */ marker) => {
        const el = /** @type {HTMLButtonElement} */ (make('button', className));
        el.type = 'button';
        el.setAttribute(marker, '');
        actions.append(el);
        return el;
    };
    const reveal = button('kp-button kp-secret__reveal', 'data-kp-secret-reveal');
    const paste = field.dataset.kpSecretPaste === 'false' ? null : button('kp-button kp-secret__paste', 'data-kp-secret-paste-button');
    const copy = field.dataset.kpSecretCopy === 'false' ? null : button('kp-button kp-copyable__button kp-secret__copy', 'data-kp-secret-copy');
    for (const part of [reveal, paste, copy]) if (part) built.push(part);
    let line = /** @type {HTMLElement | null} */ (field.querySelector(':scope > .kp-secret__line'));
    if (!line) {
        line = make('p', 'kp-secret__line');
        field.append(line);
        built.push(line);
    }
    const words = make('span', 'kp-secret__words');
    const drain = make('span', 'kp-secret__drain');
    drain.setAttribute('aria-hidden', 'true');
    line.replaceChildren(words, drain);
    const spoken = make('span', 'kp-sr-only kp-secret__live');
    spoken.setAttribute('role', 'status');
    spoken.setAttribute('aria-live', 'polite');
    field.append(spoken);
    built.push(spoken);
    const lineId = line.id || `kp-secret-line-${Math.random().toString(36).slice(2, 9)}`;
    line.id = lineId;
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), lineId].filter(Boolean).join(' '));
    if (!input.id) input.id = `kp-secret-input-${Math.random().toString(36).slice(2, 9)}`;
    reveal.setAttribute('aria-controls', input.id);

    let shown = false;
    let seconds = SECRET_TTL;
    let left = 0;
    let timer = 0;
    let copiedTimer = 0;
    let cancelClear = () => {};
    /** The words of the last failed paste, until the next key. */
    let pasteProblem = '';
    const readOptions = () => {
        const ms = clearDelay(field.dataset.kpSecretTtl, SECRET_TTL * 1000);
        seconds = Math.round(ms / 1000);
    };
    readOptions();
    const hidesOnBlur = () => !['false', 'off'].includes(field.dataset.kpSecretHideOnBlur ?? '');
    const disabledWhy = () => field.dataset.kpSecretDisabled;
    const invalidWhy = () => field.dataset.kpSecretInvalid;
    /** @param {string} text */
    const say = (text) => {
        spoken.textContent = '';
        window.setTimeout(() => (spoken.textContent = text), 30);
    };
    const stop = () => {
        window.clearInterval(timer);
        timer = 0;
    };
    const paint = () => {
        const why = disabledWhy();
        const bad = invalidWhy();
        const empty = input.value === '';
        field.dataset.kpSecretState = why !== undefined ? 'disabled' : bad !== undefined || pasteProblem ? 'error' : shown ? 'shown' : 'hidden';
        input.type = shown ? 'text' : 'password';
        input.disabled = why !== undefined;
        if (bad !== undefined) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
        reveal.textContent = shown ? s.secretHide : s.secretReveal;
        reveal.setAttribute('aria-pressed', String(shown));
        reveal.disabled = why !== undefined || empty;
        if (paste) {
            paste.textContent = s.secretPaste;
            paste.disabled = why !== undefined;
        }
        if (copy && !copy.hasAttribute('data-kp-copied')) copy.textContent = s.secretCopy;
        if (copy) copy.disabled = why !== undefined || empty;
        const text =
            why !== undefined
                ? why
                : bad !== undefined
                  ? bad
                  : pasteProblem ||
                    (shown ? (seconds === 0 ? s.secretStaysShown : s.secretHidesIn(left)) : empty ? s.secretInputHint : s.secretInputCount(input.value.length));
        words.textContent = text;
    };
    /** @param {string} [reason] */
    const hide = (reason = 'press') => {
        if (!shown) return;
        shown = false;
        stop();
        paint();
        say(s.secretHidden);
        field.dispatchEvent(new CustomEvent(SECRET_EVENT, { bubbles: true, detail: { shown: false, reason } }));
    };
    const tick = () => {
        left -= 1;
        if (left === 10 && seconds > 10) say(s.secretHidesIn(10));
        if (left <= 0) hide('timer');
        else paint();
    };
    /** @param {string} [reason] */
    const show = (reason = 'press') => {
        if (shown || disabledWhy() !== undefined || input.value === '') return;
        shown = true;
        left = seconds;
        drain.style.animation = 'none';
        void drain.offsetWidth;
        drain.style.removeProperty('animation');
        paint();
        say(s.secretShown(seconds));
        field.dispatchEvent(new CustomEvent(SECRET_EVENT, { bubbles: true, detail: { shown: true, reason } }));
        if (seconds > 0) timer = window.setInterval(tick, 1000);
    };
    const onReveal = () => {
        if (shown) hide('press');
        else show('press');
        input.focus();
    };
    const onInput = () => {
        pasteProblem = '';
        if (input.value === '' && shown) hide('call');
        else paint();
    };
    const onPaste = async () => {
        if (!paste) return;
        let text = '';
        try {
            text = await navigator.clipboard.readText();
        } catch {
            pasteProblem = s.secretPasteBlocked;
            paint();
            say(pasteProblem);
            input.focus();
            return;
        }
        pasteProblem = '';
        const from = input.selectionStart ?? input.value.length;
        const to = input.selectionEnd ?? from;
        input.setRangeText(text, from, to, 'end');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        say(s.secretPasted(text.length));
        input.focus();
    };
    const onCopy = async () => {
        if (!copy || input.value === '') return;
        const text = input.value;
        try {
            await navigator.clipboard.writeText(text);
        } catch (error) {
            copy.dataset.kpCopyFailed = '';
            copy.dispatchEvent(new CustomEvent(COPY_FAILED_EVENT, { bubbles: true, detail: { text: '', error } }));
            say(s.copyBlockedAnnouncement);
            return;
        }
        delete copy.dataset.kpCopyFailed;
        copy.textContent = s.copied;
        copy.dataset.kpCopied = '';
        // The value itself is never put in the event or the announcement.
        copy.dispatchEvent(new CustomEvent(COPY_EVENT, { bubbles: true, detail: { text: '' } }));
        say(s.copiedAnnouncement(name));
        window.clearTimeout(copiedTimer);
        copiedTimer = window.setTimeout(() => {
            delete copy.dataset.kpCopied;
            paint();
        }, copiedMs);
        cancelClear();
        const wait = clearDelay(field.dataset.kpSecretClear, clearAfterMs);
        if (wait > 0) cancelClear = clearClipboardLater(field, text, wait, say);
    };
    /** @param {FocusEvent} event */
    const onFocusOut = (event) => {
        if (!shown || !hidesOnBlur()) return;
        const next = event.relatedTarget;
        if (next instanceof Node && field.contains(next)) return;
        hide('away');
    };
    const onAway = () => {
        if (doc.visibilityState === 'hidden' && hidesOnBlur()) hide('away');
    };
    input.addEventListener('input', onInput);
    reveal.addEventListener('click', onReveal);
    paste?.addEventListener('click', onPaste);
    copy?.addEventListener('click', onCopy);
    field.addEventListener('focusout', onFocusOut);
    doc.addEventListener('visibilitychange', onAway);
    paint();
    const watch = new MutationObserver(() => {
        if (disabledWhy() !== undefined) hide('call');
        paint();
    });
    watch.observe(field, { attributes: true, attributeFilter: ['data-kp-secret-disabled', 'data-kp-secret-invalid'] });
    const stopOptions = watchOptions(field, ['data-kp-secret-ttl'], () => {
        readOptions();
        if (shown) {
            stop();
            left = seconds;
            if (seconds > 0) timer = window.setInterval(tick, 1000);
        }
        paint();
    });
    secrets.set(field, { reveal: (reason) => show(reason), hide: (reason) => hide(reason) });
    return () => {
        watch.disconnect();
        stopOptions();
        stop();
        window.clearTimeout(copiedTimer);
        input.removeEventListener('input', onInput);
        reveal.removeEventListener('click', onReveal);
        paste?.removeEventListener('click', onPaste);
        copy?.removeEventListener('click', onCopy);
        field.removeEventListener('focusout', onFocusOut);
        doc.removeEventListener('visibilitychange', onAway);
        shown = false;
        input.value = '';
        input.type = 'password';
        for (const part of built) part.remove();
        if (authored) input.classList.remove('kp-secret__input');
        delete field.dataset.kpSecretState;
        secrets.delete(field);
        secretInputs.delete(field);
    };
}

/**
 * Attach every secret field under `root`.
 * @param {ParentNode} [root]
 * @param {{ load?: SecretLoad, copiedMs?: number, clearAfterMs?: number | false }} [options]
 * @returns {() => void} detach
 */
export function attachSecrets(root = document, { load, copiedMs = COPIED_MS, clearAfterMs = CLEAR_AFTER_MS } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    const fields = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(SECRET) ? [root] : []),
        ...root.querySelectorAll(SECRET),
    ]);
    for (const field of fields) {
        if (secrets.has(field)) continue;
        if (field.dataset.kpSecretMode === 'input') {
            cleanups.push(wireSecretInput(field, { copiedMs, clearAfterMs }));
            continue;
        }
        const doc = field.ownerDocument;
        const s = getStrings();
        const make = (/** @type {string} */ tag, /** @type {string} */ className) => {
            const el = doc.createElement(tag);
            el.className = className;
            return el;
        };
        field.classList.add('kp-secret');
        if (!field.hasAttribute('role')) field.setAttribute('role', 'group');
        if (!field.hasAttribute('aria-label') && !field.hasAttribute('aria-labelledby'))
            field.setAttribute('aria-label', field.dataset.kpSecretLabel ?? s.secretLabel);
        // The three options are read again when their attribute changes [live-options-1019]; `readOptions()` is the one place
        // that reads them.
        let hold = false;
        let seconds = SECRET_TTL;
        let mask = '';
        const readOptions = () => {
            hold = field.dataset.kpSecretRevealOn === 'hold';
            const ttl = Math.max(0, Number.parseInt(field.dataset.kpSecretTtl ?? '', 10));
            seconds = Number.isFinite(ttl) ? ttl : SECRET_TTL;
            const maskLength = Math.max(1, Number.parseInt(field.dataset.kpSecretMask ?? '', 10) || SECRET_MASK);
            mask = (field.dataset.kpSecretMaskChar ?? '•').repeat(maskLength);
        };
        readOptions();

        // The parts, built where the markup has none.
        const built = /** @type {Element[]} */ ([]);
        let value = /** @type {HTMLElement | null} */ (field.querySelector(':scope > .kp-secret__value'));
        if (!value) {
            value = make('code', 'kp-secret__value');
            field.prepend(value);
            built.push(value);
        }
        value.classList.add('kp-masked');
        value.textContent = mask;
        let actions = /** @type {HTMLElement | null} */ (field.querySelector(':scope > .kp-secret__actions'));
        if (!actions) {
            actions = make('div', 'kp-secret__actions');
            value.after(actions);
            built.push(actions);
        }
        let reveal = /** @type {HTMLButtonElement | null} */ (actions.querySelector('[data-kp-secret-reveal]'));
        if (!reveal) {
            reveal = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-secret__reveal'));
            reveal.type = 'button';
            reveal.setAttribute('data-kp-secret-reveal', '');
            actions.append(reveal);
            built.push(reveal);
        }
        let copy = /** @type {HTMLButtonElement | null} */ (actions.querySelector('[data-kp-secret-copy]'));
        if (!copy && field.dataset.kpSecretCopy !== 'false') {
            copy = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-copyable__button kp-secret__copy'));
            copy.type = 'button';
            copy.setAttribute('data-kp-secret-copy', '');
            copy.textContent = s.secretCopy;
            actions.append(copy);
            built.push(copy);
        }
        let line = /** @type {HTMLElement | null} */ (field.querySelector(':scope > .kp-secret__line'));
        if (!line) {
            line = make('p', 'kp-secret__line');
            field.append(line);
            built.push(line);
        }
        const words = make('span', 'kp-secret__words');
        const drain = make('span', 'kp-secret__drain');
        drain.setAttribute('aria-hidden', 'true');
        line.replaceChildren(words, drain);
        const spoken = make('span', 'kp-sr-only kp-secret__live');
        spoken.setAttribute('role', 'status');
        spoken.setAttribute('aria-live', 'polite');
        field.append(spoken);
        built.push(spoken);
        const valueId = value.id || `kp-secret-${Math.random().toString(36).slice(2, 9)}`;
        value.id = valueId;
        reveal.setAttribute('aria-controls', valueId);
        field.style.setProperty('--kp-secret-ttl', `${seconds}s`);
        const lines = Number.parseInt(field.dataset.kpSecretLines ?? '', 10);
        if (lines > 0) field.style.setProperty('--kp-secret-lines', String(lines));

        /** @type {SecretState} */
        let state = 'hidden';
        let left = seconds;
        let timer = 0;
        let paused = false;
        let ticket = 0;
        let copiedTimer = 0;
        let cancelClear = () => {};
        /** @param {string} text */
        const say = (text) => {
            spoken.textContent = '';
            window.setTimeout(() => (spoken.textContent = text), 30);
        };
        const disabledWhy = () => field.dataset.kpSecretDisabled;
        const label = () => (state === 'shown' ? s.secretHide : state === 'error' ? s.secretRetry : hold ? s.secretHold : s.secretReveal);
        /** @param {SecretState} next */
        const setState = (next) => {
            state = next;
            field.dataset.kpSecretState = next;
            const why = disabledWhy();
            reveal.textContent = label();
            reveal.disabled = why !== undefined || next === 'loading';
            reveal.setAttribute('aria-expanded', String(next === 'shown'));
            if (hold) reveal.setAttribute('aria-pressed', String(next === 'shown'));
            else reveal.removeAttribute('aria-pressed');
            if (copy) copy.disabled = why !== undefined;
            value.setAttribute('aria-busy', String(next === 'loading'));
            if (next !== 'shown') {
                // Taken out of the page, not only covered.
                field.removeAttribute('data-kp-secret-overflow');
                value.textContent = mask;
                value.classList.add('kp-masked');
                value.removeAttribute('tabindex');
            }
        };
        const writeLine = () => {
            const why = disabledWhy();
            if (why !== undefined) {
                field.dataset.kpSecretState = 'disabled';
                words.textContent = why;
                return;
            }
            if (state === 'loading') {
                words.replaceChildren();
                const spinner = make('span', 'kp-spinner kp-secret__spinner');
                spinner.setAttribute('aria-hidden', 'true');
                words.append(spinner, doc.createTextNode(s.secretReading));
            } else if (state === 'shown') words.textContent = seconds === 0 ? s.secretStaysShown : paused ? s.secretPaused : s.secretHidesIn(left);
            else if (state !== 'error') words.textContent = '';
        };
        const stop = () => {
            window.clearInterval(timer);
            timer = 0;
        };
        /** @param {string} [reason] */
        const hide = (reason = 'press') => {
            if (state !== 'shown' && state !== 'loading') return;
            ticket += 1;
            stop();
            paused = false;
            field.removeAttribute('data-kp-secret-paused');
            const was = state;
            setState('hidden');
            writeLine();
            if (was === 'shown') {
                say(s.secretHidden);
                field.dispatchEvent(new CustomEvent(SECRET_EVENT, { bubbles: true, detail: { shown: false, reason } }));
            }
        };
        /** @param {'reveal' | 'copy'} purpose @returns {Promise<string>} */
        const read = (purpose) =>
            new Promise((resolve, reject) => {
                let answered = false;
                const respond = (/** @type {string} */ v) => {
                    if (answered) return;
                    answered = true;
                    resolve(String(v));
                };
                const fail = (/** @type {unknown} */ why) => {
                    if (answered) return;
                    answered = true;
                    reject(why);
                };
                const event = new CustomEvent(SECRET_REQUEST_EVENT, { bubbles: true, cancelable: true, detail: { respond, fail, purpose } });
                field.dispatchEvent(event);
                if (event.defaultPrevented) return;
                if (load) {
                    Promise.resolve()
                        .then(() => load(field, purpose))
                        .then(respond, fail);
                    return;
                }
                const inline = field.dataset.kpSecretValue;
                if (inline !== undefined) respond(inline);
                else fail(new Error(s.secretNoSource));
            });
        /** @param {unknown} error */
        const reasonOf = (error) => (error instanceof Error ? error.message : typeof error === 'string' ? error : s.secretNoSource);
        const tick = () => {
            if (paused) return;
            left -= 1;
            if (left === 10 && seconds > 10) say(s.secretHidesIn(10));
            if (left <= 0) {
                hide('timer');
                return;
            }
            writeLine();
        };
        /** @param {string} [reason] */
        const show = async (reason = 'press') => {
            if (disabledWhy() !== undefined || state === 'loading' || state === 'shown') return;
            const mine = (ticket += 1);
            setState('loading');
            writeLine();
            let text = '';
            try {
                text = await read('reveal');
            } catch (error) {
                if (mine !== ticket) return;
                setState('error');
                words.textContent = s.secretFailed(reasonOf(error));
                say(words.textContent);
                return;
            }
            if (mine !== ticket) return;
            const shown = make('span', 'kp-secret__text');
            shown.textContent = text;
            value.replaceChildren(shown);
            value.classList.remove('kp-masked');
            value.tabIndex = 0;
            // A value longer than its box scrolls inside it; the fade at its end says there is more.
            field.toggleAttribute('data-kp-secret-overflow', value.scrollWidth > value.clientWidth + 1);
            left = seconds;
            paused = false;
            setState('shown');
            // The drain restarts with every showing.
            drain.style.animation = 'none';
            void drain.offsetWidth;
            drain.style.removeProperty('animation');
            writeLine();
            say(s.secretShown(seconds));
            field.dispatchEvent(new CustomEvent(SECRET_EVENT, { bubbles: true, detail: { shown: true, reason } }));
            if (seconds > 0 && !hold) timer = window.setInterval(tick, 1000);
        };
        /** @param {boolean} on */
        const pause = (on) => {
            if (state !== 'shown' || paused === on || seconds === 0) return;
            paused = on;
            field.toggleAttribute('data-kp-secret-paused', on);
            writeLine();
        };

        const onReveal = () => {
            if (hold) return;
            if (state === 'shown') hide('press');
            else void show('press');
        };
        /** @param {PointerEvent} event */
        const onHoldDown = (event) => {
            if (!hold || event.button !== 0) return;
            reveal.setPointerCapture?.(event.pointerId);
            void show('hold');
        };
        const onHoldUp = () => {
            if (hold) hide('hold');
        };
        /** @param {KeyboardEvent} event */
        const onHoldKey = (event) => {
            if (!hold || (event.key !== ' ' && event.key !== 'Enter')) return;
            event.preventDefault();
            if (event.type === 'keydown' && !event.repeat) void show('hold');
            if (event.type === 'keyup') hide('hold');
        };
        const onCopy = async () => {
            if (!copy || disabledWhy() !== undefined) return;
            const idle = s.secretCopy;
            let text = '';
            try {
                // The value already shown is copied as it stands; a hidden one is read, copied and never drawn.
                text = state === 'shown' ? (value.textContent ?? '') : await read('copy');
                await navigator.clipboard.writeText(text);
            } catch (error) {
                copy.dataset.kpCopyFailed = '';
                copy.dispatchEvent(new CustomEvent(COPY_FAILED_EVENT, { bubbles: true, detail: { text: '', error } }));
                say(s.copyBlockedAnnouncement);
                return;
            }
            delete copy.dataset.kpCopyFailed;
            copy.textContent = s.copied;
            copy.dataset.kpCopied = '';
            // The value itself is never put in the event or the announcement.
            copy.dispatchEvent(new CustomEvent(COPY_EVENT, { bubbles: true, detail: { text: '' } }));
            say(s.copiedAnnouncement(field.getAttribute('aria-label') ?? s.secretLabel));
            window.clearTimeout(copiedTimer);
            copiedTimer = window.setTimeout(() => {
                copy.textContent = idle;
                delete copy.dataset.kpCopied;
            }, copiedMs);
            scheduleClear(text);
        };
        /** Empty the clipboard again some seconds after a copy [wish-1120, homelab 108]. @param {string} secret */
        const scheduleClear = (secret) => {
            cancelClear();
            const wait = clearDelay(field.dataset.kpSecretClear, clearAfterMs);
            if (!(wait > 0)) return;
            cancelClear = clearClipboardLater(field, secret, wait, say);
        };
        const onFocusIn = (/** @type {FocusEvent} */ event) => {
            if (event.target === value) pause(true);
        };
        const onFocusOut = (/** @type {FocusEvent} */ event) => {
            if (event.target === value && !selected()) pause(false);
        };
        const selected = () => {
            const selection = doc.getSelection();
            return selection !== null && !selection.isCollapsed && value.contains(selection.anchorNode);
        };
        const onSelection = () => {
            if (state === 'shown') pause(selected() || doc.activeElement === value);
        };
        const onAway = () => {
            if (doc.visibilityState === 'hidden') hide('away');
        };

        reveal.addEventListener('click', onReveal);
        reveal.addEventListener('pointerdown', onHoldDown);
        reveal.addEventListener('pointerup', onHoldUp);
        reveal.addEventListener('pointercancel', onHoldUp);
        reveal.addEventListener('lostpointercapture', onHoldUp);
        reveal.addEventListener('keydown', onHoldKey);
        reveal.addEventListener('keyup', onHoldKey);
        reveal.addEventListener('blur', onHoldUp);
        copy?.addEventListener('click', onCopy);
        field.addEventListener('focusin', onFocusIn);
        field.addEventListener('focusout', onFocusOut);
        doc.addEventListener('selectionchange', onSelection);
        doc.addEventListener('visibilitychange', onAway);
        setState(disabledWhy() !== undefined ? 'disabled' : 'hidden');
        writeLine();
        // A later change of the reason (the page grants or takes the right) is followed.
        const watch = new MutationObserver(() => {
            if (disabledWhy() !== undefined) hide('call');
            setState(disabledWhy() !== undefined ? 'disabled' : state === 'disabled' ? 'hidden' : state);
            writeLine();
        });
        watch.observe(field, { attributes: true, attributeFilter: ['data-kp-secret-disabled'] });
        const stopOptions = watchOptions(field, ['data-kp-secret-ttl', 'data-kp-secret-reveal-on', 'data-kp-secret-mask', 'data-kp-secret-mask-char'], (names) => {
            const wasHold = hold;
            // A value shown the old way is hidden first: a held reveal has no timer, a timed one has no button to hold.
            if (names.includes('data-kp-secret-reveal-on') && (state === 'shown' || state === 'loading')) hide('call');
            readOptions();
            field.style.setProperty('--kp-secret-ttl', `${seconds}s`);
            if (hold !== wasHold) setState(state);
            if (names.includes('data-kp-secret-mask') || names.includes('data-kp-secret-mask-char')) {
                if (state !== 'shown') value.textContent = mask;
            }
            if (state === 'shown' && names.includes('data-kp-secret-ttl')) {
                // The new time starts now, and the drain with it.
                stop();
                left = seconds;
                paused = false;
                field.removeAttribute('data-kp-secret-paused');
                drain.style.animation = 'none';
                void drain.offsetWidth;
                drain.style.removeProperty('animation');
                if (seconds > 0 && !hold) timer = window.setInterval(tick, 1000);
                writeLine();
            }
        });
        secrets.set(field, { reveal: (reason) => void show(reason), hide: (reason) => hide(reason) });

        cleanups.push(() => {
            watch.disconnect();
            stopOptions();
            stop();
            window.clearTimeout(copiedTimer);
            reveal.removeEventListener('click', onReveal);
            reveal.removeEventListener('pointerdown', onHoldDown);
            reveal.removeEventListener('pointerup', onHoldUp);
            reveal.removeEventListener('pointercancel', onHoldUp);
            reveal.removeEventListener('lostpointercapture', onHoldUp);
            reveal.removeEventListener('keydown', onHoldKey);
            reveal.removeEventListener('keyup', onHoldKey);
            reveal.removeEventListener('blur', onHoldUp);
            copy?.removeEventListener('click', onCopy);
            field.removeEventListener('focusin', onFocusIn);
            field.removeEventListener('focusout', onFocusOut);
            doc.removeEventListener('selectionchange', onSelection);
            doc.removeEventListener('visibilitychange', onAway);
            ticket += 1;
            value.textContent = mask;
            for (const part of built) part.remove();
            delete field.dataset.kpSecretState;
            secrets.delete(field);
        });
    }
    return () => {
        for (const c of cleanups.splice(0)) c();
    };
}
