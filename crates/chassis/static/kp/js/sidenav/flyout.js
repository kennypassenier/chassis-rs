// The groups that float out of a collapsed rail, with their timers, and the peek: the rail widened from its edge.
import { FOCUSABLE } from './helpers.js';
import { OPTIONS } from './options.js';
import { FLYOUT_CLOSE_MS, FLYOUT_OPEN_MS, HOVER_DELAY_MS } from './constants.js';
import { SidenavTip } from './tip.js';

/** A group of the panel. */
const CATEGORY = '.kp-sidenav__category';

export class SidenavFlyout extends SidenavTip {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The pointer's rest or grace per group. @type {Map<Element, number>} */
        this.flyTimers = new Map();
        /** The pointer's rest before a peek widens the rail. */
        this.peekTimer = 0;
        /** Whether the pointer is over the panel. */
        this.pointerIn = false;
        /** Counts the peek changes, so a late narrowing does not undo a later widening. */
        this.peekTurn = 0;
    }

    /** @param {Element} category @param {{ focusFirst?: boolean }} [options] */
    flyOut(category, { focusFirst = false } = {}) {
        const submenu = this.submenuOf(category);
        if (submenu === null || !this.floated.has(submenu)) return;
        for (const other of this.panel.querySelectorAll(`${CATEGORY}[${OPTIONS.flown}]`)) if (other !== category) this.flyIn(other);
        this.hideTip();
        category.setAttribute(OPTIONS.flown, '');
        this.toggleOf(category)?.setAttribute('aria-expanded', 'true');
        const toggle = this.toggleOf(category) ?? category;
        this.show(submenu, () => {
            this.floatBeside(submenu, toggle, 'start');
            if (focusFirst) /** @type {HTMLElement | null} */ (submenu.querySelector(FOCUSABLE))?.focus({ preventScroll: true });
        });
    }

    /** @param {Element} category @param {{ refocus?: boolean }} [options] */
    flyIn(category, { refocus = false } = {}) {
        const submenu = this.submenuOf(category);
        category.removeAttribute(OPTIONS.flown);
        this.toggleOf(category)?.setAttribute('aria-expanded', String(category.hasAttribute(OPTIONS.expanded) && !this.flying()));
        // js/motion.js plays the theme's popover close as its opening backwards.
        if (submenu?.matches(':popover-open')) submenu.hidePopover();
        // The focus comes back to the group's heading when the close is over, not when it starts (docs/THEME_LESSONS.md 45).
        if (!refocus) return;
        const toggle = this.toggleOf(category);
        requestAnimationFrame(() => {
            const motions = category.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}));
            void Promise.all(motions).then(() => {
                if (!category.hasAttribute(OPTIONS.flown) && toggle?.isConnected) toggle.focus({ preventScroll: true });
            });
        });
    }

    /** Make the groups float out in the collapsed rail, and fold in place again outside it. */
    syncRail() {
        if (!this.isRail()) this.hideTip();
        const fly = this.flying();
        for (const category of this.panel.querySelectorAll(CATEGORY)) {
            const submenu = this.submenuOf(category);
            if (submenu === null) continue;
            if (fly && !this.floated.has(submenu)) this.floatGroup(category, submenu);
            else if (!fly && this.floated.has(submenu)) this.foldGroup(category, submenu);
        }
    }

    /** @param {Element} category @param {HTMLElement} submenu */
    floatGroup(category, submenu) {
        this.floated.set(submenu, { added: !submenu.hasAttribute('popover') });
        submenu.setAttribute('popover', 'manual');
        submenu.classList.add('kp-popover', 'kp-sidenav__flyout');
        this.toggleOf(category)?.setAttribute('aria-expanded', 'false');
    }

    /** @param {Element} category @param {HTMLElement} submenu */
    foldGroup(category, submenu) {
        this.flyIn(category);
        const { added } = /** @type {{ added: boolean }} */ (this.floated.get(submenu));
        this.floated.delete(submenu);
        submenu.classList.remove('kp-popover', 'kp-sidenav__flyout');
        if (added) submenu.removeAttribute('popover');
        this.toggleOf(category)?.setAttribute('aria-expanded', String(category.hasAttribute(OPTIONS.expanded)));
    }

    /** @param {PointerEvent} event */
    onFlyOver(event) {
        if (!this.flying() || event.pointerType === 'touch') return;
        const category = event.target instanceof Element ? event.target.closest(CATEGORY) : null;
        if (category === null || !this.panel.contains(category)) return;
        clearTimeout(this.flyTimers.get(category));
        if (category.hasAttribute(OPTIONS.flown)) return;
        this.flyTimers.set(
            category,
            window.setTimeout(() => this.flyOut(category), FLYOUT_OPEN_MS),
        );
    }

    /** @param {PointerEvent} event */
    onFlyOut(event) {
        const category = event.target instanceof Element ? event.target.closest(CATEGORY) : null;
        if (category === null || !this.panel.contains(category)) return;
        if (event.relatedTarget instanceof Node && category.contains(event.relatedTarget)) return;
        clearTimeout(this.flyTimers.get(category));
        if (!category.hasAttribute(OPTIONS.flown)) return;
        this.flyTimers.set(
            category,
            window.setTimeout(() => {
                if (!category.matches(':hover') && !category.contains(this.doc.activeElement)) this.flyIn(category);
            }, FLYOUT_CLOSE_MS),
        );
    }

    /** @param {FocusEvent} event */
    onFlyFocusOut(event) {
        const category = event.target instanceof Element ? event.target.closest(`${CATEGORY}[${OPTIONS.flown}]`) : null;
        if (category === null) return;
        if (event.relatedTarget instanceof Node && category.contains(event.relatedTarget)) return;
        if (!category.matches(':hover')) this.flyIn(category);
    }

    // Peek: a rail told to expand on hover waits for the pointer to rest, and expands while the focus is inside it.

    /**
     * Widen (`open`) or narrow the rail. Narrowing, the rail is `leaving` until its width transition is over, then the attribute
     * goes: the words stay while the width closes, as they came at once when it opened.
     * @param {boolean} value
     */
    setPeek(value) {
        const { panel } = this;
        clearTimeout(this.peekTimer);
        const now = panel.getAttribute(OPTIONS.peek);
        if (value ? now === 'open' : now !== 'open') return;
        this.turnEase();
        this.peekTurn += 1;
        const turn = this.peekTurn;
        if (value) {
            panel.setAttribute(OPTIONS.peek, 'open');
            this.syncRail();
            return;
        }
        panel.setAttribute(OPTIONS.peek, 'leaving');
        requestAnimationFrame(() => {
            const motions = panel.getAnimations().map((a) => a.finished.catch(() => {}));
            void Promise.all(motions).then(() => {
                if (turn !== this.peekTurn) return;
                panel.removeAttribute(OPTIONS.peek);
                this.syncRail();
            });
        });
    }

    /** Whether the rail widens on hover and focus: asked for, and collapsed. */
    peeks() {
        return this.read(OPTIONS.expandOnHover) !== null && this.read(OPTIONS.expandOnHover) !== 'false' && this.panel.hasAttribute(OPTIONS.slimCollapsed);
    }

    onPeekEnter() {
        this.pointerIn = true;
        if (!this.peeks()) return;
        const delay = Number(this.read(OPTIONS.hoverDelay) ?? HOVER_DELAY_MS);
        clearTimeout(this.peekTimer);
        this.peekTimer = window.setTimeout(() => this.setPeek(true), Number.isFinite(delay) ? delay : HOVER_DELAY_MS);
    }

    onPeekLeave() {
        this.pointerIn = false;
        clearTimeout(this.peekTimer);
        if (!this.panel.contains(this.doc.activeElement)) this.setPeek(false);
    }

    onPeekFocusIn() {
        if (this.peeks()) this.setPeek(true);
    }

    /** @param {FocusEvent} event */
    onPeekFocusOut(event) {
        if (event.relatedTarget instanceof Node && this.panel.contains(event.relatedTarget)) return;
        if (!this.pointerIn) this.setPeek(false);
    }

    /** Stop the peek's, the tip's and the groups' timers. */
    stopTimers() {
        clearTimeout(this.peekTimer);
        clearTimeout(this.tipTimer);
        for (const timer of this.flyTimers.values()) clearTimeout(timer);
    }
}
