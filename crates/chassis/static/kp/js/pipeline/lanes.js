// Drawing the lanes and their cards: a card kept by id, a lane made fresh on every paint, the ghosts while loading, and the "+N more" toggle.

import { PipelineCore } from './core.js';
import { GHOST_CARDS, GHOST_CARDS_CLOSED, PERCENT, make } from './values.js';

export class PipelineLanes extends PipelineCore {
    /** The card's element, made or kept by id; a card that turned from link to button (or back) is made again. @param {import('./core.js').PipelineCard} card */
    cardShell(card) {
        const doc = this.host.ownerDocument;
        const tag = card.href ? 'A' : 'BUTTON';
        let node = this.nodes.get(card.id);
        if (!node || node.tagName !== tag) {
            node?.remove();
            node = card.href ? make(doc, 'a', 'kp-pipeline__card') : make(doc, 'button', 'kp-pipeline__card');
            if (node instanceof HTMLButtonElement) node.type = 'button';
            node.append(make(doc, 'span', 'kp-pipeline__mark'), make(doc, 'span', 'kp-pipeline__title'), make(doc, 'span', 'kp-pipeline__sub'));
            node.append(make(doc, 'span', 'kp-pipeline__meta'));
            this.nodes.set(card.id, node);
        }
        return node;
    }

    /**
     * One card, made or kept by id.
     * @param {import('./core.js').PipelineCard} card @param {import('./core.js').PipelineLane | undefined} lane
     */
    cardNode(card, lane) {
        const node = this.cardShell(card);
        if (node instanceof HTMLAnchorElement && card.href) node.href = card.href;
        node.dataset.kpId = card.id;
        node.setAttribute('role', 'listitem');
        if (lane?.tone) node.dataset.kpTone = String(lane.tone);
        else delete node.dataset.kpTone;
        const [mark, title, sub, meta] = /** @type {HTMLElement[]} */ ([...node.children]);
        if (mark) {
            mark.textContent = card.mark ?? '';
            mark.hidden = !card.mark;
            mark.setAttribute('aria-hidden', 'true');
        }
        if (title) title.textContent = card.title;
        if (sub) {
            sub.textContent = card.sub ?? '';
            sub.hidden = !card.sub;
        }
        if (meta) {
            meta.textContent = card.meta ?? '';
            meta.hidden = !card.meta;
        }
        node.title = [card.title, card.sub, card.meta].filter(Boolean).join(' · ');
        node.toggleAttribute('data-kp-dimmed', card.dimmed === true);
        if (card.id === this.selected) node.setAttribute('aria-current', 'true');
        else node.removeAttribute('aria-current');
        return node;
    }

    /** Whether the lanes are drawn as placeholders: loading, or the loading card is still leaving. */
    loading() {
        return this.state === 'loading' || this.leaving !== null;
    }

    /** The lane's head: its name, a flag for a failing stage, and the exact count. @param {import('./core.js').PipelineLane} lane @param {number} count @param {string} id */
    laneHead(lane, count, id) {
        const doc = this.host.ownerDocument;
        const head = make(doc, 'header', 'kp-pipeline__head');
        const name = make(doc, 'h3', 'kp-pipeline__name', lane.label);
        name.id = id;
        const counter = make(doc, 'span', 'kp-pipeline__count');
        if (this.loading()) counter.append(make(doc, 'span', 'kp-skeleton kp-pipeline__ghost-count'));
        else counter.textContent = String(count);
        if (lane.danger) head.append(name, make(doc, 'span', 'kp-pipeline__flag', this.strings.pipelineDanger), counter);
        else head.append(name, counter);
        return head;
    }

    /** The placeholder cards of a loading lane. @param {boolean} closed */
    ghosts(closed) {
        const doc = this.host.ownerDocument;
        const out = [];
        for (let i = 0; i < (closed ? GHOST_CARDS_CLOSED : GHOST_CARDS); i += 1) {
            const ghost = make(doc, 'span', 'kp-pipeline__card kp-pipeline__ghost');
            ghost.setAttribute('aria-hidden', 'true');
            ghost.append(make(doc, 'span', 'kp-skeleton'), make(doc, 'span', 'kp-skeleton'));
            out.push(ghost);
        }
        return out;
    }

    /** The cards of a lane, as many as its limit allows, and the toggle for the rest. @param {import('./core.js').PipelineLane} lane @param {import('./core.js').PipelineCard[]} cards @param {HTMLElement} list */
    fillCards(lane, cards, list) {
        const doc = this.host.ownerDocument;
        const s = this.strings;
        const limit = lane.closed ? 0 : this.limit();
        const open = this.open.has(lane.key);
        const shown = limit > 0 && !open ? cards.slice(0, limit) : cards;
        for (const card of shown) list.append(this.cardNode(card, lane));
        if (limit > 0 && cards.length > limit) {
            const more = make(doc, 'button', 'kp-button kp-button--ghost kp-button--sm kp-pipeline__more');
            more.type = 'button';
            more.dataset.kpPipelineMore = lane.key;
            more.setAttribute('aria-expanded', String(open));
            more.textContent = open ? s.pipelineLess : s.pipelineMore(cards.length - limit);
            list.append(more);
        }
    }

    /** A lane, made from scratch on every paint (its cards are kept by id). @param {import('./core.js').PipelineLane} lane @param {import('./core.js').PipelineCard[]} cards @param {number} total */
    laneNode(lane, cards, total) {
        const doc = this.host.ownerDocument;
        const loading = this.loading();
        const node = make(doc, 'section', `kp-pipeline__lane${lane.closed ? ' kp-pipeline__lane--closed' : ''}`);
        node.setAttribute('role', 'listitem');
        node.dataset.kpLane = lane.key;
        if (lane.tone) node.dataset.kpTone = String(lane.tone);
        if (lane.danger) node.dataset.kpStatus = 'danger';
        const id = `${this.host.id || 'kp-pipeline'}-${lane.key}`;
        node.setAttribute('aria-labelledby', id);
        node.append(this.laneHead(lane, cards.length, id));
        if (this.host.dataset.kpPipelineShare !== 'false' && !lane.closed) {
            const share = make(doc, 'p', 'kp-pipeline__share');
            share.textContent = loading || total === 0 ? '' : this.strings.pipelineShare(Math.round((cards.length / total) * PERCENT));
            node.append(share);
        }
        const list = make(doc, 'div', 'kp-pipeline__cards');
        list.setAttribute('role', 'list');
        list.setAttribute('aria-labelledby', id);
        if (loading) list.append(...this.ghosts(lane.closed === true));
        else if (cards.length === 0) list.append(make(doc, 'p', 'kp-pipeline__none', this.strings.pipelineNone));
        else this.fillCards(lane, cards, list);
        node.append(list);
        return node;
    }
}
