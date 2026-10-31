// Clears the clipboard later, only when it still holds the secret.
import { getStrings } from '../strings.js';
import { SECRET_CLIPBOARD_EVENT } from './constants.js';

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
export function clearClipboardLater(field, secret, wait, say) {
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
