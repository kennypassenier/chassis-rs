// SidenavControl: one side navigation, wired. The top of the class chain (see base.js): it runs the setup steps in their order,
// adds the listeners, hands out the handle, and undoes all of it on `destroy()`.
import { INSET_KNOBS, SIDENAV_LAUNCHER, SIDENAV_TAB, handles } from './constants.js';
import { OPTIONS } from './options.js';
import { SidenavResizer } from './resizer.js';
/** @typedef {import('./helpers.js').Sidenav} Sidenav */

/** The custom properties a push writes on the content element. */
const SHIFT_KNOBS = ['--kp-sidenav-shift-duration', '--kp-sidenav-shift-ease', '--kp-sidenav-shift-delay'];
/** The digits of a made-up panel id: base 36, six of them after the "0.". */
const ID_RADIX = 36;
const ID_FROM = 2;
const ID_TO = 8;

export class SidenavControl extends SidenavResizer {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The glyphs drawn into empty togglers, taken away on detach. @type {HTMLElement[]} */
        this.glyphs = [];
        /** What a page gets back for this panel (`sidenavOf`). @type {Sidenav} */
        this.handle = {
            element: host,
            open: (options) => this.open(options),
            close: (options) => this.close(options),
            toggle: ({ remember = true } = {}) => this.set(!this.isOpen(), true, remember),
            setMode: (mode) => this.setMode(mode),
            setSlim: (collapsed) => this.setSlim(collapsed),
            isOpen: () => this.isOpen(),
            destroy: () => this.destroy(),
        };
    }

    connect() {
        const { panel } = this;
        panel.dataset.kpSidenavAttached = '';
        if (!panel.id) panel.id = `kp-sidenav-${Math.random().toString(ID_RADIX).slice(ID_FROM, ID_TO)}`;
        // Registered first, so it runs after the listeners are gone.
        this.own(() => this.unwire());
        this.setupBasics();
        this.setupControls();
        this.setupNarrow();
        this.setupResizer();
        this.addGlyphs();
        this.setupStart();
        this.wire();
        handles.set(panel, this.handle);
    }

    /**
     * A launcher: the panel makes room for it, and an empty toggler in it gets the package's three bars, the glyph the bar's own
     * toggle draws. A page that wrote the mark itself keeps it; otherwise applyOpener() writes it while a launcher is shown.
     */
    addGlyphs() {
        for (const toggler of this.togglers()) {
            const box = toggler.closest(`${SIDENAV_LAUNCHER}, ${SIDENAV_TAB}`);
            if (box === null || toggler.children.length > 0 || (toggler.textContent ?? '').trim() !== '') continue;
            const glyph = this.doc.createElement('span');
            // The launcher's three bars; the edge tab's grip, which has no state to change.
            glyph.className = box.matches(SIDENAV_TAB) ? 'kp-sidenav__grip' : 'kp-sidenav__bars';
            glyph.setAttribute('aria-hidden', 'true');
            toggler.append(glyph);
            this.glyphs.push(glyph);
        }
    }

    /**
     * The starting state. A side panel is there unless told otherwise; the two that cover are away until asked, which is the
     * reference's `hidden` default written as a mode rather than as a flag.
     */
    setupStart() {
        const { panel } = this;
        let start = this.mode() === 'side';
        if (panel.hasAttribute(OPTIONS.open)) start = panel.getAttribute(OPTIONS.open) === 'true';
        if (this.read(OPTIONS.slimCollapsed) !== null) panel.setAttribute(OPTIONS.slimCollapsed, '');
        this.set(start, false, false, 'init');
        this.saySlim(panel.getAttribute(OPTIONS.slimCollapsed) !== null);
        this.applyNarrow();
        this.applySlimBelow();
        if (this.narrowWatch !== null && panel.parentElement !== null) this.narrowWatch.observe(panel.parentElement);
        for (const toggle of panel.querySelectorAll('.kp-sidenav__category-toggle')) {
            const category = toggle.closest('.kp-sidenav__category');
            toggle.setAttribute('aria-expanded', String(category?.hasAttribute('data-kp-sidenav-expanded') ?? false));
        }
        this.syncRail();
        const { chord } = this;
        if (chord !== null) for (const toggler of this.togglers()) toggler.setAttribute('aria-keyshortcuts', chord.aria);
    }

    /** The panel's and the page's listeners; `destroy()` removes them before anything else. */
    wire() {
        const { doc, panel } = this;
        /** @template {Event} E @param {(event: E) => void} handler @returns {EventListener} */
        const as = (handler) => /** @type {EventListener} */ (handler);
        this.listen(doc, 'click', (event) => this.onToggleClick(event));
        this.listen(doc, 'click', (event) => this.onSlimClick(event));
        this.listen(panel, 'click', (event) => this.onCategory(event));
        this.listen(doc, 'keydown', as((/** @type {KeyboardEvent} */ event) => this.onEsc(event)));
        this.listen(panel, 'keydown', as((/** @type {KeyboardEvent} */ event) => this.onTrap(event)));
        this.listen(panel, 'keydown', as((/** @type {KeyboardEvent} */ event) => this.onRailKey(event)));
        this.listen(panel, 'pointerenter', () => this.turnEase());
        this.listen(panel, 'pointerenter', () => this.onPeekEnter());
        this.listen(panel, 'pointerleave', () => this.onPeekLeave());
        this.listen(panel, 'focusin', () => this.onPeekFocusIn());
        this.listen(panel, 'focusout', as((/** @type {FocusEvent} */ event) => this.onPeekFocusOut(event)));
        this.listen(panel, 'pointerover', as((/** @type {PointerEvent} */ event) => this.onTipOver(event)));
        this.listen(panel, 'pointerout', as((/** @type {PointerEvent} */ event) => this.onTipOut(event)));
        this.listen(panel, 'focusin', as((/** @type {FocusEvent} */ event) => this.onTipFocus(event)));
        this.listen(panel, 'focusout', () => this.hideTip());
        this.listen(panel, 'pointerover', as((/** @type {PointerEvent} */ event) => this.onFlyOver(event)));
        this.listen(panel, 'pointerout', as((/** @type {PointerEvent} */ event) => this.onFlyOut(event)));
        this.listen(panel, 'focusout', as((/** @type {FocusEvent} */ event) => this.onFlyFocusOut(event)));
        if (this.chord !== null) this.listen(doc, 'keydown', as((/** @type {KeyboardEvent} */ event) => this.onShortcut(event)));
    }

    /**
     * The rail's keys: Right (or Left on the end edge) floats a group out and goes into it, Escape or the way back folds it and
     * returns to its heading, and Escape takes a label tip away.
     * @param {KeyboardEvent} event
     */
    onRailKey(event) {
        if (event.key === 'Escape' && this.tip?.matches(':popover-open')) this.hideTip();
        if (!this.flying() || !(event.target instanceof Element)) return;
        const out = this.edge() === 'end' ? 'ArrowLeft' : 'ArrowRight';
        const back = this.edge() === 'end' ? 'ArrowRight' : 'ArrowLeft';
        const toggle = event.target.closest('.kp-sidenav__category-toggle');
        if (toggle !== null && event.key === out) {
            const category = toggle.closest('.kp-sidenav__category');
            if (category) {
                event.preventDefault();
                this.flyOut(category, { focusFirst: true });
            }
            return;
        }
        const inside = event.target.closest(`.kp-sidenav__category[${OPTIONS.flown}]`);
        if (inside !== null && event.target.closest('.kp-sidenav__flyout') !== null && (event.key === 'Escape' || event.key === back)) {
            event.preventDefault();
            event.stopPropagation();
            this.flyIn(inside, { refocus: true });
        }
    }

    /** Undo what `connect()` did, beyond the listeners, in the order the old detach did it. */
    unwire() {
        this.undoGrip();
        this.undoNarrow();
        this.undoMotion();
        this.undoPlacement();
        this.undoMarks();
        this.undoNames();
    }

    /** Stop the timers and the peek, and fold the floating groups back into the panel as they were. */
    undoMotion() {
        const { panel } = this;
        this.stopTimers();
        panel.removeAttribute(OPTIONS.peek);
        this.undoHeld();
        const wasSlim = this.releaseSlimHeld() ?? panel.hasAttribute(OPTIONS.slimCollapsed);
        panel.removeAttribute(OPTIONS.slimCollapsed);
        this.syncRail();
        panel.toggleAttribute(OPTIONS.slimCollapsed, wasSlim);
        this.dropTip();
        panel.inert = false;
    }

    /** Give the edge tabs, the backdrop, the strip and the content their own place back. */
    undoPlacement() {
        for (const tab of this.tabs()) {
            tab.removeAttribute('data-kp-sidenav-shift');
            tab.removeAttribute('data-kp-sidenav-tab-edge');
            tab.style.marginInlineStart = tab.style.marginInlineEnd = '';
        }
        for (const toggler of this.togglers()) toggler.removeAttribute('aria-keyshortcuts');
        this.panel.style.removeProperty('--kp-sidenav-ease-back');
        this.dropBackdrop();
        this.offsetContent(false);
        this.dropStrip();
        const target = this.contentEl();
        if (!target) return;
        target.removeAttribute('data-kp-sidenav-shift');
        target.removeAttribute(OPTIONS.inset);
        for (const name of [...INSET_KNOBS, ...SHIFT_KNOBS]) target.style.removeProperty(name);
        target.style.marginInlineStart = '';
    }

    /** Put the launchers out and take the glyphs, the launch mark and the opener marks away. */
    undoMarks() {
        this.lightTurn += 1;
        for (const box of this.launchers()) box.removeAttribute(OPTIONS.lit);
        for (const glyph of this.glyphs) glyph.remove();
        if (!this.launchedByMarkup) this.panel.removeAttribute(OPTIONS.launched);
        for (const box of [...this.launchers(), ...this.tabs()]) {
            box.removeAttribute(OPTIONS.openerOff);
            box.removeAttribute(OPTIONS.openerOn);
        }
    }

    /** Free the page's scroll, drop the open state and the togglers' names, and forget the panel. */
    undoNames() {
        const { panel, ownedBy } = this;
        if (this.on(OPTIONS.lockScroll, false)) this.doc.documentElement.style.overflow = '';
        panel.removeAttribute(OPTIONS.open);
        for (const toggler of this.togglers()) {
            toggler.removeAttribute('aria-expanded');
            toggler.removeAttribute('aria-label');
        }
        if (this.read(OPTIONS.slim) !== null) {
            for (const toggler of this.slimTogglers()) {
                if (ownedBy !== '' && toggler.matches(ownedBy)) continue;
                toggler.removeAttribute('aria-expanded');
                toggler.removeAttribute('aria-label');
            }
        }
        delete panel.dataset.kpSidenavAttached;
        handles.delete(panel);
    }
}
