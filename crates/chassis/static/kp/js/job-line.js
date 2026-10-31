// The job line: one sentence for a run that has steps AND moves data [wish-1120, homelab 98].
//
// A backup, an import or an update is a list of steps (js/steplist.js) and, in some of its steps, a transfer
// (js/transfer.js). The page used to print two separate lines for them; the person watching wants one:
//
//   Step 3 of 35 · 1.2 of 4 GB · about 2 min left
//
//   <p class="kp-jobline" data-kp-jobline data-kp-jobline-for="#update-steps"></p>
//
// The step position comes from the list named by `data-kp-jobline-for` (the running step, else the first step still
// waiting; it follows the list's `kp-steplist-step` event) or from `setJobLine(line, { step, steps })`. The bytes come
// from `setJobLine(line, { done, total })` (the same numbers `setTransfer` takes); the time left is `etaSeconds`, or
// worked out from `rate` (bytes per second, e.g. `transferRate(samples)`). A part that is not known is left out with
// its separator, never printed as "0" or "?". `data-kp-bytes-base="1024"` switches the sizes to binary units.
// The line is a status region that does not speak on every report (`aria-live="off"`): the step list announces the
// steps; a person reading the line reads the whole sentence.
// Every word is in js/strings.js.

import { STEPLIST_EVENT, STEPLIST_SELECTOR } from './steplist.js';
import { formatBytes } from './locale.js';
import { getStrings } from './strings.js';
import { transferEta } from './transfer.js';
import { Controller, attachOne, controllerOf } from './controller.js';

/** The lines this module looks after. */
export const JOBLINE = '[data-kp-jobline]';
/** Fired on the line, bubbling, when its text changed: `{ text }`. */
export const JOBLINE_EVENT = 'kp-jobline';

/**
 * @typedef {object} JobReport
 * @property {number} [step] the step now at work, 1-based
 * @property {number} [steps] the steps in all
 * @property {number} [done] bytes moved so far
 * @property {number} [total] bytes in all
 * @property {number} [etaSeconds] the time left, in seconds
 * @property {number} [rate] bytes per second; the time left is worked out from it when `etaSeconds` is not given
 */

/**
 * What `setJobLine` takes: a JobReport in which a key may also be `null` (or `undefined`) to take it back out [HL 137].
 * @typedef {{ [K in keyof JobReport]?: JobReport[K] | null }} JobReportUpdate
 */

/** The unit names of `formatBytes`, smallest first; the position is the power of the base. */
const BYTE_UNITS = ['B', 'kB', 'MB', 'GB', 'TB'];
/** The decimals of a moved size above bytes ("1.2 of 4 GB"). */
const SIZE_DECIMALS = 1;
/** The two byte bases `data-kp-bytes-base` chooses between: decimal by default, binary on "1024". */
const DECIMAL_BASE = 1000;
const BINARY_BASE = 1024;

/** The report each line was last given. @type {WeakMap<Element, JobReport>} */
const reports = new WeakMap();

/**
 * "1.2 of 4 GB": the moved bytes in the unit of the total, so the unit is said once.
 * @param {number} done
 * @param {number} total
 * @param {1000 | 1024} base
 * @returns {string}
 */
function sharedSize(done, total, base) {
    const all = formatBytes(total, undefined, { base });
    const unit = all.slice(all.lastIndexOf(' ') + 1);
    const power = Math.max(0, BYTE_UNITS.indexOf(unit));
    const scaled = new Intl.NumberFormat(undefined, { maximumFractionDigits: power === 0 ? 0 : SIZE_DECIMALS }).format(done / base ** power);
    return getStrings().jobLineBytes(scaled, all);
}

/**
 * The sentence for a report, parts left out when unknown.
 * @param {JobReport} report
 * @param {{ base?: 1000 | 1024 }} [options]
 * @returns {string}
 */
export function jobLineText(report, { base = DECIMAL_BASE } = {}) {
    const s = getStrings();
    const parts = [];
    const { step, steps, done, total } = report;
    if (Number.isFinite(step) && Number.isFinite(steps) && /** @type {number} */ (steps) > 0)
        parts.push(s.jobLineStep(/** @type {number} */ (step), /** @type {number} */ (steps)));
    if (Number.isFinite(done) && Number.isFinite(total) && /** @type {number} */ (total) > 0) {
        parts.push(sharedSize(Math.min(/** @type {number} */ (done), /** @type {number} */ (total)), /** @type {number} */ (total), base));
    } else if (Number.isFinite(done)) parts.push(s.transferSoFar(formatBytes(/** @type {number} */ (done), undefined, { base })));
    let eta = report.etaSeconds;
    if (
        !Number.isFinite(eta) &&
        Number.isFinite(report.rate) &&
        /** @type {number} */ (report.rate) > 0 &&
        Number.isFinite(total) &&
        Number.isFinite(done)
    ) {
        eta = Math.max(0, /** @type {number} */ (total) - /** @type {number} */ (done)) / /** @type {number} */ (report.rate);
    }
    if (Number.isFinite(eta)) parts.push(s.transferLeft(transferEta(/** @type {number} */ (eta))));
    return parts.length ? parts.join(s.jobLineSeparator) : s.jobLineIdle;
}

/** The step position of a list: the running (or current) step, else the first one still waiting, else the last; 0 while nothing has started. @param {Element} list @returns {{ step: number, steps: number }} */
export function stepPosition(list) {
    const items = [...list.querySelectorAll(':scope > .kp-steplist__item')];
    if (items.every((item) => (item.getAttribute('data-state') ?? 'pending') === 'pending')) return { step: 0, steps: items.length };
    const at = items.findIndex((item) => ['running', 'current'].includes(item.getAttribute('data-state') ?? ''));
    const waiting = items.findIndex((item) => (item.getAttribute('data-state') ?? 'pending') === 'pending');
    const index = at >= 0 ? at : waiting >= 0 ? waiting : items.length - 1;
    return { step: Math.max(0, index) + 1, steps: items.length };
}

/** @param {HTMLElement} line @param {JobReport} report */
function paint(line, report) {
    const base = /** @type {1000 | 1024} */ (line.getAttribute('data-kp-bytes-base') === String(BINARY_BASE) ? BINARY_BASE : DECIMAL_BASE);
    const text = jobLineText(report, { base });
    if (line.textContent !== text) {
        line.textContent = text;
        line.dispatchEvent(new CustomEvent(JOBLINE_EVENT, { bubbles: true, detail: { text } }));
    }
}

/** @param {HTMLElement} line @returns {Element | null} */
function listOf(line) {
    const target = line.getAttribute('data-kp-jobline-for');
    const found = target ? document.querySelector(target) : null;
    return found?.matches(STEPLIST_SELECTOR) ? found : null;
}

/**
 * Report to a job line: only what is given changes; `null` for a key takes it back out.
 * @param {HTMLElement} line a `[data-kp-jobline]`
 * @param {JobReportUpdate} report
 */
export function setJobLine(line, report) {
    const next = { ...(reports.get(line) ?? {}) };
    for (const [key, value] of Object.entries(report)) {
        if (value === null || value === undefined) delete (/** @type {any} */ (next)[key]);
        else /** @type {any} */ (next)[key] = value;
    }
    reports.set(line, next);
    const list = listOf(line);
    paint(line, list && !('step' in report) ? { ...next, ...stepPosition(list) } : next);
}

/**
 * Build a job line.
 * @param {{ label?: string, steplist?: string }} [options] `label`: its accessible name; `steplist`: a selector for the list it follows
 * @returns {HTMLParagraphElement}
 */
export function buildJobLine({ label, steplist } = {}) {
    const line = document.createElement('p');
    line.className = 'kp-jobline';
    line.setAttribute('data-kp-jobline', '');
    if (label) line.setAttribute('aria-label', label);
    if (steplist) line.setAttribute('data-kp-jobline-for', steplist);
    return line;
}

/** One job line: its status-region attributes, a first paint, and a repaint whenever the step list it names moves. */
class JobLineController extends Controller {
    connect() {
        const line = this.host;
        line.setAttribute('role', 'status');
        line.setAttribute('aria-live', 'off');
        line.setAttribute('aria-atomic', 'true');
        const list = listOf(line);
        paint(line, list ? { ...(reports.get(line) ?? {}), ...stepPosition(list) } : (reports.get(line) ?? {}));
        this.listen(document, STEPLIST_EVENT, (event) => this.onStep(event));
    }

    /** @param {Event} event */
    onStep(event) {
        const list = event.target instanceof Element ? event.target.closest(STEPLIST_SELECTOR) : null;
        if (list && listOf(this.host) === list) setJobLine(this.host, {});
    }
}

/**
 * Prepare every job line under `root` and follow the step lists they name.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachJobLines(root = document) {
    // The root itself is never a line host here: only what is under it, as before.
    const made = [...root.querySelectorAll(JOBLINE)]
        .map((found) => /** @type {HTMLElement} */ (found))
        .filter((line) => !controllerOf(line, JobLineController))
        .map((line) => attachOne(line, JobLineController))
        .filter((controller) => controller !== undefined);
    return () => {
        for (const controller of made) controller.destroy();
    };
}
