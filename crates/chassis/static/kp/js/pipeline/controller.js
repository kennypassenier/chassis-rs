// One wired board: its frame and first paint, the clicks and keys, and the setters a page calls for the data, the state and the open card.

import { PipelineView } from './view.js';
import { PIPELINE_MORE_EVENT, PIPELINE_OPEN_EVENT } from './values.js';

export class PipelineBoard extends PipelineView {
    connect() {
        const el = this.host;
        el.classList.add('kp-pipeline');
        this.build();
        this.paint();
        window.requestAnimationFrame(() => this.markDrawn());
        this.listen(el, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(el, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.own(() => this.busy?.remove());
    }

    /** The first frame has passed: a loading card may arrive with motion from here on. */
    markDrawn() {
        this.drawn = true;
    }

    /** The lanes and the cards, kept by id; a board that was loading is ready from here on. @param {import('../pipeline.js').PipelineLane[] | undefined} lanes @param {import('../pipeline.js').PipelineCard[]} cards */
    setData(lanes, cards) {
        if (lanes) this.lanes = lanes;
        this.cards = cards;
        this.settle();
        this.paint();
    }

    /** @param {import('../pipeline.js').PipelineState} state @param {string} words */
    setState(state, words) {
        this.state = state;
        this.words = words;
        this.paint();
    }

    /** Mark the card that is open (`aria-current`), or none. @param {string | null} id */
    setSelected(id) {
        this.selected = id;
        for (const [key, node] of this.nodes) {
            if (key === id) node.setAttribute('aria-current', 'true');
            else node.removeAttribute('aria-current');
        }
    }

    /** A lane shows more or fewer cards. @param {HTMLElement} more the toggle that was pressed */
    toggleMore(more) {
        const key = more.dataset.kpPipelineMore ?? '';
        const open = !this.open.has(key);
        if (open) this.open.add(key);
        else this.open.delete(key);
        this.active = key;
        this.paint();
        /** @type {HTMLElement | null} */ (this.host.querySelector(`[data-kp-pipeline-more="${CSS.escape(key)}"]`))?.focus();
        this.host.dispatchEvent(new CustomEvent(PIPELINE_MORE_EVENT, { bubbles: true, detail: { lane: key, open } }));
    }

    /** @param {MouseEvent} event */
    onClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const more = /** @type {HTMLElement | null} */ (target.closest('[data-kp-pipeline-more]'));
        if (more) {
            this.toggleMore(more);
            return;
        }
        const node = /** @type {HTMLElement | null} */ (target.closest('.kp-pipeline__card[data-kp-id]'));
        if (!node) return;
        const card = this.cards.find((k) => k.id === node.dataset.kpId);
        if (!card) return;
        this.active = card.id;
        this.syncTabStops();
        this.host.dispatchEvent(
            new CustomEvent(PIPELINE_OPEN_EVENT, { bubbles: true, detail: { id: card.id, card, source: event.detail === 0 ? 'keyboard' : 'pointer' } }),
        );
    }

    /** Where an arrow, Home or End goes from a card: along the lane, or to the neighbouring lane. @param {KeyboardEvent} event @param {HTMLElement[][]} lanes @param {number} li the lane it is in @param {number} at its place in the lane */
    destination(event, lanes, li, at) {
        const lane = /** @type {HTMLElement[]} */ (lanes[li]);
        const rtl = getComputedStyle(this.host).direction === 'rtl';
        const side = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
        if (side) {
            const next = lanes[li + side];
            return next ? next[Math.min(at, next.length - 1)] : undefined;
        }
        if (event.key === 'ArrowDown') return lane[Math.min(lane.length - 1, at + 1)];
        if (event.key === 'ArrowUp') return lane[Math.max(0, at - 1)];
        if (event.key === 'Home') return lane[0];
        if (event.key === 'End') return lane[lane.length - 1];
        return undefined;
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const from = event.target instanceof HTMLElement ? event.target.closest('.kp-pipeline__card, .kp-pipeline__more') : null;
        if (!(from instanceof HTMLElement)) return;
        const lanes = this.reachable();
        const li = lanes.findIndex((l) => l.includes(from));
        const lane = lanes[li];
        if (!lane) return;
        const to = this.destination(event, lanes, li, lane.indexOf(from));
        if (!to) return;
        event.preventDefault();
        this.active = to.dataset.kpId ?? to.dataset.kpPipelineMore ?? null;
        this.syncTabStops();
        to.focus();
    }
}
