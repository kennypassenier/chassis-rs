// The cap on a band: the worst problems show, the rest fold behind one toggle (`data-kp-attention-max`).

import { getStrings } from '../strings.js';
import { Controller } from '../controller.js';

/** The attribute that caps the band; a number of problems, none (or 0) meaning no cap. */
const MAX_ATTRIBUTE = 'data-kp-attention-max';
/** Set on a problem that is folded away behind the toggle. */
const FOLDED_ATTRIBUTE = 'data-kp-folded';
/** Set on the band while the folded problems are shown. */
const EXPANDED_ATTRIBUTE = 'data-kp-attention-expanded';
/** What the band's own observer watches: the cap, the problems arriving and leaving, and their severity. */
const WATCHED = { childList: true, subtree: true, attributes: true, attributeFilter: [MAX_ATTRIBUTE, 'data-kp-severity', 'data-kp-leaving'] };

/** A band's cap: the worst problems are shown, the others folded, and a button unfolds them (worst first, as the band keeps them). */
export class AttentionMax extends Controller {
    /** @param {HTMLElement} host the band */
    constructor(host) {
        super(host);
        /** The unfold button, made the first time a cap is needed. @type {HTMLButtonElement | null} */
        this.toggle = null;
        /** Whether the folded problems are shown. */
        this.expanded = false;
    }

    connect() {
        const band = this.host;
        this.observe(new MutationObserver(() => this.apply())).observe(band, WATCHED);
        this.listen(band, 'click', (event) => {
            if (this.toggle && event.target instanceof Element && event.target.closest('.kp-attention__more') === this.toggle) this.flip();
        });
        this.own(() => this.release());
        this.apply();
    }

    /** The cap, or 0 when there is none. */
    get max() {
        const value = Number.parseInt(this.host.getAttribute(MAX_ATTRIBUTE) ?? '', 10);
        return Number.isFinite(value) && value > 0 ? value : 0;
    }

    /** The problems on the band, in the order it keeps them, those on their way out left aside. @returns {HTMLElement[]} */
    problems() {
        return /** @type {HTMLElement[]} */ ([...this.host.children]).filter(
            (el) => el.classList.contains('kp-attention__item') && !el.hasAttribute('data-kp-leaving'),
        );
    }

    /** Fold what is over the cap (unless unfolded), keep the toggle last and say how many are folded. */
    apply() {
        const items = this.problems();
        const max = this.max;
        const over = max > 0 ? Math.max(0, items.length - max) : 0;
        if (over === 0 && this.expanded) this.setExpanded(false);
        for (const [at, el] of items.entries()) {
            const folded = max > 0 && at >= max && !this.expanded;
            if (el.hasAttribute(FOLDED_ATTRIBUTE) !== folded) el.toggleAttribute(FOLDED_ATTRIBUTE, folded);
        }
        if (over === 0) {
            if (this.toggle) this.toggle.hidden = true;
            return;
        }
        const toggle = this.ensureToggle();
        toggle.hidden = false;
        const words = this.expanded ? getStrings().attentionFewer : getStrings().attentionMore(over);
        if (toggle.textContent !== words) toggle.textContent = words;
        toggle.setAttribute('aria-expanded', String(this.expanded));
        // The band keeps its problems worst first by appending them, which would put them after the toggle.
        if (this.host.lastElementChild !== toggle) this.host.append(toggle);
    }

    /** The unfold button, made once and given what it needs to be named and found. @returns {HTMLButtonElement} */
    ensureToggle() {
        if (this.toggle) return this.toggle;
        const band = this.host;
        if (band.id === '') band.id = `kp-attention-${Math.random().toString(36).slice(2, 8)}`;
        const toggle = band.ownerDocument.createElement('button');
        toggle.type = 'button';
        toggle.className = 'kp-button kp-button--sm kp-attention__more';
        toggle.setAttribute('aria-controls', band.id);
        this.toggle = toggle;
        return toggle;
    }

    /** One press: unfold or fold, and tell the page how many problems are shown now. */
    flip() {
        this.setExpanded(!this.expanded);
        this.apply();
        const total = this.problems().length;
        const shown = this.expanded ? total : Math.min(total, this.max);
        this.host.dispatchEvent(new CustomEvent('kp-attention-toggle', { bubbles: true, detail: { expanded: this.expanded, shown, total } }));
    }

    /** @param {boolean} on */
    setExpanded(on) {
        this.expanded = on;
        this.host.toggleAttribute(EXPANDED_ATTRIBUTE, on);
    }

    /** Unfold everything and take the toggle away. */
    release() {
        for (const el of this.host.querySelectorAll(`:scope > [${FOLDED_ATTRIBUTE}]`)) el.removeAttribute(FOLDED_ATTRIBUTE);
        this.host.removeAttribute(EXPANDED_ATTRIBUTE);
        this.toggle?.remove();
        this.toggle = null;
    }
}
