// One share bar: drawn from a spec (its own `data-kp-stackbar` JSON, or setStackbar), with the listeners that light, pick and move between parts.

import { attachHoverCards } from '../hovercard.js';
import { STACKBAR_PICK_EVENT, STACKBAR_RETRY_EVENT } from './values.js';
import { StackbarParts } from './parts.js';

/** @typedef {import('../stackbar.js').StackbarSpec} StackbarSpec */

export class Stackbar extends StackbarParts {
    connect() {
        const el = this.host;
        this.listen(el, 'pointerover', (event) => this.light(this.keyOf(event.target)));
        this.listen(el, 'pointerleave', () =>
            this.light(/** @type {HTMLElement | null} */ (el.querySelector('.kp-stackbar__seg:focus'))?.dataset.kpStackbarKey),
        );
        this.listen(el, 'focusin', (event) => this.light(this.keyOf(event.target)));
        this.listen(el, 'focusout', () => this.light(undefined));
        this.listen(el, 'click', (event) => this.onClick(event));
        this.listen(el, 'keydown', (event) => this.onKeydown(/** @type {KeyboardEvent} */ (event)));
        this.drawJson();
    }

    /** A bar that carries its spec as JSON in `data-kp-stackbar` draws it; a page that draws with setStackbar() has none. */
    drawJson() {
        const json = this.host.getAttribute('data-kp-stackbar') ?? '';
        if (!json.trim().startsWith('{')) return;
        try {
            this.set(JSON.parse(json));
        } catch (error) {
            console.error(error);
        }
    }

    /**
     * Draw (or redraw) the bar. Calling it again with new numbers keeps the focus on the part it was on, by key.
     * @param {StackbarSpec} spec
     */
    set(spec) {
        const el = this.host;
        const c = this.context(spec);
        this.markRoot(c.state);
        this.head(c);
        if (!c.noted) c.nodes.push(c.bar);
        this.measure();
        let refocus = false;
        if (c.state === 'loading') this.drawLoading(c);
        else if (c.state === 'empty' || c.state === 'error' || c.calc.parts.length === 0) refocus = this.drawNote(c);
        else this.drawParts(c);
        el.replaceChildren(...c.nodes);
        if (refocus) {
            el.tabIndex = -1;
            el.focus({ preventScroll: true });
        }
        if (c.focusedKey) /** @type {HTMLElement | null} */ (el.querySelector(`.kp-stackbar__seg[tabindex="0"]`))?.focus();
        if (c.state !== 'loading') attachHoverCards(this.doc);
    }

    /** The key of the part or legend row a target is in. @param {EventTarget | null} target */
    keyOf(target) {
        return target instanceof Element
            ? /** @type {HTMLElement | null} */ (target.closest('[data-kp-stackbar-key]'))?.dataset.kpStackbarKey
            : undefined;
    }

    /** Light the part and its legend row of a key, and nothing else. @param {string | undefined} key */
    light(key) {
        for (const node of this.host.querySelectorAll('[data-kp-stackbar-lit]')) node.removeAttribute('data-kp-stackbar-lit');
        if (key === undefined) return;
        for (const node of this.host.querySelectorAll('[data-kp-stackbar-key]'))
            if (/** @type {HTMLElement} */ (node).dataset.kpStackbarKey === key) node.setAttribute('data-kp-stackbar-lit', '');
    }

    /** A press on Retry, or on a part or its legend row. @param {Event} event */
    onClick(event) {
        if (event.target instanceof Element && event.target.closest('[data-kp-stackbar-retry]')) {
            this.host.dispatchEvent(new CustomEvent(STACKBAR_RETRY_EVENT, { bubbles: true }));
            return;
        }
        const key = this.keyOf(event.target);
        if (key === undefined) return;
        this.host.dispatchEvent(new CustomEvent(STACKBAR_PICK_EVENT, { bubbles: true, detail: { key, part: event.target } }));
    }

    /** The arrow keys, Home and End move between the parts; Enter and Space press one. @param {KeyboardEvent} event */
    onKeydown(event) {
        const seg = event.target instanceof HTMLElement && event.target.matches('.kp-stackbar__seg') ? event.target : null;
        if (!seg) return;
        const segs = /** @type {HTMLElement[]} */ ([...this.host.querySelectorAll('.kp-stackbar__seg')]);
        const at = segs.indexOf(seg);
        const rtl = getComputedStyle(seg).direction === 'rtl';
        /** @type {Record<string, number>} */
        const moves = { ArrowRight: rtl ? -1 : 1, ArrowDown: 1, ArrowLeft: rtl ? 1 : -1, ArrowUp: -1 };
        let next = -1;
        if (event.key in moves) next = Math.min(segs.length - 1, Math.max(0, at + moves[event.key]));
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = segs.length - 1;
        else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            seg.click();
            return;
        }
        if (next < 0) return;
        event.preventDefault();
        for (const one of segs) one.setAttribute('tabindex', '-1');
        segs[next].setAttribute('tabindex', '0');
        segs[next].focus();
    }
}
