// Opening, closing and refusing: the one place the open state changes, with the backdrop and the focus trap of an open panel.
import { playEntranceBackwards, stopReversing } from '../motion.js';
import { motionAllowed } from '../calm.js';
import { FOCUSABLE } from './helpers.js';
import { OPTIONS } from './options.js';
import {
    ASKABLE,
    REFUSE_FALLBACK_MS,
    REFUSE_MIN_MS,
    REFUSE_STILL_MS,
    REFUSE_TRAVEL,
    SIDENAV_MODE_EVENT,
    SIDENAV_PREVENTED_EVENT,
    SIDENAV_SLIM_EVENT,
    SIDENAV_TOGGLE_EVENT,
} from './constants.js';
import { SidenavShift } from './shift.js';

/** Milliseconds in a second: computed durations are read in seconds. */
const MS_PER_S = 1000;

export class SidenavOpen extends SidenavShift {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The backdrop of an open covering panel. @type {HTMLElement | null} */
        this.backdrop = null;
        /** Where the focus goes back to when the panel closes. @type {Element | null} */
        this.restoreFocusTo = null;
        /** Counts the refusals, so an older refusal's timer does not clear a newer one's mark. */
        this.refusing = 0;
    }

    dropBackdrop() {
        if (!this.backdrop) return;
        const target = this.backdrop;
        this.backdrop = null;
        void playEntranceBackwards(target).then(() => {
            target.remove();
            stopReversing(target);
        });
    }

    raiseBackdrop() {
        if (this.backdrop || !this.covering() || !this.on(OPTIONS.backdrop, true)) return;
        const backdrop = this.doc.createElement('div');
        backdrop.className = `kp-sidenav__backdrop ${this.read(OPTIONS.backdropClass) ?? ''}`.trim();
        // The backdrop belongs to the same box the panel does. A panel scoped to a container with an absolute position had a fixed
        // backdrop over the whole window, which dimmed a page that was never asked about.
        if (this.read(OPTIONS.position) === 'absolute') backdrop.style.position = 'absolute';
        // The backdrop is removed with its listener when it is dropped.
        backdrop.addEventListener('click', () => this.onBackdropClick());
        this.backdrop = backdrop;
        this.panel.after(backdrop);
    }

    /**
     * A click on the backdrop. `static` shows the backdrop and refuses the click with the theme's cue; `close-on-backdrop="false"`
     * ignores it like `close-on-esc="false"` ignores Escape; otherwise it closes.
     */
    onBackdropClick() {
        if (this.read(OPTIONS.backdrop) === 'static') return this.refuse();
        if (!this.on(OPTIONS.closeOnBackdrop, true)) return;
        this.set(false, true, true, 'backdrop');
    }

    /** Keep Tab inside an open covering panel. @param {KeyboardEvent} event */
    onTrap(event) {
        if (event.key !== 'Tab' || !this.covering() || !this.isOpen() || !this.on(OPTIONS.focusTrap, true)) return;
        const stops = [.../** @type {NodeListOf<HTMLElement>} */ (this.panel.querySelectorAll(FOCUSABLE))].filter((el) => el.offsetParent !== null);
        if (stops.length === 0) return;
        const first = stops[0];
        const last = stops[stops.length - 1];
        const active = this.doc.activeElement;
        if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        } else if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
        }
    }

    /**
     * Announce that a change was asked for and refused: by a listener that called `preventDefault()` on the cancelable event, or by
     * a static backdrop. The state has not moved.
     *
     * @param {'toggle' | 'slim'} kind
     * @param {Record<string, unknown>} detail the state that was asked for
     * @param {string} reason
     * @param {'listener' | 'static'} source
     */
    prevented(kind, detail, reason, source) {
        this.panel.dispatchEvent(new CustomEvent(SIDENAV_PREVENTED_EVENT, { bubbles: true, detail: { kind, ...detail, reason, source } }));
    }

    /**
     * With `data-kp-sidenav-cancelable`, the event goes out BEFORE the change and may be refused; otherwise it goes out after, as it
     * always did, and the caller sends it. What a layout does on its own (`breakpoint`, `mode`, `init`) is told, never asked.
     *
     * @param {string} name
     * @param {Record<string, unknown>} detail
     * @param {string} reason
     * @returns {'prevented' | 'asked' | 'told'}
     */
    ask(name, detail, reason) {
        if (!ASKABLE.has(reason) || !this.on(OPTIONS.cancelable, false)) return 'told';
        const event = new CustomEvent(name, { bubbles: true, cancelable: true, detail: { ...detail, reason } });
        this.panel.dispatchEvent(event);
        if (!event.defaultPrevented) return 'asked';
        this.prevented(name === SIDENAV_SLIM_EVENT ? 'slim' : 'toggle', detail, reason, 'listener');
        return 'prevented';
    }

    /**
     * A click on a static backdrop: nothing closes. The panel is pulled toward its edge and let go (the same pull back, so the
     * return is the exact reverse), on the theme's own duration and curve, marked `data-kp-sidenav-refused` while it lasts
     * (css/components.css draws a ring on it), and the refusal is announced.
     *
     * Knobs, custom properties on the panel or above it: `--kp-sidenav-refuse-travel` (REFUSE_TRAVEL), `--kp-sidenav-refuse-duration`
     * and `--kp-sidenav-refuse-ease` (else the panel's own `--kp-sidenav-duration` and `--kp-sidenav-ease`, else the theme's
     * `--fx-duration` and `--fx-ease`); a leg is never shorter than REFUSE_MIN_MS.
     *
     * It is a Web Animation on the panel's margin: the registers own the panel's `translate` and `animation` for its opening and
     * closing, and a CSS animation would lose to them.
     */
    refuse() {
        const marked = [this.panel, ...(this.backdrop ? [this.backdrop] : [])];
        this.refusing += 1;
        const turn = this.refusing;
        for (const one of marked) one.setAttribute(OPTIONS.refused, '');
        const duration = motionAllowed() ? this.pullBack() : REFUSE_STILL_MS;
        setTimeout(() => {
            if (turn === this.refusing) for (const one of marked) one.removeAttribute(OPTIONS.refused);
        }, duration);
        this.prevented('toggle', { open: false }, 'backdrop', 'static');
    }

    /** Play the refused cue: pulled and let go. @returns {number} how long both legs take, in milliseconds */
    pullBack() {
        const style = getComputedStyle(this.panel);
        const token = (/** @type {string[]} */ names) => names.map((name) => style.getPropertyValue(name).trim()).find((value) => value !== '') ?? '';
        const time = token(['--kp-sidenav-refuse-duration', '--kp-sidenav-duration', '--fx-duration']) || `${REFUSE_FALLBACK_MS}ms`;
        const easing = token(['--kp-sidenav-refuse-ease', '--kp-sidenav-ease', '--fx-ease']) || 'ease';
        const travel = style.getPropertyValue('--kp-sidenav-refuse-travel').trim() || REFUSE_TRAVEL;
        const property = this.edge() === 'end' ? 'marginInlineEnd' : 'marginInlineStart';
        const probe = this.doc.createElement('span');
        probe.style.cssText = `position:absolute;visibility:hidden;transition-duration:${time}`;
        this.panel.append(probe);
        const read = parseFloat(getComputedStyle(probe).transitionDuration) * MS_PER_S;
        probe.remove();
        // A leg shorter than a few frames is not a cue (terminal's 34 ms): the floor keeps it seen.
        const leg = Math.max(REFUSE_MIN_MS, Number.isFinite(read) && read > 0 ? read : REFUSE_FALLBACK_MS);
        this.panel.animate({ [property]: ['0px', `calc(-1 * ${travel})`] }, { duration: leg, easing, iterations: 2, direction: 'alternate' });
        return leg * 2;
    }

    /**
     * @param {boolean} open
     * @param {boolean} [moveFocus]
     * @param {boolean} [save] whether this is a state to remember — a person's choice is, an adaptation to the room the panel is in
     *   is not. A window narrowed past the step closes the panel; widening it again must not find it closed because of that
     *   [Kenny, 2026-09-16].
     * @param {string} [reason] what asked for the change, written in `detail.reason`: `toggler`, `escape`, `backdrop`, `shortcut`,
     *   `api` (a call on the handle), `breakpoint` (a layout adapting), `mode` (a mode change) or `init` (the starting state)
     */
    set(open, moveFocus = true, save = true, reason = 'api') {
        const asked = this.ask(SIDENAV_TOGGLE_EVENT, { open }, reason);
        if (asked === 'prevented') return;
        const { panel } = this;
        this.turnEase();
        panel.setAttribute(OPTIONS.open, String(open));
        this.say(open);
        const offset = this.offsetContent(open);
        this.light(open, !moveFocus && !save);
        if (open) this.raiseBackdrop();
        else this.dropBackdrop();
        if (this.on(OPTIONS.lockScroll, false)) this.doc.documentElement.style.overflow = open && this.covering() ? 'hidden' : '';
        if (moveFocus) this.moveFocus(open);
        if (save) this.memory?.write('open', open);
        if (asked === 'told') panel.dispatchEvent(new CustomEvent(SIDENAV_TOGGLE_EVENT, { bubbles: true, detail: { open, reason } }));
        panel.dispatchEvent(new CustomEvent(SIDENAV_MODE_EVENT, { bubbles: true, detail: { mode: this.mode(), offset, reason } }));
    }

    /** Where the focus goes when a person opens or closes the panel. @param {boolean} open */
    moveFocus(open) {
        const { panel, doc } = this;
        // A panel that closes with the focus inside it (Escape in a push panel, the shortcut) gives it back to its opener, or to the
        // launcher, rather than to nothing once it is inert.
        if (!open && !this.covering() && panel.contains(doc.activeElement)) {
            this.restoreFocusTo =
                this.restoreFocusTo ?? this.togglers().find((t) => t instanceof HTMLElement && !panel.contains(t) && t.offsetParent !== null) ?? null;
        }
        const named = this.read(OPTIONS.initialFocus);
        if (!(this.covering() || (named !== null && open) || (!open && this.restoreFocusTo !== null))) return;
        if (open) {
            this.restoreFocusTo = doc.activeElement;
            this.focusInto(named);
        } else if (this.restoreFocusTo instanceof HTMLElement) {
            const back = this.restoreFocusTo;
            this.restoreFocusTo = null;
            this.focusBackLater(back);
        }
    }

    /** Where the page asked for the focus to land, or the first stop in the panel. @param {string | null} named */
    focusInto(named) {
        let first = /** @type {HTMLElement | null} */ (null);
        try {
            first = named !== null ? /** @type {HTMLElement | null} */ (this.panel.querySelector(named)) : null;
        } catch {
            // A selector the page wrote that does not parse names nothing: the first stop takes the focus.
            first = null;
        }
        (first ?? /** @type {HTMLElement | null} */ (this.panel.querySelector(FOCUSABLE)))?.focus({ preventScroll: true });
    }

    /**
     * Give the focus back once the panel is gone, the way the focus left when it came: a ring that comes back on the opener at the
     * start of the close is not the opening played backwards (docs/THEME_LESSONS.md 11). The close's motions start in the next
     * frame, so they are read there. Without scrolling: a panel that is fixed inside a scrolled box (a review dialog's stage, a
     * dashboard's main) is carried off with that scroll, so the content seemed to vanish the moment the close began.
     * @param {HTMLElement} back
     */
    focusBackLater(back) {
        const { panel } = this;
        requestAnimationFrame(() => {
            const motions = panel.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}));
            void Promise.all(motions).then(() => {
                if (panel.getAttribute(OPTIONS.open) !== 'true' && back.isConnected) back.focus({ preventScroll: true });
            });
        });
    }

    /** @param {{ remember?: boolean }} [options] */
    close({ remember = true } = {}) {
        this.set(false, true, remember);
    }

    /** @param {{ remember?: boolean }} [options] */
    open({ remember = true } = {}) {
        this.set(true, true, remember);
    }
}
