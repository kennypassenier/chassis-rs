// The label tip beside a collapsed rail's item, and placing what floats beside the rail.
import { playEntranceBackwards, stopReversing } from '../motion.js';
import { FLOAT_GAP, FLOAT_MARGIN, TIP_OPEN_MS } from './constants.js';
import { OPTIONS } from './options.js';
import { SidenavSlim } from './slim.js';

export class SidenavTip extends SidenavSlim {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        // The label tip: one per panel, the package's tooltip in the top layer. It repeats the visible-to-nobody label, so it is
        // hidden from the accessibility tree; the label itself stays the item's name.
        /** @type {HTMLElement | null} */
        this.tip = null;
        /** The item the tip shows, or is about to show. @type {Element | null} */
        this.tipFor = null;
        /** The pointer's rest before the tip shows. */
        this.tipTimer = 0;
        /** Whether the tip is playing its going. */
        this.tipGoing = false;
        /** The submenus floated out of the rail, and whether the `popover` attribute was added here. @type {Map<HTMLElement, { added: boolean }>} */
        this.floated = new Map();
    }

    /**
     * Place a box that floats beside the rail, in the top layer: beside the item, on the far side of the panel, turned to the near
     * side when the window has no room there, and kept inside the window.
     *
     * @param {HTMLElement} box
     * @param {Element} item
     * @param {'start' | 'centre'} align
     */
    floatBeside(box, item, align) {
        const at = item.getBoundingClientRect();
        const rail = this.panel.getBoundingClientRect();
        const width = box.offsetWidth;
        const height = box.offsetHeight;
        const view = this.doc.documentElement.clientWidth;
        const tall = this.doc.documentElement.clientHeight;
        const towardEnd = this.edge() !== 'end';
        let x = towardEnd ? rail.right + FLOAT_GAP : rail.left - FLOAT_GAP - width;
        if (towardEnd && x + width > view - FLOAT_MARGIN) x = rail.left - FLOAT_GAP - width;
        if (!towardEnd && x < FLOAT_MARGIN) x = rail.right + FLOAT_GAP;
        x = Math.max(FLOAT_MARGIN, Math.min(x, view - FLOAT_MARGIN - width));
        let y = align === 'centre' ? at.top + at.height / 2 - height / 2 : at.top;
        if (y + height > tall - FLOAT_MARGIN) y = align === 'centre' ? tall - FLOAT_MARGIN - height : at.bottom - height;
        y = Math.max(FLOAT_MARGIN, y);
        box.style.setProperty('--kp-sidenav-float-x', `${Math.round(x)}px`);
        box.style.setProperty('--kp-sidenav-float-y', `${Math.round(y)}px`);
    }

    /** Show a popover, once more a task later when Firefox refuses during another one's hide. @param {HTMLElement} box @param {() => void} then */
    show(box, then) {
        try {
            box.showPopover();
            then();
        } catch {
            // Firefox refuses a popover while another one hides: try once more a task later.
            setTimeout(() => {
                try {
                    if (!box.matches(':popover-open')) box.showPopover();
                    then();
                } catch {
                    // Gone meanwhile: nothing to show.
                }
            }, 0);
        }
    }

    /** The items a tip names: links, and the group headings while the groups do not float out. */
    tipItems() {
        return this.flying() ? '.kp-sidenav__link' : '.kp-sidenav__link, .kp-sidenav__category-toggle';
    }

    hideTip() {
        clearTimeout(this.tipTimer);
        this.tipFor = null;
        const box = this.tip;
        if (box === null || !box.matches(':popover-open') || this.tipGoing) return;
        this.tipGoing = true;
        void playEntranceBackwards(box).then(() => {
            this.tipGoing = false;
            stopReversing(box);
            if (this.tipFor === null && box.matches(':popover-open')) box.hidePopover();
        });
    }

    /** @param {Element} item */
    showTip(item) {
        clearTimeout(this.tipTimer);
        const words = (item.querySelector('.kp-sidenav__label')?.textContent ?? '').trim();
        if (!this.isRail() || !this.on(OPTIONS.railTips, true) || words === '') return;
        if (this.tip === null) {
            this.tip = this.doc.createElement('span');
            this.tip.className = 'kp-popover kp-tooltip kp-sidenav__tip';
            this.tip.setAttribute('popover', 'manual');
            this.tip.setAttribute('aria-hidden', 'true');
            this.panel.append(this.tip);
        }
        const box = this.tip;
        this.tipFor = item;
        if (this.tipGoing) {
            this.tipGoing = false;
            stopReversing(box);
        }
        box.textContent = words;
        const place = () => this.floatBeside(box, item, 'centre');
        if (box.matches(':popover-open')) place();
        else this.show(box, place);
    }

    /** @param {PointerEvent} event */
    onTipOver(event) {
        const item = event.target instanceof Element ? event.target.closest(this.tipItems()) : null;
        if (item === null || !this.panel.contains(item) || item === this.tipFor || (this.tip !== null && this.tip.contains(item))) return;
        if (item.closest('.kp-sidenav__flyout') !== null) return;
        clearTimeout(this.tipTimer);
        // Moving along the rail with a tip up changes it at once, as a toolbar's tips do.
        if (this.tip?.matches(':popover-open') && !this.tipGoing) this.showTip(item);
        else this.tipTimer = window.setTimeout(() => this.showTip(item), TIP_OPEN_MS);
    }

    /** @param {PointerEvent} event */
    onTipOut(event) {
        const to = event.relatedTarget instanceof Element ? event.relatedTarget.closest(this.tipItems()) : null;
        if (to !== null && this.panel.contains(to) && to.closest('.kp-sidenav__flyout') === null) return;
        this.hideTip();
    }

    /** @param {FocusEvent} event */
    onTipFocus(event) {
        const item = event.target instanceof Element ? event.target.closest(this.tipItems()) : null;
        if (item === null || item.closest('.kp-sidenav__flyout') !== null) return this.hideTip();
        this.showTip(item);
    }

    /** Take the tip away for good. */
    dropTip() {
        this.tip?.remove();
        this.tip = null;
    }

    /** @param {Element} category */
    submenuOf(category) {
        return /** @type {HTMLElement | null} */ (category.querySelector(':scope > .kp-sidenav__submenu'));
    }

    /** @param {Element} category */
    toggleOf(category) {
        return /** @type {HTMLElement | null} */ (category.querySelector(':scope > .kp-sidenav__category-toggle'));
    }
}
