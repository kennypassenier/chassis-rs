// The one timer all live transfers share, so a stall is noticed without a new report: it runs while a transfer is live and stops with the last.

import { build } from './parts.js';
import { TICK_MS } from './values.js';

/** @typedef {import('./core.js').TransferCore} TransferCore */

/** The transfers that are running now. @type {Set<TransferCore>} */
export const live = new Set();
let ticker = 0;

/** One pass over every live transfer: a stall is noticed without a new report. */
function tick() {
    for (const row of live) {
        const st = row.st;
        if (!row.host.isConnected || !st) {
            live.delete(row);
            continue;
        }
        if (st.phase === 'running') row.paint(st, build(row.host));
    }
    if (!live.size) {
        clearInterval(ticker);
        ticker = 0;
    }
}

/** Keep a transfer live: it is painted every tick until it ends. @param {TransferCore} row */
export function watch(row) {
    live.add(row);
    if (!ticker) ticker = window.setInterval(tick, TICK_MS);
}
