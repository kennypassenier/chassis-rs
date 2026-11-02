// How a growing text box measures: the browser's own sizing with the least and the most set, or the package's sizing from a twin.
// Split in two so a form of many boxes costs one layout, not one per box: `readArea` only reads, `stageArea` only writes the hidden
// twin, `planArea` reads the twin, `writeArea` only writes the box; `measureAreas` runs each step over every box, then fires the events.

import { AUTOSIZE_EVENT } from './constants.js';
import { chromeOf, finishFit, lineHeightOf, readFit, stageFit } from './fit.js';

/**
 * What a box needs, read from the page and not yet applied.
 * @typedef {object} AreaPlan
 * @property {'loading' | 'css' | 'js'} engine
 * @property {number} height the height to write (loading: the least height)
 * @property {boolean} scrolls
 * @property {boolean} capped
 * @property {number} lines
 * @property {number} width the width the text was measured at, rounded
 * @property {string} [least] the css engine's `--kp-autosize-min`
 * @property {string} [most] the css engine's `--kp-autosize-max`
 */

/** Step 1: read what a box needs. Writes nothing. @param {import('./controller.js').AutosizeController} c */
export function readArea(c) {
    const cs = c.view.getComputedStyle(c.area);
    const lh = lineHeightOf(cs);
    const chrome = chromeOf(cs);
    if (c.state === 'loading') return { c, engine: /** @type {AreaPlan['engine']} */ ('loading'), lh, chrome, rows: null, cap: undefined, job: null };
    const engine = /** @type {AreaPlan['engine']} */ (c.engineInUse());
    const rows = c.maxRows();
    const cap = c.phoneCap();
    const job = readFit(c.area, {
        minRows: c.minRows(),
        maxRows: rows,
        ...(cap !== undefined ? { maxPx: cap } : {}),
        ...(engine === 'js' ? { keepPx: c.shrinks() ? 0 : c.tallest } : {}),
        apply: false,
    });
    return { c, engine, lh, chrome, rows, cap, job };
}

/** @typedef {ReturnType<typeof readArea>} AreaRead */

/** Step 2: stage the hidden twin. Writes only the twin. @param {AreaRead} read */
export function stageArea(read) {
    if (read.job) stageFit(read.job);
}

/** Step 3: read the twin and work out the plan. @param {AreaRead} read @returns {AreaPlan} */
export function planArea({ c, engine, lh, chrome, rows, cap, job }) {
    if (!job || engine === 'loading') {
        return { engine: 'loading', height: Math.ceil(c.minRows() * lh + chrome), scrolls: false, capped: false, lines: 0, width: c.width };
    }
    const fit = finishFit(job);
    /** @type {AreaPlan} */
    const plan = { engine, height: fit.height, scrolls: fit.scrolls, capped: fit.capped, lines: fit.lines, width: Math.round(fit.width) };
    if (engine === 'js') return plan;
    const most = rows === null ? 'none' : `${Math.ceil(Math.min(rows * lh + chrome, cap ?? Number.POSITIVE_INFINITY))}px`;
    return { ...plan, least: `${Math.ceil(c.minRows() * lh + chrome)}px`, most };
}

/**
 * Apply a plan. Only writes. Returns the event detail when the height changed, else null.
 * @param {import('./controller.js').AutosizeController} c @param {AreaPlan} plan
 * @returns {{ height: number, lines: number, capped: boolean } | null}
 */
export function writeArea(c, plan) {
    const area = c.area;
    c.width = plan.width;
    if (plan.engine === 'loading') {
        area.style.blockSize = `${plan.height}px`;
        area.style.overflowY = 'hidden';
        return null;
    }
    area.setAttribute('data-kp-autosize-engine-used', plan.engine);
    if (plan.engine === 'css') {
        area.style.blockSize = '';
        area.style.overflowY = '';
        area.style.setProperty('--kp-autosize-min', plan.least ?? '0px');
        area.style.setProperty('--kp-autosize-max', plan.most ?? 'none');
    } else {
        area.style.removeProperty('--kp-autosize-min');
        area.style.removeProperty('--kp-autosize-max');
        area.style.blockSize = `${plan.height}px`;
        area.style.overflowY = plan.scrolls ? 'auto' : 'hidden';
        c.tallest = Math.max(c.tallest, plan.height);
    }
    area.toggleAttribute('data-kp-autosize-capped', plan.capped);
    if (plan.height === c.lastHeight) return null;
    c.lastHeight = plan.height;
    return { height: plan.height, lines: plan.lines, capped: plan.capped };
}

/** Tell the page a height changed. @param {import('./controller.js').AutosizeController} c @param {{ height: number, lines: number, capped: boolean } | null} detail */
function announce(c, detail) {
    if (detail) c.area.dispatchEvent(new CustomEvent(AUTOSIZE_EVENT, { bubbles: true, detail }));
}

/** Size one box for its text, with the engine in use, and report the height. @param {import('./controller.js').AutosizeController} c */
export function measureArea(c) {
    const read = readArea(c);
    stageArea(read);
    announce(c, writeArea(c, planArea(read)));
}

/** Size many boxes with one layout: every read, then every write, then the events. @param {import('./controller.js').AutosizeController[]} list */
export function measureAreas(list) {
    const reads = list.map((c) => readArea(c));
    for (const read of reads) stageArea(read);
    const plans = reads.map((read) => planArea(read));
    const details = list.map((c, i) => writeArea(c, /** @type {AreaPlan} */ (plans[i])));
    list.forEach((c, i) => announce(c, details[i] ?? null));
}
