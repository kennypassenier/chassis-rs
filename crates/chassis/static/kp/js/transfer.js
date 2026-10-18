// A transfer with its speed and the time left [kpadopt5-ops; spec item 26].
//
// A progress bar with a file name, "1.2 GB of 4.1 GB", "12 MB/s" and "about 3 min left". It extends the progress bar
// (js/progressbar.js, the ARIA is the source) and the progress group (one label, track and reading column, fix-64) with a
// rate and an eta part. The app reports raw numbers; this computes the speed and the time left:
//
//   <div class="kp-progress-group kp-progress-group--transfer">
//       <div class="kp-progress__wrap" data-kp-transfer data-kp-transfer-name="backup-2026-10-12.tar.zst"></div>
//   </div>
//
//   setTransfer(row, { done: 1_200_000_000, total: 4_100_000_000, at: Date.now() })
//
// Parts, written when the row has none: `.kp-progress__label` (the name), `.kp-progressbar`, `.kp-progress__value` ("1.2 GB of
// 4.1 GB · 29 %"), `.kp-progress__rate` ("12 MB/s") and `.kp-progress__eta` ("about 3 min left"), all in tabular figures, in
// columns shared by every row of the group. Several transfers in one group align their columns. On a phone the name stands on
// its own line and the numbers under the bar.
//
// States: running; estimating (no time left until the rate is steady: "estimating…"); stalled (no byte for 10 s: "stalled for
// 12 s", warning plate, time left hidden); done ("4.1 GB in 3 min 12 s", success); failed (a destructive note with the app's
// reason and Retry, which fires `kp-transfer-retry`); total unknown (no total means no share to fill, so the row says so in words: "1.2 GB so far", "12 MB/s" and "size unknown" in the time column, over a band of ruled stripes that drifts at an even pace and never restarts; the bytes counting up are the progress; when a report brings the total, the band settles into a normal bar and shrinks to the real share).
//
// Options, each an attribute on the row and a JS option of attachTransfers(root, options):
//
//   data-kp-rate-window   seconds (default 5): the moving average; a single sample jumps
//   data-kp-eta-after     seconds (default 3): no time left until that much has been measured ("estimating…")
//   data-kp-stall-after   seconds (default 10): no new byte for this long is "stalled"
//   data-kp-bytes-base    1000 (default) | 1024: the shared formatter's base; homelab passes 1024 to match its MB
//   data-kp-show          done,total,rate,eta,percent (default all): the parts the reading shows
//   data-kp-linger        seconds a finished transfer stays (default 30); 0 keeps it
//   data-kp-announce      off | state (default): a screen reader hears 25, 50, 75 and 100 %, never every second
//
// Events (bubbling, on the row): kp-transfer-done { total, ms }, kp-transfer-retry {}, kp-transfer-leave {}.
// Every word is in js/strings.js. Nothing runs on import; attachTransfers(root) returns a detach.

import { buildProgressbar, setIndeterminate, setProgress } from './progressbar.js';
import { humanDuration } from './freshness.js';
import { formatBytes } from './locale.js';
import { leave } from './motion.js';
import { getStrings } from './strings.js';

/** A transfer row. */
export const TRANSFER = '[data-kp-transfer]';
/** Fired when a transfer finished: `{ total, ms }`. */
export const TRANSFER_DONE_EVENT = 'kp-transfer-done';
/** Fired when Retry is pressed on a failed transfer. */
export const TRANSFER_RETRY_EVENT = 'kp-transfer-retry';
/** Fired when a finished transfer left the list after its linger. */
export const TRANSFER_LEAVE_EVENT = 'kp-transfer-leave';

/**
 * One report from the app.
 * @typedef {object} TransferSample
 * @property {number} [done] bytes so far
 * @property {number} [total] bytes in all; left out when unknown
 * @property {number} [at] the moment of this report, ms since the epoch (default: now)
 * @property {string} [name] the file's name
 * @property {string} [failed] why it failed (the app's own sentence); ends the transfer
 */

/**
 * @typedef {object} TransferState
 * @property {{ t: number, done: number }[]} samples
 * @property {number} start the first report
 * @property {number} lastMove when `done` last grew
 * @property {number} lastDone
 * @property {number | null} total
 * @property {'running' | 'done' | 'failed'} phase
 * @property {number} announced the highest announced step, 0 to 4
 * @property {() => number} now
 * @property {number} leaveTimer
 */

/** @type {WeakMap<Element, TransferState>} */
const states = new WeakMap();
/** @type {Set<HTMLElement>} */
const live = new Set();
let ticker = 0;

/**
 * Moving-average speed in bytes per second over the last `windowS` seconds of samples; null with fewer than two.
 * @param {{ t: number, done: number }[]} samples oldest first
 * @param {number} windowS
 * @returns {number | null}
 */
export function transferRate(samples, windowS = 5) {
    const last = samples.at(-1);
    if (!last || samples.length < 2) return null;
    const from = last.t - windowS * 1000;
    const inside = samples.filter((s) => s.t >= from);
    const first = inside.length >= 2 ? inside[0] : samples.at(-2);
    if (!first || last.t <= first.t) return null;
    return Math.max(0, (last.done - first.done) / ((last.t - first.t) / 1000));
}

/**
 * The time left in human words, coarse so it does not shimmer: exact under 10 s, to 5 s under a minute, to the minute under
 * an hour.
 * @param {number} seconds
 * @returns {string}
 */
export function transferEta(seconds) {
    const s = getStrings();
    const n = Math.max(0, Math.round(seconds));
    const coarse = n < 10 ? n : n < 60 ? Math.round(n / 5) * 5 : n < 3600 ? Math.round(n / 60) * 60 : Math.round(n / 300) * 300;
    return humanDuration(coarse, s);
}

/** @param {Element} row */
const baseOf = (row) => (row.getAttribute('data-kp-bytes-base') === '1024' ? 1024 : 1000);
/** @param {Element} row @param {string} name @param {number} fallback */
const numberOf = (row, name, fallback) => {
    const n = Number(row.getAttribute(name));
    return row.hasAttribute(name) && Number.isFinite(n) && n >= 0 ? n : fallback;
};
/** @param {Element} row @param {number} bytes */
const size = (row, bytes) => formatBytes(bytes, undefined, { base: baseOf(row) });
/** @param {Element} row @param {string} part */
const shows = (row, part) => {
    const list = row.getAttribute('data-kp-show');
    return list === null || list.split(/[\s,]+/).includes(part);
};

/** @param {HTMLElement} row @param {string} className @param {string} [tag] */
function part(row, className, tag = 'span') {
    let node = /** @type {HTMLElement | null} */ (row.querySelector(`:scope > .${className}`));
    if (!node) {
        node = row.ownerDocument.createElement(tag);
        node.className = className;
        row.append(node);
    }
    return node;
}

/**
 * Build the parts a row lacks.
 * @param {HTMLElement} row
 */
function build(row) {
    const label = part(row, 'kp-progress__label');
    if (!label.textContent) label.textContent = row.getAttribute('data-kp-transfer-name') ?? '';
    let bar = /** @type {HTMLElement | null} */ (row.querySelector(':scope > .kp-progressbar'));
    if (!bar) {
        bar = row.ownerDocument.createElement('div');
        bar.className = 'kp-progressbar';
        label.after(bar);
    }
    bar.setAttribute('aria-label', label.textContent || getStrings().transferBar);
    buildProgressbar(bar);
    const value = part(row, 'kp-progress__value');
    const rate = part(row, 'kp-progress__rate');
    const eta = part(row, 'kp-progress__eta');
    value.classList.add('kp-transfer__done');
    row.classList.add('kp-transfer');
    // Order in the grid: label, bar, reading, rate, eta.
    // Moving a node restarts its CSS animations, and build() runs on every report: only a node out of place is moved
    // (round 1 of kpadopt5-ops: the busy bar restarted from the beginning on every report).
    [label, bar, value, rate, eta].forEach((node, at) => {
        if (row.children[at] !== node) row.insertBefore(node, row.children[at] ?? null);
    });
    let status = /** @type {HTMLElement | null} */ (row.querySelector(':scope > .kp-transfer__voice'));
    if (!status) {
        status = row.ownerDocument.createElement('span');
        status.className = 'kp-sr-only kp-transfer__voice';
        status.setAttribute('role', 'status');
        row.append(status);
    }
    return { label, bar, value, rate, eta, status };
}

/** @param {HTMLElement} row @param {TransferState} st @param {ReturnType<typeof build>} p */
function paint(row, st, p) {
    const s = getStrings();
    const now = st.now();
    const last = st.samples.at(-1);
    const done = last?.done ?? 0;
    const total = st.total;
    const known = total !== null && total > 0;
    const stalledFor = (now - st.lastMove) / 1000;
    const stalled = st.phase === 'running' && stalledFor >= numberOf(row, 'data-kp-stall-after', 10);
    row.setAttribute('data-kp-state', st.phase === 'running' ? (stalled ? 'stalled' : 'running') : st.phase);
    const rate = stalled ? 0 : transferRate(st.samples, numberOf(row, 'data-kp-rate-window', 5));
    const measured = (last?.t ?? now) - st.start;
    const percent = known ? Math.min(100, Math.floor((done / /** @type {number} */ (total)) * 100)) : null;

    // The bar: ARIA is the source. A transfer of unknown size has no share to fill, and a bar that sweeps or restarts reads
    // as stuck or hectic (kpadopt5-ops rounds 1 and 2). `data-kp-transfer-unknown` makes the bar one full band of stripes that
    // drifts at an even pace, a loop that is the same picture every period so nothing restarts; the words beside it say the
    // size is unknown and the bytes so far count up. When the size turns out the band settles into the normal bar, which
    // shrinks from full to the real share instead of jumping.
    if (known && row.hasAttribute('data-kp-transfer-unknown')) {
        const fill = p.bar.querySelector('.kp-progressbar__fill');
        if (fill) {
            row.setAttribute('data-kp-transfer-settle', '');
            fill.addEventListener('animationend', () => row.removeAttribute('data-kp-transfer-settle'), { once: true });
        }
    }
    row.toggleAttribute('data-kp-transfer-unknown', !known);
    if (known) {
        setProgress(p.bar, percent ?? 0);
        p.bar.removeAttribute('aria-valuetext');
    } else {
        setIndeterminate(p.bar, true);
        p.bar.setAttribute('aria-valuetext', `${s.transferSizeUnknown}, ${s.transferSoFar(size(row, done))}`);
    }

    // The reading.
    const readingParts = [];
    if (st.phase === 'done' && known) {
        readingParts.push(size(row, /** @type {number} */ (total)));
    } else if (known) {
        const bits = [];
        if (shows(row, 'done'))
            bits.push(shows(row, 'total') ? s.transferOf(size(row, done), size(row, /** @type {number} */ (total))) : size(row, done));
        else if (shows(row, 'total')) bits.push(size(row, /** @type {number} */ (total)));
        if (shows(row, 'percent') && percent !== null) bits.push(`${percent} %`);
        readingParts.push(bits.join(' · '));
    } else readingParts.push(s.transferSoFar(size(row, done)));
    p.value.textContent = readingParts.join('');

    // The rate and the time left.
    let rateText = '';
    let etaText = '';
    if (st.phase === 'done') {
        const ms = (last?.t ?? now) - st.start;
        const avg = ms > 0 ? ((total ?? done) / ms) * 1000 : null;
        rateText = avg !== null && shows(row, 'rate') ? s.transferAverage(`${size(row, avg)}/s`) : '';
        etaText = shows(row, 'eta') ? s.transferTook(humanDuration(Math.round(ms / 1000), s)) : '';
    } else if (st.phase === 'failed') {
        rateText = '';
        etaText = '';
    } else if (stalled) {
        rateText = s.transferStalled(humanDuration(Math.round(stalledFor), s));
        etaText = '';
    } else {
        rateText = rate !== null && shows(row, 'rate') ? `${size(row, rate)}/s` : '';
        if (shows(row, 'eta') && !known) etaText = s.transferSizeUnknown;
        if (shows(row, 'eta') && known) {
            if (rate === null || measured < numberOf(row, 'data-kp-eta-after', 3) * 1000 || rate <= 0) etaText = s.transferEstimating;
            else etaText = s.transferLeft(transferEta(/** @type {number} */ (total - done) / rate));
        }
    }
    p.rate.textContent = rateText;
    p.rate.toggleAttribute('data-kp-stalled', stalled);
    p.eta.textContent = etaText;

    // A screen reader hears 25, 50, 75 and 100 %, never every second.
    if (percent !== null && row.getAttribute('data-kp-announce') !== 'off') {
        const step = Math.floor(percent / 25);
        if (step > st.announced && st.phase === 'running') {
            st.announced = step;
            p.status.textContent = s.transferAnnounce(p.label.textContent ?? '', step * 25);
        }
    }
}

/** One pass over every live transfer: a stall is noticed without a new report. */
function tick() {
    for (const row of live) {
        const st = states.get(row);
        if (!row.isConnected || !st) {
            live.delete(row);
            continue;
        }
        if (st.phase === 'running') paint(row, st, build(row));
    }
    if (!live.size) {
        clearInterval(ticker);
        ticker = 0;
    }
}

/**
 * Report a transfer's progress. The first report starts it; a report whose `done` reaches `total` finishes it.
 * @param {HTMLElement} row a `[data-kp-transfer]`
 * @param {TransferSample} sample
 * @param {{ now?: () => number }} [options] a clock for the stall check (default: the real one)
 */
export function setTransfer(row, sample, { now } = {}) {
    const p = build(row);
    let st = states.get(row);
    const at = sample.at ?? (now ? now() : Date.now());
    if (!st) {
        st = {
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
        states.set(row, st);
    } else if (now) st.now = now;
    if (sample.name !== undefined) p.label.textContent = sample.name;
    if (sample.total !== undefined) st.total = sample.total > 0 ? sample.total : null;
    row.querySelector(':scope > .kp-transfer__failure')?.remove();
    if (sample.failed !== undefined) {
        st.phase = 'failed';
        live.delete(row);
        paint(row, st, p);
        const s = getStrings();
        const note = row.ownerDocument.createElement('div');
        note.className = 'kp-alert kp-alert--destructive kp-transfer__failure';
        note.setAttribute('role', 'alert');
        const words = row.ownerDocument.createElement('span');
        words.className = 'kp-alert__body';
        words.textContent = `${s.transferFailed}: ${sample.failed}`;
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
        return;
    }
    if (st.phase !== 'running') return;
    const done = sample.done ?? st.lastDone;
    st.samples.push({ t: at, done });
    // Keep the window and a little more; the rate never needs older samples.
    const keep = numberOf(row, 'data-kp-rate-window', 5) * 1000 * 2;
    while (st.samples.length > 2 && at - (st.samples[0]?.t ?? at) > keep) st.samples.shift();
    if (done > st.lastDone) st.lastMove = at;
    st.lastDone = done;
    if (st.total !== null && done >= st.total) {
        st.phase = 'done';
        live.delete(row);
        paint(row, st, p);
        p.status.textContent = getStrings().transferAnnounce(p.label.textContent ?? '', 100);
        row.dispatchEvent(new CustomEvent(TRANSFER_DONE_EVENT, { bubbles: true, detail: { total: st.total, ms: at - st.start } }));
        const linger = numberOf(row, 'data-kp-linger', 30);
        if (linger > 0) {
            st.leaveTimer = window.setTimeout(() => {
                row.dispatchEvent(new CustomEvent(TRANSFER_LEAVE_EVENT, { bubbles: true, detail: {} }));
                void leave(row);
            }, linger * 1000);
        }
        return;
    }
    paint(row, st, p);
    live.add(row);
    if (!ticker) ticker = window.setInterval(tick, 1000);
}

/**
 * Take a transfer back to before its first report (a new run in the same row).
 * @param {HTMLElement} row
 */
export function resetTransfer(row) {
    live.delete(row);
    window.clearTimeout(states.get(row)?.leaveTimer);
    states.delete(row);
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

/**
 * Prepare every transfer row under `root` (its parts and ARIA), waiting for the app's first report.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachTransfers(root = document) {
    const rows = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(TRANSFER) ? [root] : []),
        ...root.querySelectorAll(TRANSFER),
    ]);
    for (const row of rows) {
        const p = build(row);
        p.bar.setAttribute('aria-valuenow', '0');
        p.value.textContent = '';
    }
    // A group folds to name, bar and numbers under it by its own width (data-kp-fold-at, 46rem), not the window's.
    const groups = new Set(rows.map((row) => row.closest('.kp-progress-group--transfer')).filter((g) => g instanceof HTMLElement));
    /** @type {ResizeObserver[]} */
    const watchers = [];
    for (const group of /** @type {Set<HTMLElement>} */ (groups)) {
        const probe = group.ownerDocument.createElement('div');
        probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;block-size:0;overflow:hidden';
        const fit = () => {
            probe.style.inlineSize = group.getAttribute('data-kp-fold-at') ?? '46rem';
            group.append(probe);
            const limit = probe.getBoundingClientRect().width;
            probe.remove();
            const width = group.getBoundingClientRect().width;
            if (width > 0) group.toggleAttribute('data-kp-narrow', width < limit);
        };
        fit();
        if (typeof ResizeObserver === 'function') {
            const watcher = new ResizeObserver(fit);
            watcher.observe(group);
            watchers.push(watcher);
        }
    }
    return () => {
        for (const watcher of watchers) watcher.disconnect();
        for (const row of rows) {
            live.delete(row);
            window.clearTimeout(states.get(row)?.leaveTimer);
            states.delete(row);
        }
    };
}
