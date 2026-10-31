// A drawn map wired: lighting, pinning, the one tab stop, the keys and the collapse to a list. One UsesWire per draw; the next
// draw destroys it first.

import { Controller } from '../controller.js';
import { USES_PIN_EVENT } from './constants.js';
import { keyTarget } from './keys.js';
import { UsesLines } from './lines.js';
import { storePin } from './memory.js';

/** @typedef {import('./model.js').UsesModel} UsesModel */

export class UsesWire extends Controller {
    /**
     * @param {UsesModel} m the model of the draw
     * @param {HTMLElement} root the drawn `.kp-uses`
     * @param {Element} svg
     * @param {HTMLElement} list the phone's list
     */
    constructor(m, root, svg, list) {
        super(m.el);
        this.m = m;
        this.root = root;
        this.list = list;
        this.memory = m.memory;
        this.drawn = new UsesLines(m, root, svg);
    }

    cards() {
        return /** @type {HTMLElement[]} */ ([...this.root.querySelectorAll('.kp-uses__card')]);
    }

    /** @param {string} key */
    nodeEl(key) {
        return /** @type {HTMLElement | null} */ (this.root.querySelector(`.kp-uses__node[data-key="${CSS.escape(key)}"]`));
    }

    connect() {
        const { root, m } = this;
        const view = /** @type {Window} */ (m.doc.defaultView);
        this.drawn.build();
        this.own(() => this.drawn.dispose());
        this.listenAll();
        // The tab stop: the remembered one, else the first node.
        const stop = (this.memory.stop && this.nodeEl(this.memory.stop)?.querySelector('.kp-uses__card')) || this.cards()[0];
        if (stop instanceof HTMLElement) stop.tabIndex = 0;
        this.applyCollapse();
        this.drawn.place();
        this.lightWhat();
        const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
            this.applyCollapse();
            this.drawn.place();
        }) : null;
        if (watcher) {
            this.observe(watcher);
            watcher.observe(m.el);
            watcher.observe(root);
        }
        void m.doc.fonts?.ready.then(() => this.drawn.place());
        const raf = view.requestAnimationFrame(() => this.drawn.place());
        this.own(() => view.cancelAnimationFrame(raf));
    }

    listenAll() {
        const { root } = this;
        this.listen(root, 'pointerover', (event) => this.onOver(event));
        this.listen(root, 'pointerout', (event) => this.onOut(event));
        this.listen(root, 'focusin', (event) => this.onFocusIn(/** @type {FocusEvent} */ (event)));
        this.listen(root, 'focusout', (event) => this.onOut(event));
        this.listen(root, 'click', (event) => this.onClick(event));
        this.listen(root, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
    }

    collapsed() {
        const { el } = this.m;
        return el.clientWidth > 0 && el.clientWidth < this.m.collapseBelow;
    }

    applyCollapse() {
        const small = this.collapsed();
        this.m.el.toggleAttribute('data-kp-collapsed', small);
        this.root.hidden = small;
        this.list.hidden = !small;
    }

    lightWhat() {
        const mode = this.m.lightMode;
        const pick = mode === 'pick' || mode === 'both' ? this.memory.pin : null;
        const hover = mode === 'hover' || mode === 'both' ? this.memory.lit : null;
        this.drawn.light(hover ?? pick);
    }

    /** @param {string | null} key */
    pin(key) {
        const { m, memory } = this;
        const node = key ? m.byKey.get(key) : null;
        memory.pin = key;
        for (const card of this.cards()) card.setAttribute('aria-pressed', String(card.closest('.kp-uses__node')?.getAttribute('data-key') === key));
        storePin(m.el, key);
        this.lightWhat();
        const kind = this.nodeEl(key ?? '')?.getAttribute('data-side') ?? null;
        m.el.dispatchEvent(
            new CustomEvent(USES_PIN_EVENT, {
                bubbles: true,
                detail: { key, side: kind, pinned: key !== null, related: key ? (m.uses.get(key) ?? m.usedBy.get(key) ?? []) : [], node },
            }),
        );
    }

    /** The one tab stop. @param {HTMLElement} card */
    stopAt(card) {
        for (const other of this.cards()) other.tabIndex = -1;
        card.tabIndex = 0;
        this.memory.stop = card.closest('.kp-uses__node')?.getAttribute('data-key') ?? null;
    }

    /** @param {Event} event */
    hoverTarget(event) {
        const node = event.target instanceof Element ? event.target.closest('.kp-uses__node') : null;
        return node && this.root.contains(node) ? node.getAttribute('data-key') : null;
    }

    /** @param {Event} event */
    onOver(event) {
        if (this.m.lightMode === 'off' || this.m.lightMode === 'pick') return;
        this.memory.lit = this.hoverTarget(event);
        this.lightWhat();
    }

    /** @param {Event} event */
    onOut(event) {
        if (this.m.lightMode === 'off' || this.m.lightMode === 'pick') return;
        const to = event instanceof MouseEvent || event instanceof FocusEvent ? event.relatedTarget : null;
        if (to instanceof Element && this.root.contains(to) && to.closest('.kp-uses__node')) return;
        this.memory.lit = null;
        this.lightWhat();
    }

    /** @param {FocusEvent} event */
    onFocusIn(event) {
        const card = event.target instanceof Element ? event.target.closest('.kp-uses__card') : null;
        if (card instanceof HTMLElement) this.stopAt(card);
        this.onOver(event);
    }

    /** @param {Event} event */
    onClick(event) {
        if (this.m.lightMode === 'off' || this.m.lightMode === 'hover') return;
        const card = event.target instanceof Element ? event.target.closest('.kp-uses__card') : null;
        if (!(card instanceof HTMLElement)) return;
        const key = card.closest('.kp-uses__node')?.getAttribute('data-key') ?? null;
        this.stopAt(card);
        this.pin(this.memory.pin === key ? null : key);
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const card = event.target instanceof Element ? event.target.closest('.kp-uses__card') : null;
        if (!(card instanceof HTMLElement)) return;
        const node = card.closest('.kp-uses__node');
        if (event.key === 'Escape' && this.memory.pin) {
            event.preventDefault();
            this.pin(null);
            return;
        }
        if (event.key === 'Enter') {
            const link = /** @type {HTMLAnchorElement | null} */ (node?.querySelector('.kp-uses__open') ?? null);
            if (link) {
                event.preventDefault();
                link.click();
            }
            return;
        }
        const target = keyTarget(this.m, this.root, card, node?.getAttribute('data-key') ?? '', node?.getAttribute('data-side') ?? 'source', event.key);
        if (target === null) event.preventDefault();
        if (!target) return;
        event.preventDefault();
        this.stopAt(target);
        target.focus();
    }
}
