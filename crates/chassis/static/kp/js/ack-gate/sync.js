// Keeping the controls a gate guards in step with every gate that guards them: held off with a reason, and a press on a held control sent to the first open tick.

import { attachDisabledReasons } from '../reason.js';
import { AckCore } from './core.js';
import { open, siblingsOf, targetsOf } from './targets.js';

export class AckSync extends AckCore {
    /** A held control answers a press by taking the reader to the first tick still open. @param {HTMLElement} target */
    guardTarget(target) {
        if (target.dataset.kpAckGuarded !== undefined) return;
        target.dataset.kpAckGuarded = '';
        const guard = (/** @type {Event} */ event) => {
            if (target.getAttribute('aria-disabled') !== 'true' || target.getAttribute('data-kp-ack-held') === null) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const first = siblingsOf(this.host).find(open);
            if (first && first.getAttribute('data-kp-ack-focus') !== 'off')
                /** @type {HTMLElement | null} */ (first.querySelector('.kp-ack__tick input'))?.focus();
        };
        this.own(() => {
            delete target.dataset.kpAckGuarded;
            target.removeAttribute('data-kp-ack-held');
        });
        this.listen(target, 'click', guard, true);
    }

    /** Hold a control: disabled for assistive tech, with the reason, remembering what it was. @param {HTMLElement} target */
    hold(target) {
        if (target.getAttribute('data-kp-ack-held') === null) {
            target.setAttribute('data-kp-ack-held', '');
            target.dataset.kpAckWas = target.getAttribute('aria-disabled') ?? '';
        }
        target.setAttribute('aria-disabled', 'true');
        target.setAttribute('data-kp-disabled-reason', this.reasonFor());
        if (target.parentElement && !target.closest('.kp-reason')) attachDisabledReasons(target.parentElement);
    }

    /** Let a held control go and put back what it was. @param {HTMLElement} target */
    release(target) {
        target.removeAttribute('data-kp-ack-held');
        if (target.dataset.kpAckWas === 'true') target.setAttribute('aria-disabled', 'true');
        else target.removeAttribute('aria-disabled');
        target.removeAttribute('data-kp-disabled-reason');
        delete target.dataset.kpAckWas;
    }

    /** Bring every control this gate guards in step with every gate that guards it. */
    syncTargets() {
        for (const target of targetsOf(this.host)) {
            this.guardTarget(target);
            const holding = siblingsOf(this.host).some(open);
            if (holding) this.hold(target);
            else if (target.getAttribute('data-kp-ack-held') !== null) this.release(target);
        }
    }
}
