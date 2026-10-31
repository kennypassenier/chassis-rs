// The loading overlay, the busy clock and the empty state.
import { leave, leavesState, playClose } from '../../motion.js';
import { scrollersAround, seenAcross } from '../../busy-card.js';
import { getStrings } from '../../strings.js';
/** @typedef {import('../../strings/types.js').Strings} Strings */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

/** The room around the overlay's panel, and the most of the table the layer lends itself, in pixels [states-two-1019]. */
const OVERLAY_PANEL_ROOM = 8;
const OVERLAY_MAX_LEND = 128;
/** Milliseconds in a second: the busy count is in seconds. */
const MS_PER_S = 1000;

export class TableBusy {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        /** Stops the layer following the table's size, while one shows. @type {(() => void) | null} */
        this.overlayUnwatch = null;
        /** The server's count, in a server-backed table. */
        this.total = Number.parseInt(this.t.wrap.dataset.kpTotal ?? '', 10);
        this.emptyWasHidden = this.t.controls.empty?.hidden ?? false;
        /** The empty state is leaving now, before it is hidden (leavesState()). */
        this.emptyLeaving = false;
        this.emptyHidden = this.emptyWasHidden;
        this.densityWas = this.t.wrap.getAttribute('data-density');
        this.busyWas = this.t.wrap.getAttribute('aria-busy');
    }

    busySeconds() {
        return Math.max(0, Math.floor((Date.now() - /** @type {number} */ (this.t.model.busySince)) / MS_PER_S));
    }

    stopBusyClock() {
        if (this.t.model.busyTimer !== null) clearInterval(this.t.model.busyTimer);
        this.t.model.busyTimer = null;
        this.t.model.busyClock = null;
        this.t.model.overlayClock = null;
    }

    /**
     * The layer over the rows while the table loads [busy overlay]: a large spinner, the status words and the count, centred on the
     * body and hidden from assistive technology, which hears the status line. Absolutely placed in the wrapper, so nothing moves when
     * it comes or goes; the header stays readable above it.
     * @param {ReturnType<typeof getStrings>} s
     */
    drawOverlay(s) {
        const { model, identity } = this.t;
        this.overlayUnwatch?.();
        this.overlayUnwatch = null;
        if (model.overlayLayer) this.closeOverlay(model.overlayLayer);
        if (model.state !== 'loading' || !model.busyOverlay) return;
        const layer = identity.make('div', 'kp-datatable__busy-overlay');
        layer.setAttribute('aria-hidden', 'true');
        const panel = identity.make('div', 'kp-datatable__busy-panel');
        const words = identity.make('span', 'kp-datatable__busy-words');
        words.textContent = model.busyText ?? s.busy;
        panel.append(identity.make('span', 'kp-spinner'), words);
        if (model.busySince !== null) {
            model.overlayClock = identity.make('span', 'kp-datatable__busy-clock');
            model.overlayClock.textContent = s.tableBusyElapsed(this.busySeconds());
            panel.append(model.overlayClock);
        }
        // Placed in the wrapper rather than in the box that scrolls, so a panel taller than a few rows never adds a scrollbar there.
        layer.append(panel);
        this.t.wrap.append(layer);
        this.placeOverlay(layer, panel);
        this.watchOverlay(layer, panel);
        model.overlayLayer = layer;
    }

    /**
     * Take the layer away. A theme that leaves its states whole (forest: the layer arrived as its leave played backwards) lets the
     * layer leave the way it came (leavesState()); the others close the panel on its own.
     * @param {HTMLElement} toClose
     */
    closeOverlay(toClose) {
        const { model } = this.t;
        model.overlayLayer = null;
        model.overlayClock = null;
        const panel = /** @type {HTMLElement | null} */ (toClose.querySelector('.kp-datatable__busy-panel'));
        if (!(panel && toClose.isConnected && model.state !== 'loading')) {
            toClose.remove();
            return;
        }
        if (leavesState(toClose)) {
            void leave(toClose);
            return;
        }
        toClose.setAttribute('data-kp-closing', '');
        void playClose(panel).then(() => {
            toClose.remove();
        });
    }

    /**
     * Measured, and measured again whenever the table or its header changes size: a theme switched after it was drawn, or a font
     * arriving late, moves the header, and the layer must stay under it rather than where the header first was.
     * @param {HTMLElement} layer @param {HTMLElement} panel
     */
    watchOverlay(layer, panel) {
        if (typeof ResizeObserver !== 'function') return;
        const { table, wrap: host } = this.t;
        const place = () => this.placeOverlay(layer, panel);
        const watcher = new ResizeObserver(() => place());
        watcher.observe(host);
        watcher.observe(table);
        if (table.tHead !== null) watcher.observe(table.tHead);
        // Scrolled sideways inside a scrolling ancestor, the part that is seen moves: the card follows it.
        const scrollers = scrollersAround(host);
        for (const scroller of scrollers) scroller.addEventListener('scroll', place, { passive: true });
        this.overlayUnwatch = () => {
            watcher.disconnect();
            for (const scroller of scrollers) scroller.removeEventListener('scroll', place);
        };
    }

    /** Put the layer over the rows: under the header, above the foot, across what is seen. @param {HTMLElement} layer @param {HTMLElement} panel */
    placeOverlay(layer, panel) {
        const { table, wrap: host } = this.t;
        const head = table.tHead;
        const hostBox = host.getBoundingClientRect();
        const body = (table.tBodies[0] ?? table).getBoundingClientRect();
        const tableBox = (this.t.chrome.scrollBox ?? table).getBoundingClientRect();
        const top = head === null ? body.top : head.getBoundingClientRect().bottom;
        const { from, to } = this.overlayEnds(hostBox, tableBox, top, panel);
        layer.style.setProperty('--kp-busy-overlay-top', `${from}px`);
        layer.style.setProperty('--kp-busy-overlay-bottom', `${to}px`);
        // A table frame wider than the box that scrolls it (a table in a phone's page scroller) is covered only where it is seen, so
        // the panel is centred on what the reader sees and not on a middle off screen [laststates-1019].
        const innerLeft = hostBox.left + host.clientLeft;
        const seen = seenAcross(host, innerLeft, innerLeft + host.clientWidth);
        // A table narrower than what is seen (a bare table of a header and no rows shrinks to its words, or a table drawn at no
        // width) is not the card's width: the card spans what is seen, 0 px wide it showed no look at all [hlfour-1019].
        const spans = tableBox.width >= seen.right - seen.left - 1;
        const left = Math.max(0, Math.round((spans ? Math.max(tableBox.left, seen.left) : seen.left) - innerLeft));
        const right = Math.max(0, Math.round(innerLeft + host.clientWidth - (spans ? Math.min(tableBox.right, seen.right) : seen.right)));
        layer.style.setProperty('--kp-busy-overlay-left', `${left}px`);
        layer.style.setProperty('--kp-busy-overlay-right', `${right}px`);
    }

    /**
     * How far the layer stands from the host's top and bottom.
     * @param {DOMRect} hostBox @param {DOMRect} tableBox @param {number} top where the rows start @param {HTMLElement} panel
     */
    overlayEnds(hostBox, tableBox, top, panel) {
        const host = this.t.wrap;
        let from = Math.max(0, Math.round(top - hostBox.top - host.clientTop));
        let to = Math.max(0, Math.round(hostBox.bottom - Math.max(tableBox.bottom, top) - host.clientTop));
        // A table with no rows has no rows to cover: the card stands in the room the table is held at (its first load's footprint,
        // js/footprint.js), down to the status line under it, not on the strip the bare header leaves [hlfour-1019].
        if (this.t.model.all.length === 0) {
            const foot = host.querySelector('[data-kp-datatable-status]')?.closest('.kp-datatable__bar') ?? null;
            const footTop = foot !== null && foot.getBoundingClientRect().top >= top ? foot.getBoundingClientRect().top : hostBox.bottom;
            to = Math.max(0, Math.round(hostBox.bottom - footTop - host.clientTop));
        }
        // A table of a row or two is shorter than the panel: the layer lends itself the room the panel needs (and at least half the
        // table, up to OVERLAY_MAX_LEND px), downwards over the foot, within the host, so the card is never a strip over two rows
        // [states-two-1019].
        const need = Math.max(panel.offsetHeight + OVERLAY_PANEL_ROOM, Math.min(host.clientHeight / 2, OVERLAY_MAX_LEND));
        if (host.clientHeight - from - to < need) {
            to = Math.max(0, host.clientHeight - from - need);
            // A table with no rows stands near the bottom of its frame: the card then also takes the room above, over the header.
            if (host.clientHeight - from - to < need) from = Math.max(0, host.clientHeight - to - need);
        }
        return { from, to };
    }

    /**
     * Show or hide the empty state. In a theme that lets a hidden part
     * leave first it withers before it goes, and what the table wants
     * when that is over (typing went on) is applied then.
     * @param {boolean} hide
     */
    showEmpty(hide) {
        if (this.t.controls.empty === null) return;
        this.emptyHidden = hide;
        if (this.emptyLeaving) return;
        if (hide && !this.t.controls.empty.hidden && this.t.controls.empty.isConnected && leavesState(this.t.controls.empty)) {
            this.emptyLeaving = true;
            void leave(this.t.controls.empty, { hide: true }).then(() => {
                this.emptyLeaving = false;
                if (this.t.controls.empty !== null) this.t.controls.empty.hidden = this.emptyHidden;
            });
            return;
        }
        this.t.controls.empty.hidden = hide;
    }
}
