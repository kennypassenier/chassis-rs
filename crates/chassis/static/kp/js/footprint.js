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
import { firstLoadEstimate } from './footprint/estimate.js';

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
        if (!this.holding && !this.border && !this.guess && this.laidOut) this.guess = firstLoadEstimate(this.host);
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
