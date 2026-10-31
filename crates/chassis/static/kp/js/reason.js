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
//
// The wrapper takes the control's place in layout, so it takes its column role too [b3b4-1019; kyu gap 16, almanac gap 13]:
// a `data-kp-action` on the control is mirrored onto the wrapper (js/actions.js reads the row's direct children), and the
// stylesheet makes the control fill the wrapper, so a disabled Delete sits in the same column, at the same width, as the
// enabled ones above and below it.

import { attachTooltips } from './overlays.js';
import { Controller, attachOne } from './controller.js';

/** A control that carries a reason. */
export const DISABLED_REASON = '[data-kp-disabled-reason]';

let counter = 0;

/** @param {Element} el */
const isOff = (el) => el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';

/** The attributes of the control that change what the wrapper and the tooltip say. */
const WATCHED = ['disabled', 'aria-disabled', 'data-kp-disabled-reason', 'data-kp-action'];

/** One control with a reason: wrapped in an anchor with a tooltip, kept in step with its attributes, and unwrapped on destroy. */
class DisabledReasonController extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        const doc = host.ownerDocument;
        this.anchor = doc.createElement('span');
        this.anchor.className = 'kp-tooltip-anchor kp-reason';
        this.tip = doc.createElement('span');
        this.tip.className = 'kp-popover kp-tooltip';
        this.tip.setAttribute('role', 'tooltip');
        /** The description the control had before the reason was added to it. */
        this.before = host.getAttribute('aria-describedby');
    }

    connect() {
        const control = this.host;
        control.dataset.kpReasonAttached = '';
        this.own(() => {
            delete control.dataset.kpReasonAttached;
        });
        this.tip.id = `kp-reason-${++counter}`;
        const parent = control.parentNode;
        if (!parent) return;
        parent.insertBefore(this.anchor, control);
        this.anchor.append(control, this.tip);
        this.own(() => this.restoreDescription());
        this.own(() => this.tip.remove());
        this.own(() => {
            if (this.anchor.parentNode) this.anchor.replaceWith(control);
        });
        this.own(attachTooltips(/** @type {ParentNode} */ (parent)));
        this.mirrorRole();
        this.sync();
        const observer = this.observe(new MutationObserver(() => this.sync()));
        observer.observe(control, { attributes: true, attributeFilter: WATCHED });
    }

    /** The role the control plays in a column of buttons, worn by the wrapper that stands in the row in its place. */
    mirrorRole() {
        const role = this.host.getAttribute('data-kp-action');
        if (role === null) this.anchor.removeAttribute('data-kp-action');
        else this.anchor.setAttribute('data-kp-action', role);
    }

    /** Show or hide the tooltip and add or take out its id in the control's description. */
    sync() {
        if (this.destroyed) return;
        const control = this.host;
        const { anchor, tip } = this;
        this.mirrorRole();
        const text = control.getAttribute('data-kp-disabled-reason') ?? '';
        const shown = text !== '' && isOff(control);
        tip.textContent = shown ? text : '';
        if (!shown) tip.hidden = true;
        anchor.toggleAttribute('data-kp-reason-off', shown);
        const ids = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id !== '' && id !== tip.id);
        if (shown) ids.push(tip.id);
        if (ids.length > 0) control.setAttribute('aria-describedby', ids.join(' '));
        else control.removeAttribute('aria-describedby');
    }

    /** Give the control back the description it had. */
    restoreDescription() {
        if (this.before === null) this.host.removeAttribute('aria-describedby');
        else this.host.setAttribute('aria-describedby', this.before);
    }
}

/**
 * Wire every control under `root` that carries `data-kp-disabled-reason`.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachDisabledReasons(root = document) {
    /** @type {DisabledReasonController[]} */
    const made = [];
    for (const found of root.querySelectorAll(DISABLED_REASON)) {
        const control = /** @type {HTMLElement} */ (found);
        // Tested one by one: wrapping a control changes what the next one sits in.
        if (control.dataset.kpReasonAttached !== undefined || control.closest('.kp-tooltip-anchor') !== null) continue;
        const controller = attachOne(control, DisabledReasonController);
        if (controller) made.push(controller);
    }
    return () => {
        for (const controller of made) controller.destroy();
    };
}
