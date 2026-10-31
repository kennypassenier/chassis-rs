// Narrow screens: when the panel becomes an `over` panel, when the rail collapses on its own, and the controls that follow.
//
// Narrow [scope-80]. A rail beside the content is right on a wide screen and a column of its own on a phone, so a panel that says
// `data-kp-sidenav-over-below` — with a length, or the package's 40rem — becomes the `over` panel while the box it lives in is that
// wide or narrower: away until its toggle opens it, with the focus trap, Escape, the backdrop and the focus return that mode already
// has, and its words back even when the rail was collapsed to icons. Above the width it is what the markup declared again, slim
// state included. The box is the panel's parent, as the bar measures its own wrapper [TH104]; an over panel is fixed, so it does
// not change the width it is measured by.
//
// The controls follow the state, through `hidden`, which the package lets win over every display rule [KT13]: this panel's
// `data-kp-sidenav-toggle` buttons — the one in the bar and the close inside the panel, which is the way out while the panel covers
// the bar — are shown only while narrow, and its slim toggles only while wide. Markup that starts them `hidden` stays right without
// the module. `data-kp-sidenav-narrow` on the panel says which it is.
//
// The rail's step [Kenny, 2026-10-13, from the libraries survey]: the page names the width at and below which the rail collapses
// to its icons; wider again it is what the reader left it, and a collapse the step made is never remembered as the reader's.
import { OPTIONS } from './options.js';
import { NARROW_STEP, SIDENAV_LAUNCHER } from './constants.js';
import { SidenavControls } from './controls.js';
/** @typedef {{ mode: string | null, slim: boolean }} Declared */

export class SidenavNarrow extends SidenavControls {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The width the panel becomes an `over` panel at, as written; read in `setupNarrow`. @type {string | null} */
        this.overBelow = null;
        /** The width the rail collapses at, as written; read in `setupNarrow`. @type {string | null} */
        this.slimBelow = null;
        /** What the markup declared, kept while the panel is narrow. @type {Declared | null} */
        this.declared = null;
        /** The controls hidden or shown here, and whether each was hidden before. @type {Map<HTMLElement, boolean>} */
        this.hiddenAtAttach = new Map();
        /** The reader's own rail state while the step holds it collapsed. @type {boolean | null} */
        this.slimHeld = null;
        /** The watch on the panel's box, when a step is asked for. @type {ResizeObserver | null} */
        this.narrowWatch = null;
    }

    /** Read the two steps and make the watch; it starts observing with the starting state (`SidenavControl.setupStart`). */
    setupNarrow() {
        this.overBelow = this.read(OPTIONS.overBelow);
        this.slimBelow = this.read(OPTIONS.slimBelow);
        const wanted = (this.overBelow !== null || this.slimBelow !== null) && this.panel.parentElement !== null;
        this.narrowWatch =
            wanted && typeof ResizeObserver === 'function'
                ? new ResizeObserver(() => {
                      this.applyNarrow();
                      this.applySlimBelow();
                  })
                : null;
    }

    /** @param {Element} control @param {boolean} hide */
    hideControl(control, hide) {
        if (!(control instanceof HTMLElement) || (this.ownedBy !== '' && control.matches(this.ownedBy))) return;
        if (!this.hiddenAtAttach.has(control)) this.hiddenAtAttach.set(control, control.hasAttribute('hidden'));
        control.toggleAttribute('hidden', hide);
    }

    /** A length the page wrote, in pixels; empty is the package's 40rem step. @param {string | null} [written] */
    threshold(written = this.overBelow) {
        const length = (written ?? '').trim() || NARROW_STEP;
        const size = parseFloat(length);
        if (length.endsWith('rem')) return size * parseFloat(getComputedStyle(this.doc.documentElement).fontSize);
        if (length.endsWith('em')) return size * parseFloat(getComputedStyle(this.panel.parentElement ?? this.panel).fontSize);
        return size;
    }

    /** Change the mode without the slide: a resize is not an opening. @param {() => void} change */
    still(change) {
        const before = this.panel.style.transition;
        this.panel.style.transition = 'none';
        change();
        void this.panel.offsetWidth;
        this.panel.style.transition = before;
    }

    applyNarrow() {
        const box = this.panel.parentElement;
        if (this.overBelow === null || box === null) return;
        const narrow = box.clientWidth <= this.threshold();
        // A launcher is the page's fixed way in at every width: never hidden.
        for (const control of this.togglers()) if (control.closest(SIDENAV_LAUNCHER) === null) this.hideControl(control, !narrow);
        if (this.read(OPTIONS.slim) !== null) for (const control of this.slimTogglers()) this.hideControl(control, narrow);
        if (narrow === (this.declared !== null)) return;
        this.still(() => (narrow ? this.becomeNarrow() : this.becomeWide()));
    }

    /** Keep what the markup declared and become a shut `over` panel. */
    becomeNarrow() {
        const { panel } = this;
        this.declared = { mode: this.read(OPTIONS.mode), slim: panel.hasAttribute(OPTIONS.slimCollapsed) };
        panel.setAttribute(OPTIONS.narrow, '');
        panel.removeAttribute(OPTIONS.slimCollapsed);
        panel.setAttribute(OPTIONS.mode, 'over');
        this.set(false, false, false, 'breakpoint');
    }

    /** Become what the markup declared again. */
    becomeWide() {
        const was = /** @type {Declared} */ (this.declared);
        this.declared = null;
        this.putDeclared(was);
        this.saySlim(was.slim);
        this.set(this.mode() === 'side', false, false, 'breakpoint');
    }

    /** Write the declared mode and rail state back and drop the narrow mark. @param {Declared} was */
    putDeclared(was) {
        const { panel } = this;
        panel.removeAttribute(OPTIONS.narrow);
        if (was.mode === null) panel.removeAttribute(OPTIONS.mode);
        else panel.setAttribute(OPTIONS.mode, was.mode);
        panel.toggleAttribute(OPTIONS.slimCollapsed, was.slim);
    }

    applySlimBelow() {
        const box = this.panel.parentElement;
        if (this.slimBelow === null || box === null || this.read(OPTIONS.slim) === null || this.declared !== null) return;
        const narrow = box.clientWidth <= this.threshold(this.slimBelow);
        if (narrow === (this.slimHeld !== null)) return;
        if (narrow) {
            this.slimHeld = this.panel.hasAttribute(OPTIONS.slimCollapsed);
            if (!this.slimHeld) this.setSlim(true, false, 'breakpoint');
        } else {
            const was = this.slimHeld;
            this.slimHeld = null;
            if (!was) this.setSlim(false, false, 'breakpoint');
        }
    }

    /** The reader's own rail state the step held, if it held one; the step lets go of it. */
    releaseSlimHeld() {
        const held = this.slimHeld;
        this.slimHeld = null;
        return held;
    }

    /** Stop watching, give back the declared state and the controls' own `hidden`. */
    undoNarrow() {
        this.narrowWatch?.disconnect();
        if (this.declared !== null) {
            this.putDeclared(this.declared);
            this.declared = null;
        }
        for (const [control, hidden] of this.hiddenAtAttach) control.toggleAttribute('hidden', hidden);
    }
}
