// A transfer row's state on the instance and what is painted from it: the bar, the reading, the speed and the time left, and what a screen reader hears.

import { Controller } from '../controller.js';
import { humanDuration } from '../freshness.js';
import { setIndeterminate, setProgress } from '../progressbar.js';
import { getStrings } from '../strings.js';
import { transferEta, transferRate } from './math.js';
import { numberOf, shows, size } from './read.js';
import { ANNOUNCE_STEP, DEFAULT_ETA_AFTER_S, DEFAULT_RATE_WINDOW_S, DEFAULT_STALL_AFTER_S, MS } from './values.js';

/** @typedef {import('../transfer.js').TransferState} TransferState */
/** @typedef {ReturnType<typeof import('./parts.js').build>} Parts */

/** The full share, in percent. */
const FULL = 100;

export class TransferCore extends Controller {
    /**
     * @param {HTMLElement} row
     * @param {{ prepare?: boolean }} [options] `prepare`: made by attachTransfers, so the row is zeroed and waits for the first report
     */
    constructor(row, options = {}) {
        super(row, options);
        /** The transfer's state; null until its first report, and again after a reset. @type {TransferState | null} */
        this.st = null;
    }

    /** Start a transfer's state at its first report. @param {number} at @param {(() => number) | undefined} now */
    begin(at, now) {
        this.st = {
            samples: [],
            start: at,
            lastMove: at,
            lastDone: 0,
            total: null,
            phase: 'running',
            announced: 0,
            now: now ?? (() => Date.now()),
            leaveTimer: 0,
        };
        return this.st;
    }

    /** Forget the transfer: the next report starts a new one. */
    forget() {
        this.st = null;
    }

    /**
     * The numbers a paint is drawn from.
     * @param {TransferState} st
     */
    measure(st) {
        const row = this.host;
        const now = st.now();
        const last = st.samples.at(-1);
        const done = last?.done ?? 0;
        const total = st.total;
        const known = total !== null && total > 0;
        const stalledFor = (now - st.lastMove) / MS;
        const stalled = st.phase === 'running' && stalledFor >= numberOf(row, 'data-kp-stall-after', DEFAULT_STALL_AFTER_S);
        const rate = stalled ? 0 : transferRate(st.samples, numberOf(row, 'data-kp-rate-window', DEFAULT_RATE_WINDOW_S));
        const measured = (last?.t ?? now) - st.start;
        const percent = known ? Math.min(FULL, Math.floor((done / /** @type {number} */ (total)) * FULL)) : null;
        return { now, last, done, total, known, stalledFor, stalled, rate, measured, percent };
    }

    /**
     * The bar: ARIA is the source. A transfer of unknown size has no share to fill, and a bar that sweeps or restarts reads
     * as stuck or hectic (kpadopt5-ops rounds 1 and 2). `data-kp-transfer-unknown` makes the bar one full band of stripes that
     * drifts at an even pace, a loop that is the same picture every period so nothing restarts; the words beside it say the
     * size is unknown and the bytes so far count up. When the size turns out the band settles into the normal bar, which
     * shrinks from full to the real share instead of jumping.
     * @param {Parts} p @param {ReturnType<TransferCore['measure']>} v
     */
    paintBar(p, v) {
        const row = this.host;
        if (v.known && row.hasAttribute('data-kp-transfer-unknown')) {
            const fill = p.bar.querySelector('.kp-progressbar__fill');
            if (fill) {
                row.setAttribute('data-kp-transfer-settle', '');
                fill.addEventListener('animationend', () => row.removeAttribute('data-kp-transfer-settle'), { once: true });
            }
        }
        row.toggleAttribute('data-kp-transfer-unknown', !v.known);
        if (v.known) {
            setProgress(p.bar, v.percent ?? 0);
            p.bar.removeAttribute('aria-valuetext');
        } else {
            setIndeterminate(p.bar, true);
            const s = getStrings();
            p.bar.setAttribute('aria-valuetext', `${s.transferSizeUnknown}, ${s.transferSoFar(size(row, v.done))}`);
        }
    }

    /** The reading: "1.2 GB of 4.1 GB · 29 %". @param {TransferState} st @param {ReturnType<TransferCore['measure']>} v @returns {string} */
    readingText(st, v) {
        const row = this.host;
        const s = getStrings();
        const total = /** @type {number} */ (v.total);
        if (st.phase === 'done' && v.known) return size(row, total);
        if (!v.known) return s.transferSoFar(size(row, v.done));
        const bits = [];
        if (shows(row, 'done')) bits.push(shows(row, 'total') ? s.transferOf(size(row, v.done), size(row, total)) : size(row, v.done));
        else if (shows(row, 'total')) bits.push(size(row, total));
        if (shows(row, 'percent') && v.percent !== null) bits.push(`${v.percent} %`);
        return bits.join(' · ');
    }

    /** The speed and the time left of a transfer that is still going. @param {ReturnType<TransferCore['measure']>} v @returns {{ rateText: string, etaText: string }} */
    runningTexts(v) {
        const row = this.host;
        const s = getStrings();
        if (v.stalled) return { rateText: s.transferStalled(humanDuration(Math.round(v.stalledFor), s)), etaText: '' };
        const rateText = v.rate !== null && shows(row, 'rate') ? `${size(row, v.rate)}/s` : '';
        let etaText = '';
        if (shows(row, 'eta') && !v.known) etaText = s.transferSizeUnknown;
        if (shows(row, 'eta') && v.known) {
            if (v.rate === null || v.measured < numberOf(row, 'data-kp-eta-after', DEFAULT_ETA_AFTER_S) * MS || v.rate <= 0) etaText = s.transferEstimating;
            else etaText = s.transferLeft(transferEta((/** @type {number} */ (v.total) - v.done) / v.rate));
        }
        return { rateText, etaText };
    }

    /** The speed and the time left, by phase: the average and the duration when done, nothing when failed. @param {TransferState} st @param {ReturnType<TransferCore['measure']>} v @returns {{ rateText: string, etaText: string }} */
    rateTexts(st, v) {
        const row = this.host;
        const s = getStrings();
        if (st.phase === 'failed') return { rateText: '', etaText: '' };
        if (st.phase !== 'done') return this.runningTexts(v);
        const ms = (v.last?.t ?? v.now) - st.start;
        const avg = ms > 0 ? (((v.total ?? v.done) / ms) * MS) : null;
        return {
            rateText: avg !== null && shows(row, 'rate') ? s.transferAverage(`${size(row, avg)}/s`) : '',
            etaText: shows(row, 'eta') ? s.transferTook(humanDuration(Math.round(ms / MS), s)) : '',
        };
    }

    /** A screen reader hears 25, 50, 75 and 100 %, never every second. @param {TransferState} st @param {Parts} p @param {number | null} percent */
    announce(st, p, percent) {
        if (percent === null || this.host.getAttribute('data-kp-announce') === 'off') return;
        const step = Math.floor(percent / ANNOUNCE_STEP);
        if (step > st.announced && st.phase === 'running') {
            st.announced = step;
            p.status.textContent = getStrings().transferAnnounce(p.label.textContent ?? '', step * ANNOUNCE_STEP);
        }
    }

    /** @param {TransferState} st @param {Parts} p */
    paint(st, p) {
        const row = this.host;
        const v = this.measure(st);
        row.setAttribute('data-kp-state', st.phase === 'running' ? (v.stalled ? 'stalled' : 'running') : st.phase);
        this.paintBar(p, v);
        p.value.textContent = this.readingText(st, v);
        const { rateText, etaText } = this.rateTexts(st, v);
        p.rate.textContent = rateText;
        p.rate.toggleAttribute('data-kp-stalled', v.stalled);
        p.eta.textContent = etaText;
        this.announce(st, p, v.percent);
    }
}
