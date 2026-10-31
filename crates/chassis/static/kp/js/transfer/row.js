// One transfer row: the reports that start, move, finish or fail it, Retry, the linger after it is done, and taking it back to before its first report.

import { setProgress } from '../progressbar.js';
import { leave } from '../motion.js';
import { getStrings } from '../strings.js';
import { TransferCore } from './core.js';
import { build } from './parts.js';
import { numberOf } from './read.js';
import { live, watch } from './ticker.js';
import { DEFAULT_LINGER_S, DEFAULT_RATE_WINDOW_S, MS, TRANSFER_DONE_EVENT, TRANSFER_LEAVE_EVENT, TRANSFER_RETRY_EVENT } from './values.js';

/** @typedef {import('../transfer.js').TransferSample} TransferSample */
/** @typedef {import('../transfer.js').TransferState} TransferState */

export class TransferRow extends TransferCore {
    connect() {
        const row = this.host;
        // The timer, the linger and the live set let go of the row when it is taken down.
        this.own(() => {
            live.delete(this);
            window.clearTimeout(this.st?.leaveTimer);
        });
        if (!this.options.prepare) return;
        const p = build(row);
        p.bar.setAttribute('aria-valuenow', '0');
        p.value.textContent = '';
    }

    /**
     * Report a transfer's progress. The first report starts it; a report whose `done` reaches `total` finishes it.
     * @param {TransferSample} sample @param {(() => number) | undefined} now
     */
    report(sample, now) {
        const row = this.host;
        const p = build(row);
        const at = sample.at ?? (now ? now() : Date.now());
        let st = this.st;
        if (!st) st = this.begin(at, now);
        else if (now) st.now = now;
        if (sample.name !== undefined) p.label.textContent = sample.name;
        if (sample.total !== undefined) st.total = sample.total > 0 ? sample.total : null;
        row.querySelector(':scope > .kp-transfer__failure')?.remove();
        if (sample.failed !== undefined) {
            this.fail(st, p, sample.failed);
            return;
        }
        if (st.phase !== 'running') return;
        const done = sample.done ?? st.lastDone;
        this.push(st, at, done);
        if (st.total !== null && done >= st.total) {
            this.finish(st, p, at);
            return;
        }
        this.paint(st, p);
        watch(this);
    }

    /** Add a sample, keeping the window and a little more; the rate never needs older samples. @param {TransferState} st @param {number} at @param {number} done */
    push(st, at, done) {
        st.samples.push({ t: at, done });
        const keep = numberOf(this.host, 'data-kp-rate-window', DEFAULT_RATE_WINDOW_S) * MS * 2;
        while (st.samples.length > 2 && at - (st.samples[0]?.t ?? at) > keep) st.samples.shift();
        if (done > st.lastDone) st.lastMove = at;
        st.lastDone = done;
    }

    /** The transfer reached its total: painted done, announced, and left after its linger. @param {TransferState} st @param {ReturnType<typeof build>} p @param {number} at */
    finish(st, p, at) {
        const row = this.host;
        st.phase = 'done';
        live.delete(this);
        this.paint(st, p);
        p.status.textContent = getStrings().transferAnnounce(p.label.textContent ?? '', 100);
        row.dispatchEvent(new CustomEvent(TRANSFER_DONE_EVENT, { bubbles: true, detail: { total: st.total, ms: at - st.start } }));
        const linger = numberOf(row, 'data-kp-linger', DEFAULT_LINGER_S);
        if (linger > 0) {
            st.leaveTimer = window.setTimeout(() => {
                row.dispatchEvent(new CustomEvent(TRANSFER_LEAVE_EVENT, { bubbles: true, detail: {} }));
                void leave(row);
            }, linger * MS);
        }
    }

    /** The transfer failed: painted failed, with the app's own sentence and a Retry that runs it again. @param {TransferState} st @param {ReturnType<typeof build>} p @param {string} why */
    fail(st, p, why) {
        const row = this.host;
        st.phase = 'failed';
        live.delete(this);
        this.paint(st, p);
        const s = getStrings();
        const note = row.ownerDocument.createElement('div');
        note.className = 'kp-alert kp-alert--destructive kp-transfer__failure';
        note.setAttribute('role', 'alert');
        const words = row.ownerDocument.createElement('span');
        words.className = 'kp-alert__body';
        words.textContent = `${s.transferFailed}: ${why}`;
        const retry = row.ownerDocument.createElement('button');
        retry.type = 'button';
        retry.className = 'kp-button kp-button--sm kp-transfer__retry';
        retry.textContent = s.transferRetry;
        retry.addEventListener('click', () => {
            st.phase = 'running';
            st.samples = [];
            st.announced = 0;
            note.remove();
            row.dispatchEvent(new CustomEvent(TRANSFER_RETRY_EVENT, { bubbles: true, detail: {} }));
        });
        note.append(words, retry);
        row.append(note);
    }

    /** Take the transfer back to before its first report (a new run in the same row). */
    reset() {
        const row = this.host;
        live.delete(this);
        window.clearTimeout(this.st?.leaveTimer);
        this.forget();
        row.querySelector(':scope > .kp-transfer__failure')?.remove();
        row.removeAttribute('data-kp-state');
        const p = build(row);
        p.bar.setAttribute('aria-valuenow', '0');
        setProgress(p.bar, 0);
        p.value.textContent = '';
        p.rate.textContent = '';
        row.removeAttribute('data-kp-transfer-unknown');
        row.removeAttribute('data-kp-transfer-settle');
        p.bar.removeAttribute('aria-valuetext');
        p.rate.removeAttribute('data-kp-stalled');
        p.eta.textContent = '';
    }
}
