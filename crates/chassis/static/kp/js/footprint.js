// The footprint: a data component keeps the height it had while a state shows in its place [t56-statefix-1018, S9].
//
// A data component (the matrix, the heat grid, the pipeline, the entity grid, the checklist, the notices, the activity feed, the gallery, the availability grid, the operations page, the diff view and the request
// inspector) writes its state as `data-kp-state` on its host: `loading`, `empty`, `error`, or `ready`. Loaded, it is as high as its
// rows; loading, empty or failed it used to shrink to the height of a skeleton or one plate, and the page under it jumped twice. Kenny's
// rule (2026-10-16 "de hele grootte van de component gebruiken"): a state fills the component's loaded footprint.
//
// Nothing in a stylesheet can do that, because the loaded height is a value of the moment. This module reads it:
//
//   · while the host is ready (no state, or `ready`) a ResizeObserver remembers its height
//   · the moment the state becomes loading, empty or error, the host gets that height as `min-block-size`, so the plate (or the
//     skeleton with the busy card over it) is as high as the list was; back to ready the minimum goes again
//   · the first load has nothing remembered and is left alone: there is no footprint yet to hold (a table is held at an
//     estimate of its rows, as cards when it is laid out as cards, worked out at its first real size)
//
// Three guards, so the hold is never a trap:
//
//   · `--kp-footprint-max` (default 48rem, set it on the host or on any ancestor) caps the hold: a plate in the middle of 1600 px is out
//     of sight, so a very tall list holds a screen, not its full length.
//   · a consumer's own `min-block-size` (inline or from a stylesheet) is kept: the host is held at the larger of the two, and the
//     inline value is put back when the state is ready again.
//   · the box model is honoured: a content-box host is held at its content height, a border-box host at its border box.
//
// Each held host is one FootprintHold controller (js/controller.js). Nothing runs on import; attachFootprints(root) returns a detach, and so does holdFootprint(host) for one host.

import { Controller, attachAll, attachOne } from './controller.js';

/** Every host that writes `data-kp-state` and fills its footprint with it. */
export const FOOTPRINT_HOSTS = [
    '[data-kp-matrix]',
    '[data-kp-heat]',
    '[data-kp-uptime]',
    '[data-kp-entity-grid]',
    '[data-kp-checklist]',
    '[data-kp-timers]',
    '[data-kp-notices]',
    '[data-kp-feed]',
    '[data-kp-gallery]',
    '[data-kp-availability]',
    '[data-kp-requests]',
    '[data-kp-pipeline]',
    '[data-kp-diffview]',
    '[data-kp-datatable]',
    '[data-kp-runs]',
    '[data-kp-gantt]',
    '[data-kp-sequencer]',
    '[data-kp-graph]',
    '[data-kp-week]',
    '[data-kp-chart]:not([data-kp-chart="spark"])',
    '[data-kp-deplist]',
    '[data-kp-code]:not(.kp-code--cell)',
    '.kp-ops',
].join(', ');

/** The cap on a held height, unless the host (or an ancestor) sets `--kp-footprint-max`. */
export const FOOTPRINT_MAX = '48rem';

/** The states that hold. @type {ReadonlySet<string>} */
const HOLDING = new Set(['loading', 'empty', 'error']);

/** The attributes a host writes its state in. */
const STATE_ATTRIBUTES = ['data-kp-state', 'data-kp-state-covered'];

/** Rows a data table is estimated at when neither a hint nor a page size says otherwise. */
const DEFAULT_ROWS = 10;

/** One row of a table in rem, unless `--kp-footprint-row` says otherwise. */
const ROW_REM = 2.75;

/** The width under which a table with `data-kp-cards` lays its rows out as cards [rem] (css/components/datatable, `kp-table`). */
const CARDS_BELOW_REM = 40;

/** A card's padding, border and gap, and the line it gives each column with words [rem]. */
const CARD_FRAME_REM = 1.75;
const CARD_LINE_REM = 2.5;

/** The root font size when the document cannot say [px]. */
const FALLBACK_REM_PX = 16;

/** Holds one host's loaded height while it shows a state. */
class FootprintHold extends Controller {
    /** @param {HTMLElement} host */
    constructor(host) {
        super(host);
        /** The last ready height, as the border box and as the content box [px]; 0 until the host has been ready. */
        this.border = 0;
        this.content = 0;
        /** The first-load estimate [px], 0 when there is none. */
        this.guess = 0;
        /** Whether the minimum on the host is ours, and what stood there before it. */
        this.holding = false;
        this.ownInline = '';
        this.ownPriority = '';
        this.ownComputed = '';
        /**
         * Whether the host has been laid out with a real size since it was attached. The first-load estimate reads the host's frame,
         * and a host that is still hidden (a closed tab, a collapsed panel) or not yet styled reads 0 or a stray height that depends on
         * load order [footprint-estimate B, 2026-10-30]; so the estimate waits for the first non-zero size the ResizeObserver reports.
         */
        this.laidOut = false;
    }

    connect() {
        this.observe(new ResizeObserver((entries) => this.measure(entries))).observe(this.host);
        this.observe(new MutationObserver(() => this.sync())).observe(this.host, { attributes: true, attributeFilter: STATE_ATTRIBUTES });
        this.own(() => this.release());
        // A host that is already in a holding state when it is attached (a table whose first read was empty or failed, drawn before
        // this module loaded) raised no mutation for the observer to hear: hold it now [dtempty-1020, almanac 27].
        this.sync();
    }

    /**
     * The host's state. The data table writes `loading`, `failed` and `ready` as its state, and `data-kp-state-covered` (`empty` or
     * `error`) while its plate stands in the rows' place [states-check-1019]; the covered plate wins, because the table is `ready` with
     * no rows when empty.
     */
    state() {
        const covered = this.host.getAttribute('data-kp-state-covered');
        if (covered !== null) return covered;
        const own = this.host.getAttribute('data-kp-state');
        return own === 'failed' ? 'error' : (own ?? 'ready');
    }

    sync() {
        if (HOLDING.has(this.state())) this.hold();
        else this.release();
    }

    /** @param {ResizeObserverEntry[]} entries */
    measure(entries) {
        // A host taken out of the page has nothing to hold: let go of everything.
        if (!this.host.isConnected) return this.destroy();
        const entry = entries[entries.length - 1];
        if (!this.laidOut && (entry?.contentRect.height ?? 0) > 0) {
            // The first real size: a host that opened in a holding state gets its estimate now, not at attach.
            this.laidOut = true;
            if (HOLDING.has(this.state())) return this.sync();
        }
        if (HOLDING.has(this.state())) return;
        // A table with no rows (it opened empty or failed) is its frame alone: not a loaded height, so the first-load
        // footprint stands in for it [kyugaps-1019, gap kyu 50].
        if (!this.hasRows()) return;
        const rect = this.host.getBoundingClientRect();
        this.border = entry?.borderBoxSize?.[0]?.blockSize ?? rect.height;
        this.content = entry?.contentBoxSize?.[0]?.blockSize ?? rect.height;
    }

    hold() {
        if (!this.holding && !this.border && !this.guess && this.laidOut) this.guess = this.estimate();
        const wanted = this.height();
        if (!wanted) return this.release();
        const style = this.host.style;
        if (!this.holding) {
            // What the consumer set, before our minimum covers it: an inline value, or what a stylesheet gives.
            this.ownInline = style.getPropertyValue('min-block-size');
            this.ownPriority = style.getPropertyPriority('min-block-size');
            this.ownComputed = this.ownInline ? '' : getComputedStyle(this.host).minBlockSize;
            this.holding = true;
        }
        const own = this.ownInline || this.ownComputed;
        const kept = own && own !== 'auto' && own !== 'normal' && parseFloat(own) !== 0 ? own : '';
        const held = `min(${wanted}px, var(--kp-footprint-max, ${FOOTPRINT_MAX}))`;
        style.setProperty('min-block-size', kept ? `max(${held}, ${kept})` : held);
    }

    release() {
        this.guess = 0;
        if (!this.holding) return;
        this.holding = false;
        if (this.ownInline) this.host.style.setProperty('min-block-size', this.ownInline, this.ownPriority);
        else this.host.style.removeProperty('min-block-size');
    }

    /** The height to hold, for the host's own box model: the loaded height, else the first-load estimate. */
    height() {
        const loaded = getComputedStyle(this.host).boxSizing === 'border-box' ? this.border : this.content;
        return loaded || this.guess;
    }

    /** Whether a table has rows of data to be measured: a table with none has no loaded height to remember. */
    hasRows() {
        return !this.host.matches('[data-kp-datatable]') || this.host.querySelector('tbody > tr:not([data-kp-skeleton-row])') !== null;
    }

    /**
     * A host that fails or turns up empty on its very first read has no loaded height to hold [statestwo-1019, almanac 26]. A table
     * (and any host that says so with `data-kp-footprint-rows="N"`) is held at what N rows would make it: its own frame (toolbar, head
     * and foot: the host less what stands in the rows' place) plus N rows of `--kp-footprint-row`; N is the hint, else the table's
     * `data-kp-page-size`, else DEFAULT_ROWS. A loaded height, once there is one, wins.
     */
    estimate() {
        const rows = this.rowsHint();
        if (!rows) return 0;
        return Math.max(0, this.host.getBoundingClientRect().height - this.inPlace()) + rows * this.rowHeight();
    }

    rowsHint() {
        const given = Number.parseInt(this.host.getAttribute('data-kp-footprint-rows') ?? '', 10);
        if (given > 0) return given;
        if (!this.host.matches('[data-kp-datatable]')) return 0;
        const size = Number.parseInt(this.host.getAttribute('data-kp-page-size') ?? '', 10);
        return size > 0 ? size : DEFAULT_ROWS;
    }

    /** One row [px]: `--kp-footprint-row` when the page sets it, else a card in the card layout, else ROW_REM. */
    rowHeight() {
        const doc = this.host.ownerDocument;
        const rem = parseFloat(doc.defaultView?.getComputedStyle(doc.documentElement).fontSize ?? '') || FALLBACK_REM_PX;
        const raw = getComputedStyle(this.host).getPropertyValue('--kp-footprint-row').trim();
        const unit = /^(\d+(?:\.\d+)?)(px|rem)?$/.exec(raw);
        if (unit) return Number(unit[1]) * (unit[2] === 'px' ? 1 : rem);
        // A row in the card layout is a card of one line per column, not one line: on a phone the table's rows are as high as
        // their columns are many [kyugaps-1019, gap kyu 50].
        return this.cardRow(rem) || ROW_REM * rem;
    }

    /**
     * What one row is as a card [px], or 0 when the table is not laid out as cards: the card layout is on while the table's own
     * width is under CARDS_BELOW_REM and the markup asked for it with `data-kp-cards`.
     * @param {number} rem
     */
    cardRow(rem) {
        const host = this.host;
        if (!host.matches('[data-kp-datatable]') || !(host.hasAttribute('data-kp-cards') || host.querySelector('table[data-kp-cards]'))) return 0;
        if (host.getBoundingClientRect().width > CARDS_BELOW_REM * rem) return 0;
        const lines = [...host.querySelectorAll('thead th')].filter((th) => (th.textContent ?? '').trim() !== '').length;
        return lines > 0 ? (CARD_FRAME_REM + lines * CARD_LINE_REM) * rem : 0;
    }

    /** What stands in the rows' place now (skeleton rows, the plate, the empty slot) [px]: not frame. */
    inPlace() {
        const parts = this.host.querySelectorAll('tbody, .kp-stateplate, [data-kp-datatable-empty]');
        let sum = 0;
        for (const part of parts) {
            if (!part.parentElement?.closest('.kp-stateplate, [data-kp-datatable-empty]')) sum += part.getBoundingClientRect().height;
        }
        return sum;
    }
}

/**
 * Hold one host's loaded height while it shows a state.
 *
 * @param {HTMLElement} host
 * @returns {() => void} detach
 */
export function holdFootprint(host) {
    const hold = attachOne(host, FootprintHold);
    return () => hold?.destroy();
}

/**
 * Hold the footprint of every data component under `root`.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export const attachFootprints = (root = document) => attachAll(root, FOOTPRINT_HOSTS, FootprintHold);
