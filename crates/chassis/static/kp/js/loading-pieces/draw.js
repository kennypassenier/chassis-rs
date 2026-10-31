// What a waiting part is made of: its kind, and the caterpillar's pieces for each kind, as markup measured from the part's box.

import { PIECE_CARRIERS, SHAPE } from './values.js';

/** @typedef {{ html: string, q: number }} PieceDraw */
/** @typedef {{ W: number, H: number, foot: number, rtl: boolean, at: (x: number, w?: number) => number }} PieceBox */

/** @param {number} v */
export const px = (v) => `${Math.round(v * 100) / 100}px`;

/**
 * The kind of a waiting part, or '' when it waits for nothing now.
 * @param {Element} el
 * @returns {'' | keyof typeof PIECE_CARRIERS}
 */
export function kindOf(el) {
    for (const [kind, selector] of /** @type {[keyof typeof PIECE_CARRIERS, string][]} */ (Object.entries(PIECE_CARRIERS))) {
        try {
            if (el.matches(selector)) return kind;
        } catch {
            /* an engine without :has() skips the selectors that need it */
        }
    }
    return '';
}

/** A rounded corner's radius in px, read from the part (the larger of its top-end ones). @param {HTMLElement} el */
const cornerOf = (el) => {
    const s = getComputedStyle(el);
    const r = Math.max(parseFloat(s.borderStartEndRadius) || 0, parseFloat(s.borderTopRightRadius) || 0);
    return Math.min(r, el.offsetWidth / 2, el.offsetHeight / 2);
};

/**
 * The part's padding box, where a leg starts, and the way x runs.
 * @param {HTMLElement} el
 * @returns {PieceBox}
 */
function boxOf(el) {
    const W = el.clientWidth;
    const H = el.clientHeight;
    // The bottom edge of the border box, where a leg starts.
    const foot = el.offsetHeight - el.clientTop;
    const rtl = getComputedStyle(el).direction === 'rtl';
    // x from the start edge, written as a physical left.
    return { W, H, foot, rtl, at: (x, w = 0) => (rtl ? W - x - w : x) };
}

/** A spinner: a pom-pom caterpillar round a small day sticker. @returns {PieceDraw} */
function spinner() {
    const pom = (/** @type {number} */ k, /** @type {string} */ lag, face = false) =>
        `<i class="${face ? 'kp-pieces__head' : 'kp-pieces__pom'}" style="--k: ${k}; --lag: ${lag}"></i>`;
    const poms = SHAPE.spinnerLags.map((l, k) => pom(k, `${l}em`)).join('');
    return { html: `<span class="kp-pieces__orbit">${poms}${pom(SHAPE.spinnerLags.length, '0em', true)}</span>`, q: 0 };
}

/**
 * A row of pom-poms as round as the row is high, a head at its end.
 * @param {HTMLElement} el @param {PieceBox} box
 * @returns {PieceDraw}
 */
function row(el, { W, H, at }) {
    // In the busy bar's track they keep a little from its edge.
    const inset = el.classList.contains('kp-progressbar__track') ? SHAPE.trackInset : 0;
    const h = H - 2 * inset;
    const w = W - 2 * inset;
    const step = h * SHAPE.rowStep;
    // A grid's row ends at the grid's own edge: its head and feelers stay inside it.
    const reserve = el.classList.contains('kp-heat__cells') ? h * SHAPE.gridReserve : 0;
    const n = Math.max(SHAPE.minCount, Math.floor((w - h * SHAPE.rowHeadRoom - reserve) / step));
    let html = '';
    for (let k = 0; k < n; k++)
        html += `<i class="kp-pieces__bead" style="left: ${px(at(inset + k * step, h))}; top: ${px(inset)}; --s: ${px(h)}; --k: ${k}"></i>`;
    const head = h * SHAPE.rowHead;
    const left = px(at(inset + n * step - h * SHAPE.rowHeadBack, head * SHAPE.rowHeadSpan));
    html += `<i class="kp-pieces__head kp-pieces__head--line" style="left: ${left}; top: ${px(inset - h * SHAPE.rowHeadRaise)}; --s: ${px(head)}; --k: ${n}"></i>`;
    return { html, q: h };
}

/**
 * Two legs under the day, and a head beside the last loading day of its week.
 * @param {HTMLElement} el @param {PieceBox} box
 * @returns {PieceDraw}
 */
function day(el, { W, H, foot, at }) {
    const q = SHAPE.unit;
    const cx = W / 2;
    const spread = q * SHAPE.dayLegSpread;
    let html = `<i class="kp-pieces__leg" style="left: ${px(cx - spread)}; top: ${px(foot)}"></i><i class="kp-pieces__leg kp-pieces__leg--b" style="left: ${px(cx + spread)}; top: ${px(foot)}"></i>`;
    const next = el.closest('td, [role="gridcell"]')?.nextElementSibling?.querySelector('.kp-calendar__day');
    const last = !next || kindOf(next) !== 'day';
    if (last) html += `<i class="kp-pieces__head kp-pieces__head--day" style="left: ${px(at(W + q * SHAPE.dayHeadOut, q * SHAPE.dayHeadSpan))}; top: ${px(H / 2)}"></i>`;
    return { html, q };
}

/**
 * A plate: a head on its top-end corner, legs along its foot.
 * @param {HTMLElement} el @param {PieceBox} box
 * @returns {PieceDraw}
 */
function plate(el, { W, foot, rtl, at }) {
    const q = SHAPE.unit;
    const r = cornerOf(el);
    const reach = W - 2 * r;
    const n = Math.max(SHAPE.minCount, Math.floor(reach / (q * SHAPE.plateLegSpan)));
    let html = '';
    for (let k = 0; k < n; k++)
        html += `<i class="kp-pieces__leg" style="left: ${px(at(r + ((k + 0.5) * reach) / n))}; top: ${px(foot)}; --k: ${k}"></i>`;
    const inset = r * SHAPE.plateHeadInset;
    html += `<i class="kp-pieces__head kp-pieces__head--lead" style="left: ${px(rtl ? inset : W - inset)}; top: ${px(inset)}"></i>`;
    return { html, q };
}

/**
 * The caterpillar's pieces for one part, as markup inside its `.kp-pieces`,
 * in px of the part's padding box (Kenny's pick b-bug-6, research/pastel-character/pairs-b.js
 * `becomes()`, carried onto the package's parts).
 * @param {HTMLElement} el @param {string} kind
 * @returns {PieceDraw}
 */
function caterpillar(el, kind) {
    const box = boxOf(el);
    if (kind === 'spinner') return spinner();
    if (kind === 'row') return row(el, box);
    if (kind === 'day') return day(el, box);
    return plate(el, box);
}

/** The pieces a theme may name, by name. */
export const DRAW = /** @type {Record<string, (el: HTMLElement, kind: string) => PieceDraw>} */ ({ caterpillar });
