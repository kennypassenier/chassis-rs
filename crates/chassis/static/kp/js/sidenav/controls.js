// The shortcut, the group toggles, the togglers' clicks and Escape.
import { sidenavGroups } from '../remember.js';
import { parseChord, typing } from './helpers.js';
import { OPTIONS } from './options.js';
import { SidenavFlyout } from './flyout.js';
/** @typedef {ReturnType<typeof parseChord>} Chord */

export class SidenavControls extends SidenavFlyout {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The key chord that opens and closes the panel, read in `setupControls`. @type {Chord | null} */
        this.chord = null;
    }

    /** Read the shortcut the panel names. */
    setupControls() {
        const mac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '') || /Mac/.test(globalThis.navigator?.userAgent ?? '');
        const chordText = this.read(OPTIONS.shortcut);
        this.chord = chordText !== null && chordText.trim() !== '' ? parseChord(chordText, mac) : null;
    }

    /** @param {KeyboardEvent} event */
    onShortcut(event) {
        const { chord } = this;
        if (chord === null || event.defaultPrevented || event.repeat || typing(event.target)) return;
        if (event.key.toLowerCase() !== chord.key) return;
        if (event.ctrlKey !== chord.ctrl || event.metaKey !== chord.meta || event.altKey !== chord.alt || event.shiftKey !== chord.shift) return;
        event.preventDefault();
        this.set(!this.isOpen(), true, true, 'shortcut');
    }

    /** Remember which groups stand open. */
    saveGroups() {
        if (this.memory === null) return;
        /** @type {Record<string, boolean>} */
        const state = {};
        for (const { group, id } of sidenavGroups(this.panel)) state[id] = group.hasAttribute(OPTIONS.expanded);
        this.memory.write('groups', state);
    }

    /**
     * A press on a group's heading. The accordion option is the reference's: with it on, opening one closes the others.
     * @param {Event} event
     */
    onCategory(event) {
        const toggle = /** @type {HTMLElement | null} */ (event.target instanceof Element ? event.target.closest('.kp-sidenav__category-toggle') : null);
        if (!toggle || !this.panel.contains(toggle)) return;
        const category = toggle.closest('.kp-sidenav__category');
        if (!category) return;
        // In the collapsed rail a press floats the group out (and back); from the keyboard the focus goes into it.
        if (this.flying()) {
            if (category.hasAttribute(OPTIONS.flown)) this.flyIn(category);
            else this.flyOut(category, { focusFirst: /** @type {MouseEvent} */ (event).detail === 0 });
            return;
        }
        const expanded = category.hasAttribute(OPTIONS.expanded);
        this.turnEase();
        if (!expanded && this.on(OPTIONS.accordion, false)) {
            for (const other of this.panel.querySelectorAll('.kp-sidenav__category[data-kp-sidenav-expanded]')) {
                other.removeAttribute(OPTIONS.expanded);
                other.querySelector('.kp-sidenav__category-toggle')?.setAttribute('aria-expanded', 'false');
            }
        }
        category.toggleAttribute(OPTIONS.expanded, !expanded);
        toggle.setAttribute('aria-expanded', String(!expanded));
        this.saveGroups();
    }

    /**
     * The toggler a click landed on, when it is this panel's and not one a consumer wires.
     * @param {Event} event
     * @param {string} selector
     */
    ownToggler(event, selector) {
        const toggler = /** @type {Element | null} */ (event.target instanceof Element ? event.target.closest(selector) : null);
        if (!toggler) return null;
        if (this.ownedBy !== '' && toggler.matches(this.ownedBy)) return null;
        const controls = toggler.getAttribute('aria-controls');
        return controls !== null && controls !== this.panel.id ? null : toggler;
    }

    /** @param {Event} event */
    onToggleClick(event) {
        if (this.ownToggler(event, '[data-kp-sidenav-toggle]') === null) return;
        this.set(!this.isOpen(), true, true, 'toggler');
    }

    /** @param {Event} event */
    onSlimClick(event) {
        if (this.ownToggler(event, `[${OPTIONS.slimToggle}]`) === null) return;
        this.setSlim(undefined, true, 'toggler');
    }

    /** @param {KeyboardEvent} event */
    onEsc(event) {
        if (event.key !== 'Escape' || !this.on(OPTIONS.closeOnEsc, true) || this.mode() === 'side' || !this.isOpen()) return;
        this.set(false, true, true, 'escape');
    }
}
