// A disabled control says why [kpadopt5].
//
// UI_PRINCIPLES §3: a control that cannot be used is disabled and the sentence that explains it is its reason. The
// sentence is the attribute `data-kp-disabled-reason`; this module draws it as the package's tooltip and hands it to a
// screen reader as the control's description:
//
//   <button class="kp-button" disabled data-kp-disabled-reason="Nothing is selected yet">Delete</button>
//
// A disabled button gets no pointer events of its own, so the control is wrapped once in a `.kp-tooltip-anchor` that
// does; the tooltip shows only while the control is disabled, and a control that comes back to life loses it. The
// reason follows the attribute: change or remove it and the sentence changes or goes. Nothing runs on import.

import { attachTooltips } from './overlays.js';

/** A control that carries a reason. */
export const DISABLED_REASON = '[data-kp-disabled-reason]';

let counter = 0;

/** @param {Element} el */
const isOff = (el) => el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';

/**
 * Wire every control under `root` that carries `data-kp-disabled-reason`.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachDisabledReasons(root = document) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    for (const found of root.querySelectorAll(DISABLED_REASON)) {
        const control = /** @type {HTMLElement} */ (found);
        if (control.dataset.kpReasonAttached !== undefined || control.closest('.kp-tooltip-anchor') !== null) continue;
        control.dataset.kpReasonAttached = '';
        const doc = control.ownerDocument;
        const anchor = doc.createElement('span');
        anchor.className = 'kp-tooltip-anchor kp-reason';
        const tip = doc.createElement('span');
        tip.className = 'kp-popover kp-tooltip';
        tip.setAttribute('role', 'tooltip');
        tip.id = `kp-reason-${++counter}`;
        const parent = control.parentNode;
        if (!parent) continue;
        parent.insertBefore(anchor, control);
        anchor.append(control, tip);
        const detachTip = attachTooltips(/** @type {ParentNode} */ (parent));
        const before = control.getAttribute('aria-describedby');

        const sync = () => {
            const text = control.getAttribute('data-kp-disabled-reason') ?? '';
            const shown = text !== '' && isOff(control);
            tip.textContent = shown ? text : '';
            if (!shown) tip.hidden = true;
            anchor.toggleAttribute('data-kp-reason-off', shown);
            const ids = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id !== '' && id !== tip.id);
            if (shown) ids.push(tip.id);
            if (ids.length > 0) control.setAttribute('aria-describedby', ids.join(' '));
            else control.removeAttribute('aria-describedby');
        };
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(control, { attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'data-kp-disabled-reason'] });
        cleanups.push(() => {
            observer.disconnect();
            detachTip();
            if (anchor.parentNode) {
                anchor.replaceWith(control);
            }
            tip.remove();
            if (before === null) control.removeAttribute('aria-describedby');
            else control.setAttribute('aria-describedby', before);
            delete control.dataset.kpReasonAttached;
        });
    }
    return () => {
        for (const clean of cleanups) clean();
    };
}
