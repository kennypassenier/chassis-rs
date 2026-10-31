// Painting the whole board from its state: the lanes, the state plate for an empty or failed board, and the loading card over it.

import { openBusyCard } from '../busy-card.js';
import { hostStatePlate } from '../state-plate.js';
import { PipelineLanes } from './lanes.js';
import { PIPELINE_RETRY_EVENT } from './values.js';

export class PipelineView extends PipelineLanes {
    /** The cards of each lane, by the lane's key. @returns {Map<string, import('./core.js').PipelineCard[]>} */
    byLane() {
        const byLane = new Map(this.lanes.map((l) => [l.key, /** @type {import('./core.js').PipelineCard[]} */ ([])]));
        for (const card of this.cards) byLane.get(card.lane)?.push(card);
        return byLane;
    }

    /** Take the nodes of cards that are gone off the board. */
    prune() {
        const keep = new Set(this.cards.map((card) => card.id));
        for (const [id, node] of this.nodes)
            if (!keep.has(id)) {
                node.remove();
                this.nodes.delete(id);
            }
    }

    /** Draw the lanes: the board's, then the closed ones under it. */
    drawLanes() {
        const byLane = this.byLane();
        const total = this.cards.filter((card) => this.lanes.some((l) => l.key === card.lane && !l.closed)).length;
        const open = this.lanes.filter((l) => !l.closed);
        const closed = this.lanes.filter((l) => l.closed);
        this.board.style.setProperty('--kp-pipeline-lanes', String(Math.max(1, open.length)));
        this.board.replaceChildren(...open.map((l) => this.laneNode(l, byLane.get(l.key) ?? [], total)));
        this.closed.replaceChildren(...closed.map((l) => this.laneNode(l, byLane.get(l.key) ?? [], total)));
        this.closed.hidden = closed.length === 0;
    }

    /** Which state plate covers the board: `error`, `empty`, or none. @returns {'error' | 'empty' | null} */
    plateKind() {
        const empty = this.state === 'empty' || (this.state === 'ready' && this.cards.length === 0);
        if (this.state === 'error') return 'error';
        return empty && this.leaving === null ? 'empty' : null;
    }

    /** Draw the plate, rebuilt only when what it says changes, so the focus on its Retry survives a repaint. @param {'error' | 'empty' | null} shown */
    drawPlate(shown) {
        const s = this.strings;
        const key = shown === null ? '' : `${shown}|${this.words}`;
        if (this.plateChanged(key)) {
            this.plate.replaceChildren();
            if (shown !== null)
                this.plate.append(
                    hostStatePlate(this.host, {
                        kind: shown,
                        title: shown === 'error' ? s.pipelineFailed('') : this.words || s.pipelineEmpty,
                        ...(shown === 'error' && this.words ? { text: this.words } : {}),
                        retryEvent: PIPELINE_RETRY_EVENT,
                        retryLabel: s.pipelineRetry,
                    }),
                );
        }
        this.plate.hidden = shown === null;
        // What the plate covers is not read behind it: no counts of zero for a board that could not be read.
        this.board.parentElement?.toggleAttribute('inert', shown !== null);
        this.closed.toggleAttribute('inert', shown !== null);
    }

    /** Everything, from the state. */
    paint() {
        this.prune();
        this.drawLanes();
        const empty = this.state === 'empty' || (this.state === 'ready' && this.cards.length === 0);
        this.host.dataset.kpState = this.state === 'ready' && empty ? 'empty' : this.state;
        this.board.toggleAttribute('aria-busy', this.state === 'loading');
        this.drawPlate(this.plateKind());
        this.drawBusy();
        this.syncTabStops();
    }

    /** The loading card over the board, the data table's own [Kenny, 2026-10-16]. */
    drawBusy() {
        const want = this.state === 'loading';
        if (want === (this.busy !== null)) {
            this.busy?.place();
            return;
        }
        const frame = /** @type {HTMLElement} */ (this.board.parentElement);
        if (!want) {
            this.closeBusy();
            return;
        }
        for (const old of frame.querySelectorAll(':scope > .kp-pipeline__busy')) old.remove();
        this.leaving = null;
        this.holdBusy(
            openBusyCard(frame, { words: this.strings.pipelineLoading, area: () => [this.board], className: 'kp-pipeline__busy', arrive: this.drawn }),
        );
        this.live.textContent = this.strings.pipelineLoading;
    }

    /** Let the loading card go; the cards are drawn once it has gone. */
    closeBusy() {
        const card = /** @type {import('../busy-card.js').BusyCard} */ (this.takeBusy());
        const gone = card.close();
        this.leaving = gone;
        void gone.then(() => {
            if (this.leaving !== gone) return;
            this.leaving = null;
            if (!this.destroyed) this.paint();
        });
    }
}
