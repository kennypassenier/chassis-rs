// The controller that keeps the document's registers in step with its theme: holds a change until its register has loaded.

import { applyTheme, BEFORE_THEME_EVENT, currentTheme, onThemeChange, PENDING_THEME_ATTRIBUTE } from '../theme-core.js';
import { Controller, attachOne, controllerOf } from '../controller.js';
import { REGISTER_PATTERN } from './values.js';
import { registerHref, registerLink, registerLoaded, stateOf } from './links.js';
import { ensureRegister } from './ensure.js';

/** @param {unknown} error */
const report = (error) => console.error(error instanceof Error ? error.message : error);

/** Follows the theme of one root: fetches the register of every theme worn, and holds a change back until its register is there. */
export class LazyRegisters extends Controller {
    /**
     * @param {HTMLElement} host the element that wears the theme (default: theme-core's root)
     * @param {{ pattern?: string, hold?: boolean, prune?: boolean }} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        const { pattern = REGISTER_PATTERN, hold = true, prune = false } = options;
        this.hold = hold;
        this.prune = prune;
        this.doc = host.ownerDocument;
        this.loadOptions = { pattern, doc: this.doc };
    }

    connect() {
        // The listener sits on the host (default: the document element) and acts
        // on the element that wears the theme, which is the event's target: a
        // root set with configureTheme() below it bubbles its events up here.
        this.listen(this.host, BEFORE_THEME_EVENT, (e) => this.onBefore(e));
        this.own(onThemeChange((theme, { previous }) => this.onChange(theme, previous), { root: this.host }));
        this.own(() => this.dropHeld());
        // The theme worn now: normally the snippet's link is already there and
        // this adopts it; without the snippet it is fetched here, late.
        ensureRegister(currentTheme({ root: this.host }), this.loadOptions).catch(report);
    }

    /**
     * Before a change: when the new register is not here yet, refuse the
     * change, mark it held, fetch, then ask again. The second ask finds the
     * register loaded and goes through, so the root never wears a theme
     * ahead of its register. A choice made in the meantime removes the
     * mark (applyTheme does), and the stale load then applies nothing.
     * @param {Event} e
     */
    onBefore(e) {
        // Refused by someone else already: nothing to hold.
        if (!this.hold || e.defaultPrevented) return;
        const { theme } = /** @type {CustomEvent<{ theme: string }>} */ (e).detail;
        if (registerLoaded(theme, this.loadOptions)) return;
        const element = /** @type {Element} */ (e.target);
        e.preventDefault();
        element.setAttribute(PENDING_THEME_ATTRIBUTE, theme);
        ensureRegister(theme, this.loadOptions).then(
            () => this.land(element, theme),
            (error) => this.giveUp(element, theme, error),
        );
    }

    /** The register has arrived: the held change goes through unless a later choice superseded it. @param {Element} element @param {string} theme */
    land(element, theme) {
        if (this.destroyed || element.getAttribute(PENDING_THEME_ATTRIBUTE) !== theme) return;
        applyTheme(theme, { root: element });
    }

    /** The register failed: the held change is dropped and the error reported. @param {Element} element @param {string} theme @param {unknown} error */
    giveUp(element, theme, error) {
        if (element.getAttribute(PENDING_THEME_ATTRIBUTE) === theme) element.removeAttribute(PENDING_THEME_ATTRIBUTE);
        report(error);
    }

    /** A theme was worn: fetch its register, and prune the previous one when asked to. @param {string} theme @param {string | null | undefined} previous */
    onChange(theme, previous) {
        ensureRegister(theme, this.loadOptions).catch(report);
        if (!this.prune || !previous || previous === theme) return;
        const link = registerLink(previous, this.loadOptions);
        if (!link) return;
        link.remove();
        const href = registerHref(previous, this.loadOptions);
        stateOf(this.doc).loads.delete(href);
        stateOf(this.doc).loaded.delete(href);
    }

    /** A held change is dropped rather than left to land after detach. */
    dropHeld() {
        for (const el of [this.host, ...this.host.querySelectorAll(`[${PENDING_THEME_ATTRIBUTE}]`)]) el.removeAttribute(PENDING_THEME_ATTRIBUTE);
    }
}

/**
 * Keep the document's registers in step with its theme (the body of attachLazyRegisters()).
 * @param {{ pattern?: string, hold?: boolean, prune?: boolean, root?: Element }} options
 * @returns {() => void} detach
 */
export function followRegisters({ pattern, hold, prune, root }) {
    const host = /** @type {HTMLElement} */ (root ?? document.documentElement);
    // A root that is followed already is not followed twice; the second call's detach leaves the first alone.
    const made = controllerOf(host, LazyRegisters) ? undefined : attachOne(host, LazyRegisters, { pattern, hold, prune });
    return () => made?.destroy();
}
