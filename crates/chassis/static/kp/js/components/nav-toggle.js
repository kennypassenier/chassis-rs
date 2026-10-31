// The navigation toggle that opens and closes the nav on small screens.
import { Controller, attachOne } from '../controller.js';
import { getStrings } from '../strings.js';

/** Fired on the nav when its toggle opens or closes it: `{ open }`. */
export const NAV_TOGGLE_EVENT = 'kp-nav-toggle';
/** The mark the React NavBar puts on a toggle it wires itself [AR29]. */
export const NAV_OWNED = '[data-kp-nav-owner]';
/** How long (ms) a close plays when the theme names no close time. */
const DEFAULT_CLOSE_MS = 300;
const MS_PER_SECOND = 1000;
/**
 * Wire the toggle a narrow navigation collapses into [scope-10, stage 1.3].
 *
 * Opt-in by the button being there: a nav without one keeps the behaviour
 * it had, which is what makes this additive for every page already built.
 * The CSS decides when the bar is narrow enough to collapse; this decides
 * nothing about width at all, so the two cannot disagree.
 *
 * Every state it sets has a way out [KT6]: the toggle itself, Escape while
 * the focus is inside the nav, a click outside it, and the `kp-nav-toggle`
 * event for a consumer who wants to persist or veto nothing but observe.
 * `detach` removes what attach stamped.
 *
 * @param {ParentNode} root
 * @param {{ strings?: Partial<import('../strings.js').Strings>, ownedBy?: string }} [options]
 * @returns {() => void} detach
 */
export function attachNavToggles(root = document, { strings, ownedBy = NAV_OWNED } = {}) {
    // AR29, and it is the fault that shipped once already: two channels wiring the same button re-armed each other's state
    // forever. The React NavBar marks its own, and a consumer who wants this module over a React nav anyway passes `ownedBy: ''`.
    // A toggle marked attached is wired already; one with no nav around it has nothing to open.
    const made = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('[data-kp-nav-toggle]')])
        .filter((button) => !(ownedBy !== '' && button.matches(ownedBy)) && !('kpNavToggleAttached' in button.dataset))
        .filter((button) => (button.closest('.kp-nav') ?? button.parentElement) !== null)
        .map((button, index) => attachOne(button, NavToggleControl, { strings, index }));
    return () => {
        for (const control of made.splice(0)) control?.destroy();
    };
}

/** One nav toggle: whether its nav is closing, while the close plays. */
class NavToggleControl extends Controller {
    /** @param {HTMLElement} host @param {{ strings?: Partial<import('../strings.js').Strings>, index?: number }} [options] */
    constructor(host, options = {}) {
        super(host, options);
        /** The nav the toggle opens and closes. */
        this.nav = /** @type {HTMLElement} */ (host.closest('.kp-nav') ?? host.parentElement);
        this.links = this.nav.querySelector('.kp-nav__links');
        this.strings = options.strings;
        /** The toggle's place among those its attach call wired, for a generated id. */
        this.index = options.index ?? 0;
        /** Whether a close is playing; an open during it cancels it. */
        this.closing = false;
    }

    connect() {
        const { host: button, nav, links } = this;
        button.dataset.kpNavToggleAttached = '';
        // Registered first, so it runs last: what attach stamped goes after the listeners.
        this.own(() => {
            nav.removeAttribute('data-kp-nav-open');
            for (const name of ['aria-expanded', 'aria-label', 'aria-controls']) button.removeAttribute(name);
            delete button.dataset.kpNavToggleAttached;
        });
        // aria-controls needs an id, and a page that did not give one still deserves the association rather than silence.
        if (links && !links.id) links.id = `kp-nav-links-${this.index}-${Math.random().toString(36).slice(2, 8)}`;
        if (links) button.setAttribute('aria-controls', links.id);
        // Attaching is not a toggle. This wrote the starting state THROUGH the dispatch, so every consumer listening heard a close
        // that nobody performed, on every page load — found by the first test ever to listen.
        this.write(nav.hasAttribute('data-kp-nav-open'));
        this.listen(button, 'click', () => this.set(!nav.hasAttribute('data-kp-nav-open') && !this.closing));
        this.listen(nav, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(document, 'click', (event) => this.onOutside(event), true);
    }

    /** The toggle's name for the nav's state: Close menu while open, Menu while closed. */
    label() {
        const s = { ...getStrings(), ...this.strings };
        return this.nav.hasAttribute('data-kp-nav-open') ? s.closeMenu : s.menu;
    }

    /** @param {boolean} open */
    write(open) {
        this.nav.toggleAttribute('data-kp-nav-open', open);
        this.host.setAttribute('aria-expanded', String(open));
        this.host.setAttribute('aria-label', this.label());
    }

    /** @param {boolean} open */
    set(open) {
        if (open) this.open();
        else this.close();
    }

    open() {
        const { nav, links } = this;
        this.closing = false;
        nav.removeAttribute('data-kp-nav-closing');
        this.write(true);
        // The panel's own height, for a theme that grows it: a ceiling taller than the list hides the first and last part of the
        // growth, and the close is not the open reversed.
        if (links) nav.style.setProperty('--kp-nav-links-height', `${links.scrollHeight}px`);
        nav.dispatchEvent(new CustomEvent(NAV_TOGGLE_EVENT, { bubbles: true, detail: { open: true } }));
    }

    /** Close after the theme's close time (`--kp-nav-close-time`, else `--kp-sig-fo-time`), marked closing meanwhile. */
    close() {
        const { nav, host: button } = this;
        if (this.closing || !nav.hasAttribute('data-kp-nav-open')) return;
        this.closing = true;
        nav.setAttribute('data-kp-nav-closing', '');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-label', this.label());
        const navStyle = getComputedStyle(nav);
        const durVal = (navStyle.getPropertyValue('--kp-nav-close-time') || navStyle.getPropertyValue('--kp-sig-fo-time')).trim();
        const dur = durVal ? (durVal.endsWith('ms') ? parseFloat(durVal) : parseFloat(durVal) * MS_PER_SECOND) : DEFAULT_CLOSE_MS;
        setTimeout(() => this.closed(), Number.isFinite(dur) ? dur : DEFAULT_CLOSE_MS);
    }

    /** The close has played: the nav is closed, unless an open came in between. */
    closed() {
        if (!this.closing || this.destroyed) return;
        this.closing = false;
        this.nav.removeAttribute('data-kp-nav-closing');
        this.write(false);
        this.nav.dispatchEvent(new CustomEvent(NAV_TOGGLE_EVENT, { bubbles: true, detail: { open: false } }));
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        if (event.key !== 'Escape' || !this.nav.hasAttribute('data-kp-nav-open')) return;
        this.set(false);
        this.host.focus();
    }

    /** @param {Event} event */
    onOutside(event) {
        if (!this.nav.hasAttribute('data-kp-nav-open')) return;
        if (this.nav.contains(/** @type {Node} */ (event.target))) return;
        this.set(false);
    }
}
