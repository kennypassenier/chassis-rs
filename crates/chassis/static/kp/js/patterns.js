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
 * @param {ParentNode} root
 * @param {{ copiedMs?: number, undoMs?: number, toastOnCopyFailure?: boolean, undoClassName?: string, secretLoad?: SecretLoad }} [options]
 * @returns {() => void} detach
 */
export function attachPatterns(
    root = document,
    { copiedMs = COPIED_MS, undoMs = UNDO_MS, toastOnCopyFailure = true, undoClassName = 'kp-button kp-button--ghost', secretLoad } = {},
) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    cleanups.push(attachSecrets(root, { copiedMs, ...(secretLoad ? { load: secretLoad } : {}) }));

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

/**
 * Attach every secret field under `root`.
 * @param {ParentNode} [root]
 * @param {{ load?: SecretLoad, copiedMs?: number }} [options]
 * @returns {() => void} detach
 */
export function attachSecrets(root = document, { load, copiedMs = COPIED_MS } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    const fields = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(SECRET) ? [root] : []),
        ...root.querySelectorAll(SECRET),
    ]);
    for (const field of fields) {
        if (secrets.has(field)) continue;
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
