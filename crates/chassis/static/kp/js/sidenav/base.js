// The base of one side navigation's controller: the panel's readers, its remembered state and its geometry.
//
// The side navigation used to be one closure split into install functions that shared a context object. It is now a chain of
// classes (base -> shift -> open -> slim -> tip -> flyout -> controls -> narrow -> resizer -> controller), each adding one concern,
// with the state of one panel on the instance. The constructors only store fields; the `setupX()` steps that touch the page run in
// `SidenavControl.connect()`, in the order the install functions ran.
import { Controller } from '../controller.js';
import { paintRemembered } from '../remember.js';
import { reversedEase } from '../motion.js';
import { OPTIONS } from './options.js';
import { PEEK_KNOBS, SIDENAV_TAB } from './constants.js';
/** @typedef {import('../remember.js').Memory} Memory */
/** @typedef {import('../strings/types.js').Strings} Strings */
/**
 * What `attachSidenavs` hands each panel.
 * @typedef {object} SidenavSettings
 * @property {Partial<Strings> | undefined} strings
 * @property {string} ownedBy
 * @property {Storage | null | undefined} store
 */

export class SidenavBase extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        const settings = /** @type {SidenavSettings} */ (/** @type {unknown} */ (options));
        /** The panel this controller drives. */
        this.panel = host;
        this.doc = host.ownerDocument;
        /** The page's own words for the togglers' names. */
        this.strings = settings.strings;
        /** The mark of togglers a consumer wires themselves [AR29]. */
        this.ownedBy = settings.ownedBy;
        /** Where the panel remembers its state; `undefined` is the page's storage. */
        this.store = settings.store;
        /** What this panel remembers; painted in `setupBasics`. @type {Memory | null} */
        this.memory = null;
        /** Whether the markup marked the panel launched itself, so the detach leaves the mark. */
        this.launchedByMarkup = false;
        /** The strip a shut panel leaves in view, while there is one. @type {HTMLElement | null} */
        this.strip = null;
    }

    /** Paint the remembered state, note the markup's launch mark and turn the ease around once. */
    setupBasics() {
        // What this panel remembers, and where: the name comes off the element, never from here [Kenny, 2026-09-16]. The paint
        // happens before anything below reads the markup, so the starting state is read from the memory the same way it is read
        // from the markup.
        this.memory = paintRemembered(this.panel, 'sidenav', { storage: this.store });
        this.launchedByMarkup = this.panel.hasAttribute(OPTIONS.launched);
        this.turnEase();
    }

    /** @param {string} attribute */
    read(attribute) {
        return this.panel.getAttribute(attribute);
    }

    /** A boolean option: absent is the fallback, anything but `false` is on. @param {string} attribute @param {boolean} fallback */
    on(attribute, fallback) {
        const value = this.read(attribute);
        return value === null ? fallback : value !== 'false';
    }

    /** The panel's mode: `side` unless the markup says otherwise. */
    mode() {
        return this.read(OPTIONS.mode) ?? 'side';
    }

    isOpen() {
        const open = this.panel.getAttribute(OPTIONS.open);
        return open !== 'false' && (this.mode() === 'side' || open === 'true');
    }

    /** Whether the panel lies over the content. */
    covering() {
        return this.mode() === 'over';
    }

    /**
     * A rail that collapses, a panel that slides away and a group that folds play their opening backwards: the theme's curve
     * turned around, which CSS cannot work out, so it is written here as `--kp-sidenav-ease-back` (css/components.css) before each
     * change and before a hover that may expand the rail. Without this module they run on the opening's own curve.
     */
    turnEase() {
        const style = getComputedStyle(this.panel);
        const ease = style.getPropertyValue('--kp-sidenav-ease').trim() || style.getPropertyValue('--fx-ease').trim() || 'ease';
        this.panel.style.setProperty('--kp-sidenav-ease-back', reversedEase(ease));
    }

    /** This panel's togglers: the ones pointed at it, and the ones pointed at no panel. @returns {Element[]} */
    togglers() {
        return [...this.doc.querySelectorAll('[data-kp-sidenav-toggle]')].filter(
            (t) => (t.getAttribute('aria-controls') ?? '') === this.panel.id || t.getAttribute('aria-controls') === null,
        );
    }

    /** The element a push or side mode makes room in. */
    contentEl() {
        const selector = this.read(OPTIONS.content);
        return selector === null ? null : /** @type {HTMLElement | null} */ (this.doc.querySelector(selector));
    }

    /**
     * Whether the content keeps the panel's room open or shut: the gutter. Not while `data-kp-sidenav-over-below` has made the
     * panel an `over` panel on a narrow screen, where a gutter would take the page's room.
     */
    reserved() {
        return this.on(OPTIONS.reserve, false) && this.mode() !== 'side' && !this.panel.hasAttribute(OPTIONS.narrow);
    }

    /** The edge the panel comes out of: `start` (the default) or `end`. @returns {'end' | 'start'} */
    edge() {
        return this.read(OPTIONS.side) === 'end' ? 'end' : 'start';
    }

    /** The style property that moves something clear of the panel, on the panel's side. @returns {'marginInlineEnd' | 'marginInlineStart'} */
    marginAlong() {
        return this.edge() === 'end' ? 'marginInlineEnd' : 'marginInlineStart';
    }

    /** @returns {'paddingInlineEnd' | 'paddingInlineStart'} */
    paddingAlong() {
        return this.edge() === 'end' ? 'paddingInlineEnd' : 'paddingInlineStart';
    }

    /**
     * The panel's own painted size across its axis, not the token's default. The knob is usually set on the panel, where the
     * content element cannot see it: a panel asked for 11rem moved its content by 15rem, and the gap showed. Across the width it is
     * the size the panel is going to (`--kp-sidenav-w`, resolved), so a rail that collapses or a reserved gutter follows at once,
     * not the frame the width transition stands at.
     */
    panelSize() {
        const style = getComputedStyle(this.panel);
        const knob = style.getPropertyValue('--kp-sidenav-w').trim();
        const width = knob !== '' ? knob : style.inlineSize;
        // A variant that takes room beside the panel (the floating gap on both sides of it) says so as `--kp-sidenav-room`; the
        // content clears that too.
        const room = style.getPropertyValue('--kp-sidenav-room').trim();
        return room !== '' ? `calc(${width} + ${room})` : width;
    }

    /**
     * Where the panel's far edge stands: its width and what lies between the window's edge and the panel (`--kp-sidenav-lead`, the
     * floating gap). The edge tab rides there.
     */
    edgeSize() {
        const style = getComputedStyle(this.panel);
        const lead = style.getPropertyValue('--kp-sidenav-lead').trim();
        const width = style.getPropertyValue('--kp-sidenav-w').trim() || style.inlineSize;
        return lead !== '' ? `calc(${width} + ${lead})` : width;
    }

    /** The edge tabs that hold one of this panel's togglers. */
    tabs() {
        /** @type {Set<HTMLElement>} */
        const boxes = new Set();
        for (const toggler of this.togglers()) {
            const box = toggler.closest(SIDENAV_TAB);
            if (box instanceof HTMLElement) boxes.add(box);
        }
        return [...boxes];
    }

    /** The strip a shut panel leaves in view (`--kp-sidenav-peek`, a length), or empty when the page sets none. */
    peekSize() {
        const length = getComputedStyle(this.panel).getPropertyValue('--kp-sidenav-peek').trim();
        return length === '' || parseFloat(length) === 0 ? '' : length;
    }

    /**
     * Make, keep or drop the strip: it exists while the panel slides (not `side`) and the page sets `--kp-sidenav-peek`. It is the
     * panel's next sibling, under the panel, marked with the edge and the look so the stylesheet can place it; the panel's knobs it
     * follows are carried over. A floating panel hides it while open.
     *
     * @param {boolean} open
     */
    syncPeek(open) {
        if (this.mode() === 'side' || this.peekSize() === '') {
            this.dropStrip();
            return;
        }
        if (this.strip === null) {
            this.strip = this.doc.createElement('div');
            this.strip.className = 'kp-sidenav__peek';
            this.strip.setAttribute('aria-hidden', 'true');
            this.panel.after(this.strip);
        }
        const strip = this.strip;
        strip.setAttribute('data-kp-sidenav-peek-edge', this.edge());
        const variant = this.read(OPTIONS.variant);
        if (variant !== null) strip.setAttribute('data-kp-sidenav-peek-variant', variant);
        else strip.removeAttribute('data-kp-sidenav-peek-variant');
        strip.style.position = this.read(OPTIONS.position) === 'absolute' ? 'absolute' : '';
        for (const name of PEEK_KNOBS) {
            const value = getComputedStyle(this.panel).getPropertyValue(name).trim();
            if (value !== '') strip.style.setProperty(name, value);
            else strip.style.removeProperty(name);
        }
        strip.toggleAttribute('data-kp-sidenav-peek-hushed', open && variant === 'floating');
    }

    /** Take the peek strip away, if there is one. */
    dropStrip() {
        this.strip?.remove();
        this.strip = null;
    }
}
