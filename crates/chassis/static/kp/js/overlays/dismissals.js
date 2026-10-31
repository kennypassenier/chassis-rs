// Dismissible alerts: dismissing, remembering and showing again.
import { memoryFor, paintRemembered } from '../remember.js';
import { arriveShown, leave, leavesState } from '../motion.js';
import { ALERT_DISMISS_EVENT, DISMISS_OWNED, TOAST_HIDE_EVENT } from './constants.js';
import { goingToasts } from './toast.js';

/** @type {WeakSet<Event>} */
const dismissHandled = new WeakSet();

/**
 * Make `.kp-alert__close` and `.kp-toast__close` close what they sit in,
 * without a framework [gap-11].
 *
 * Before this only the React components did anything with those buttons;
 * a server-rendered alert kept a close button that did nothing, which is
 * worse than no button at all. Delegated from `root`, so a toast raised
 * after attach is covered too.
 *
 * An alert leaves the theme's way (js/motion.js leave(), its space folding
 * shut) and is then hidden (`hidden`, which the base layer holds above
 * every layout class), after ALERT_DISMISS_EVENT, which a consumer may
 * cancel to keep it or to animate it out itself — setting `hidden = false`
 * brings it back. A toast leaves through its own `dismiss()` when `toast()` made it,
 * so TOAST_HIDE_EVENT fires as it does on a timeout; otherwise it
 * leaves the theme's way (js/motion.js leave()) and the same event is
 * dispatched on its region once it is gone.
 *
 * `data-kp-remember="name"` on an alert [wish-1120, homelab 119]: a dismissal is kept (js/remember.js, component `alert`, slot
 * `dismissed`), and the alert is hidden again on the next visit, before the first paint where js/auto.js restores. showAlertAgain(alert)
 * forgets it and shows the alert, for a note whose reason came back.
 *
 * @param {ParentNode} root
 * @param {{ ownedBy?: string }} [options] `ownedBy: ''` wires even the buttons another channel marked
 * @returns {() => void} detach
 */
export function attachDismissals(root = document, { ownedBy = DISMISS_OWNED } = {}) {
    /** @param {Event} event */
    const onClick = (event) => {
        // One click, one dismissal, however many roots on the way up were attached.
        if (dismissHandled.has(event)) return;
        const target = event.target instanceof Element ? event.target : null;
        const button = target?.closest('.kp-alert__close, .kp-toast__close');
        if (!button) return;
        if (ownedBy !== '' && button.matches(ownedBy)) return;
        dismissHandled.add(event);
        const toastEl = /** @type {(HTMLElement & { dismiss?: () => void }) | null} */ (button.closest('.kp-toast'));
        if (button.classList.contains('kp-toast__close') && toastEl) {
            if (typeof toastEl.dismiss === 'function') {
                toastEl.dismiss();
                return;
            }
            const region = toastEl.parentElement;
            if (goingToasts.has(toastEl)) return;
            goingToasts.add(toastEl);
            void leave(toastEl).then(() => region?.dispatchEvent(new CustomEvent(TOAST_HIDE_EVENT, { bubbles: true, detail: { toast: toastEl } })));
            return;
        }
        const alert = /** @type {HTMLElement | null} */ (button.closest('.kp-alert'));
        if (!alert) return;
        const proceed = alert.dispatchEvent(new CustomEvent(ALERT_DISMISS_EVENT, { bubbles: true, cancelable: true, detail: { alert, button } }));
        // It leaves the theme's way, its space folding shut, then is hidden.
        if (!proceed) return;
        // `data-kp-remember` on the alert: it stays closed on the next visit [wish-1120, homelab 119].
        if (alert.hasAttribute('data-kp-remember')) memoryFor(alert, 'alert')?.write('dismissed', true);
        void leave(alert, { hide: true }).then(() => {
            // In a theme that lets states leave first (leavesState()), the
            // alert shown again (`hidden = false`) arrives as it leaves, played
            // backwards; nothing else would play it, as it sits in no box.
            if (!leavesState(alert)) return;
            const back = new MutationObserver(() => {
                if (alert.hidden) return;
                back.disconnect();
                arriveShown(alert);
            });
            back.observe(alert, { attributes: true, attributeFilter: ['hidden'] });
        });
    };
    root.addEventListener('click', onClick);
    // An alert that was dismissed and asked to be remembered stays closed [wish-1120, homelab 119].
    for (const alert of root.querySelectorAll('.kp-alert[data-kp-remember]')) paintRemembered(alert, 'alert');
    return () => root.removeEventListener('click', onClick);
}

/**
 * Open a remembered alert again: forget that it was dismissed and show it. For a page that has a reason to say it once more (a new
 * version of the note it explained).
 * @param {HTMLElement} alert a `.kp-alert[data-kp-remember]`
 */
export function showAlertAgain(alert) {
    memoryFor(alert, 'alert')?.forget('dismissed');
    alert.hidden = false;
}
