// Tooltips: attaches them to the elements that carry one.
import { Controller, attachOne } from '../controller.js';
import { playEntranceBackwards, stopReversing } from '../motion.js';
import { TOOLTIP_EVENT, TOOLTIP_OWNED } from './constants.js';

/** How long (ms) the pointer rests before a tooltip opens, and leaves before it closes, when neither the call nor the anchor says. */
const OPEN_DELAY_MS = 300;
const CLOSE_DELAY_MS = 100;

/**
 * Framework-free tooltips on `.kp-tooltip-anchor` [gap-11].
 *
 *   <span class="kp-tooltip-anchor">
 *     <button type="button" class="kp-button">Recalibrate</button>
 *     <span role="tooltip" class="kp-popover kp-tooltip">Takes about two minutes</span>
 *   </span>
 *
 * The same contract as the React Tooltip: hidden at rest, shown after a
 * short delay under the pointer and at once on focus, gone when the
 * pointer or focus leaves, and gone on Escape (WCAG 1.4.13). The trigger
 * is described by the tooltip — an id is given where there was none, and
 * `aria-describedby` gains it rather than losing what it held. The anchor
 * names itself for anchor positioning, as the React channel does. Detach
 * puts back the attributes, the styles and the hidden state it found.
 *
 * @param {ParentNode} root
 * @param {{ openDelayMs?: number, closeDelayMs?: number, closeOnEscape?: boolean, ownedBy?: string }} [options]
 *   Per anchor: `data-kp-open-delay`, `data-kp-close-delay`, `data-kp-close-on-escape="false"`.
 * @returns {() => void} detach
 */
export function attachTooltips(root = document, { openDelayMs = OPEN_DELAY_MS, closeDelayMs = CLOSE_DELAY_MS, closeOnEscape = true, ownedBy = TOOLTIP_OWNED } = {}) {
    // An anchor another channel owns, one marked attached, or one without a tooltip and a trigger is left alone.
    const made = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.kp-tooltip-anchor')])
        .filter((anchor) => !(ownedBy !== '' && anchor.matches(ownedBy)) && !('kpTooltipAttached' in anchor.dataset))
        .filter((anchor) => partsOf(anchor) !== null)
        .map((anchor, index) => attachOne(anchor, TooltipControl, { openDelayMs, closeDelayMs, closeOnEscape, count: index + 1 }));
    return () => {
        for (const control of made.splice(0)) control?.destroy();
    };
}

/** The anchor's tooltip and the trigger beside it, or null when either is missing. @param {HTMLElement} anchor */
function partsOf(anchor) {
    const tooltip = /** @type {HTMLElement | null} */ (anchor.querySelector('[role="tooltip"], .kp-tooltip'));
    const trigger = /** @type {HTMLElement | null} */ ([...anchor.children].find((child) => child !== tooltip) ?? null);
    return tooltip === null || trigger === null ? null : { tooltip, trigger };
}

/** @param {string | undefined} value @param {number} fallback */
const numberOr = (value, fallback) => (value === undefined || Number.isNaN(Number(value)) ? fallback : Number(value));

/**
 * One tooltip: what attach found (to put back on detach), its delays, the pending timer, and whether it is going. Going, it plays
 * its entrance backwards before it is hidden, so it leaves as it came (Kenny, 2026-10-05: no discrepancy between opening and
 * closing); wanted back meanwhile, it turns round.
 */
class TooltipControl extends Controller {
    /** @param {HTMLElement} host @param {{ openDelayMs?: number, closeDelayMs?: number, closeOnEscape?: boolean, count?: number }} [options] */
    constructor(host, options = {}) {
        super(host, options);
        const { tooltip, trigger } = /** @type {{ tooltip: HTMLElement, trigger: HTMLElement }} */ (partsOf(host));
        this.tooltip = tooltip;
        this.trigger = trigger;
        /** The tooltip's place among those its attach call wired, for a generated id. */
        this.count = options.count ?? 1;
        this.before = {
            id: tooltip.getAttribute('id'),
            hidden: tooltip.hidden,
            describedby: trigger.getAttribute('aria-describedby'),
            anchorName: host.style.getPropertyValue('anchor-name'),
            positionAnchor: tooltip.style.getPropertyValue('position-anchor'),
        };
        this.openDelay = numberOr(host.dataset.kpOpenDelay, options.openDelayMs ?? OPEN_DELAY_MS);
        this.closeDelay = numberOr(host.dataset.kpCloseDelay, options.closeDelayMs ?? CLOSE_DELAY_MS);
        this.escapes = host.dataset.kpCloseOnEscape === undefined ? (options.closeOnEscape ?? true) : host.dataset.kpCloseOnEscape !== 'false';
        this.timer = 0;
        this.going = false;
    }

    connect() {
        const { host: anchor, tooltip } = this;
        anchor.dataset.kpTooltipAttached = '';
        this.own(() => this.restore());
        this.describe();
        tooltip.hidden = true;
        this.listen(anchor, 'pointerenter', () => this.schedule(true, this.openDelay));
        this.listen(anchor, 'pointerleave', () => {
            if (!anchor.contains(document.activeElement)) this.schedule(false, this.closeDelay);
        });
        this.listen(anchor, 'focusin', () => this.schedule(true, 0));
        this.listen(anchor, 'focusout', () => this.schedule(false, 0));
        this.listen(document, 'keydown', (event) => {
            if (this.escapes && /** @type {KeyboardEvent} */ (event).key === 'Escape' && !tooltip.hidden) this.set(false);
        });
    }

    /**
     * The trigger is described by the tooltip: an id is given where there was none, and `aria-describedby` gains it rather than
     * losing what it held. The anchor names itself for anchor positioning, as the React channel does.
     */
    describe() {
        const { host: anchor, tooltip, trigger, before } = this;
        if (!tooltip.id) tooltip.id = `kp-tooltip-${this.count}-${Math.random().toString(36).slice(2, 8)}`;
        const ids = (before.describedby ?? '').split(/\s+/).filter(Boolean);
        if (!ids.includes(tooltip.id)) trigger.setAttribute('aria-describedby', [...ids, tooltip.id].join(' '));
        if (before.anchorName === '') anchor.style.setProperty('anchor-name', `--${tooltip.id}`);
        if (before.positionAnchor === '') tooltip.style.setProperty('position-anchor', before.anchorName || `--${tooltip.id}`);
    }

    /** Put back the attributes, the styles and the hidden state attach found. */
    restore() {
        const { host: anchor, tooltip, trigger, before } = this;
        clearTimeout(this.timer);
        this.going = false;
        stopReversing(tooltip);
        tooltip.hidden = before.hidden;
        if (before.id === null) tooltip.removeAttribute('id');
        if (before.describedby === null) trigger.removeAttribute('aria-describedby');
        else trigger.setAttribute('aria-describedby', before.describedby);
        if (before.anchorName === '') anchor.style.removeProperty('anchor-name');
        if (before.positionAnchor === '') tooltip.style.removeProperty('position-anchor');
        delete anchor.dataset.kpTooltipAttached;
    }

    /** @param {boolean} open */
    set(open) {
        const tooltip = this.tooltip;
        clearTimeout(this.timer);
        if (open && this.going) {
            this.going = false;
            stopReversing(tooltip);
        } else if (this.going || tooltip.hidden === !open) return;
        else if (open) tooltip.hidden = false;
        else this.leave();
        this.host.dispatchEvent(new CustomEvent(TOOLTIP_EVENT, { bubbles: true, detail: { open, tooltip } }));
    }

    /** Play the entrance backwards, then hide; a set(true) meanwhile takes it over. */
    leave() {
        const tooltip = this.tooltip;
        this.going = true;
        void playEntranceBackwards(tooltip).then(() => {
            if (!this.going) return;
            this.going = false;
            tooltip.hidden = true;
            stopReversing(tooltip);
        });
    }

    /** @param {boolean} open @param {number} delay */
    schedule(open, delay) {
        clearTimeout(this.timer);
        if (delay <= 0) this.set(open);
        else this.timer = window.setTimeout(() => this.set(open), delay);
    }
}
