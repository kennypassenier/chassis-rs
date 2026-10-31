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
//
// Each row is one TransferRow controller (js/transfer/row.js over js/transfer/core.js, on js/controller.js), made by attachTransfers or by the first
// setTransfer; a group that folds is a TransferGroup. The parts are listed in js/README.md.

import { attachAll, attachOne, controllerOf, hostsOf } from './controller.js';
import { TransferGroup } from './transfer/group.js';
import { TransferRow } from './transfer/row.js';
import { TRANSFER, TRANSFER_GROUP } from './transfer/values.js';

export { TRANSFER, TRANSFER_DONE_EVENT, TRANSFER_RETRY_EVENT, TRANSFER_LEAVE_EVENT } from './transfer/values.js';
export { transferRate, transferEta } from './transfer/math.js';

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

/**
 * Report a transfer's progress. The first report starts it; a report whose `done` reaches `total` finishes it.
 * @param {HTMLElement} row a `[data-kp-transfer]`
 * @param {TransferSample} sample
 * @param {{ now?: () => number }} [options] a clock for the stall check (default: the real one)
 */
export function setTransfer(row, sample, { now } = {}) {
    (controllerOf(row, TransferRow) ?? attachOne(row, TransferRow))?.report(sample, now);
}

/**
 * Take a transfer back to before its first report (a new run in the same row).
 * @param {HTMLElement} row
 */
export function resetTransfer(row) {
    (controllerOf(row, TransferRow) ?? attachOne(row, TransferRow))?.reset();
}

/**
 * Prepare every transfer row under `root` (its parts and ARIA), waiting for the app's first report.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachTransfers(root = document) {
    const rows = hostsOf(root, TRANSFER);
    const detachRows = attachAll(root, TRANSFER, TransferRow, { prepare: true });
    // A group folds to name, bar and numbers under it by its own width (data-kp-fold-at, 46rem), not the window's.
    const groups = new Set(rows.map((row) => row.closest(TRANSFER_GROUP)).filter((g) => g instanceof HTMLElement));
    const made = [...groups]
        .filter((group) => !controllerOf(group, TransferGroup))
        .map((group) => attachOne(/** @type {HTMLElement} */ (group), TransferGroup))
        .filter((controller) => controller !== undefined);
    return () => {
        for (const controller of made) controller.destroy();
        detachRows();
    };
}
