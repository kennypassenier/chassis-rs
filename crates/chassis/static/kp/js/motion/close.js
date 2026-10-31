// Closing a dialog as its entrance played backwards, and opening it as that close turned around.
import { closing, entranceOf, entrances, keepsLines, nativeClose, turnEntrances } from './keyframes.js';
import { themeMotion } from './timing.js';

/**
 * Close a dialog the way it opened, backwards, then close it for real. With
 * no entrance to reverse (reduced motion, a theme without one) it closes at
 * once.
 *
 * @param {HTMLDialogElement} dialog
 * @param {string} [returnValue]
 * @returns {Promise<void>} settled once the dialog is closed
 */
export async function closeDialog(dialog, returnValue) {
    const close = () => nativeClose?.call(dialog, returnValue);
    if (!dialog.open || closing.has(dialog)) return;
    const { close: duration } = themeMotion(dialog);
    const kept = entrances.get(dialog) ?? [];
    if (duration <= 0) return void close();
    closing.add(dialog);
    /** @type {Animation[]} */
    const out = [];
    // `--kp-lines: keep`: every kept line plays in its own time and with its
    // own wait, the whole turned round (turnLines()); otherwise each takes
    // the close's one time.
    const lines = kept.length > 0 && keepsLines(dialog) ? turnEntrances(kept, duration) : null;
    kept.forEach(({ target, keyframes, easing, pseudoElement }, at) => {
        try {
            out.push(
                target.animate(keyframes, {
                    duration: lines ? lines[at].duration : duration,
                    ...(lines ? { delay: lines[at].closeDelay } : {}),
                    easing,
                    direction: 'reverse',
                    fill: 'forwards',
                    ...(pseudoElement ? { pseudoElement } : {}),
                }),
            );
        } catch {
            /* an engine that cannot animate that pseudo-element skips it */
        }
    });
    // The backdrop leaves with the dialog when the theme gave it no motion of its own.
    if (!kept.some((one) => one.target === dialog && one.pseudoElement === '::backdrop')) {
        try {
            out.push(
                dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease-in', fill: 'forwards', pseudoElement: '::backdrop' }),
            );
        } catch {
            /* as above */
        }
    }
    if (kept.length === 0) out.push(dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease-in', fill: 'forwards' }));
    await Promise.all(out.map((a) => a.finished.catch(() => undefined)));
    closing.delete(dialog);
    close();
    for (const a of out) a.cancel();
}
/**
 * Whether the theme `el` wears opens what closes as that close played
 * backwards: its register says `--kp-open: reverse-close` (every register
 * since 2026-10-05; Kenny's pick on research/open-reverse).
 * @param {Element} el
 */
export const opensAsReversedClose = (el) => getComputedStyle(el).getPropertyValue('--kp-open').trim() === 'reverse-close';
/**
 * Open `dialog` as its close played backwards [research/open-reverse]:
 * closeDialog() plays each kept entrance with `direction: 'reverse'` in
 * themeMotion().close; this replaces the register's entrance with the same
 * keyframes on the same curve, forwards, in that same time, and the
 * backdrop's fade turned around, so frame t of the opening is frame
 * (close - t) of the close. Only in a theme that asks for it.
 * @param {HTMLDialogElement} dialog
 */
export function openAsReversedClose(dialog) {
    if (!dialog.open || !opensAsReversedClose(dialog)) return;
    const { close: duration } = themeMotion(dialog);
    const kept = entrances.get(dialog) ?? [];
    if (duration <= 0) return;
    for (const a of entranceOf(dialog)) a.cancel();
    // As the close reads them (closeDialog()): with `--kp-lines: keep` each
    // line plays its own wait and time, so frame t is still frame (close - t).
    const lines = kept.length > 0 && keepsLines(dialog) ? turnEntrances(kept, duration) : null;
    kept.forEach(({ target, keyframes, easing, pseudoElement }, at) => {
        try {
            target.animate(keyframes, {
                duration: lines ? lines[at].duration : duration,
                ...(lines ? { delay: lines[at].openDelay } : {}),
                easing,
                fill: 'backwards',
                ...(pseudoElement ? { pseudoElement } : {}),
            });
        } catch {
            /* an engine that cannot animate that pseudo-element skips it, as the close does */
        }
    });
    const fade = /** @type {Keyframe[]} */ ([{ opacity: 1 }, { opacity: 0 }]);
    if (!kept.some((one) => one.target === dialog && one.pseudoElement === '::backdrop')) {
        try {
            dialog.animate(fade, { duration, easing: 'ease-in', direction: 'reverse', fill: 'backwards', pseudoElement: '::backdrop' });
        } catch {
            /* as above */
        }
    }
    if (kept.length === 0) dialog.animate(fade, { duration, easing: 'ease-in', direction: 'reverse', fill: 'backwards' });
}
