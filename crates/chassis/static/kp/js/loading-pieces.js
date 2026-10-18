// Loading pictures that need pieces of their own [scope-141].
//
// Most registers draw what waits with a part's own pseudo-elements. A theme
// whose loading picture is made of pieces (pastel's pom-pom caterpillar:
// Kenny's pick `b-bug-6` on research/pastel-character, 2026-10-14, "alles
// wordt rups") names it in `--kp-loading-pieces`, and this module adds the
// pieces to every waiting part while it waits and takes them away after:
//
//   - a row (a skeleton line, the busy progress bar's track, a loading
//     meter, a heat grid's row of waiting cells, which is one caterpillar and
//     not thirty): pom-poms as round as the row is high, and a head at its end;
//   - a day of the month that loads: two legs under it, and a head beside
//     the last loading day of its week; the day itself rises in turn;
//   - a plate that waits (a block skeleton, the busy table's panel, the busy
//     month's card, a busy menu): a head on its top-end corner and legs
//     along its foot that step in turn;
//   - a spinner: a pom-pom caterpillar round a small day sticker.
//
// The pieces are decoration (`aria-hidden`, no focus, no pointer), in one
// `<span class="kp-pieces">` per part, and the part carries
// `data-kp-pieces="<name>"` while they are there, so a register can put its
// own still picture away (and back without the script). They are measured
// from the part's layout box (offsets, never a transform), again when the
// part changes size. Every motion is the register's, in CSS: this module
// writes places and turns, never a time. A theme that names nothing (every
// theme but pastel) gets nothing: no piece is written, the markup stays as
// it came.
//
//   import { attachLoadingPieces } from '@kp-soft/themes/js/loading-pieces';
//   const detach = attachLoadingPieces(document);

/** The custom property a register names its pieces in. */
export const PIECES_PROPERTY = '--kp-loading-pieces';

/** The attribute a part carries while its pieces are there. */
export const PIECES_ATTRIBUTE = 'data-kp-pieces';

/** The parts that wait, by the shape the pieces take on them. */
export const PIECE_CARRIERS = /** @type {const} */ ({
    row: '.kp-skeleton:not(.kp-skeleton--circle, .kp-skeleton--block), .kp-progressbar[data-kp-indeterminate] > .kp-progressbar__track, :is(.kp-meter, .kp-kpi__meter)[data-kp-loading], .kp-heat__cells:has(> .kp-heat__cell.kp-skeleton)',
    day: ':is(.kp-calendar--busy-days, .kp-calendar--busy-whole) .kp-calendar__day[data-kp-tone="loading"], .kp-skeleton--circle',
    plate: '.kp-skeleton--block:not(.kp-heat__cell, .kp-matrix__cell), .kp-datatable__busy-panel, .kp-calendar--busy-whole:has(> .kp-calendar__grid[aria-busy="true"]) > .kp-calendar__busy, .kp-menu-button > .kp-menu[aria-busy="true"], .kp-kpi[aria-busy="true"], .kp-card[aria-busy="true"]',
    spinner: '.kp-spinner',
});

const ALL = Object.values(PIECE_CARRIERS).join(', ');
const WATCHED = ['class', 'aria-busy', 'data-kp-indeterminate', 'data-kp-loading', 'data-kp-tone', 'data-theme', 'hidden'];

/** @param {number} v */
const px = (v) => `${Math.round(v * 100) / 100}px`;

/**
 * The kind of a waiting part, or '' when it waits for nothing now.
 * @param {Element} el
 * @returns {'' | keyof typeof PIECE_CARRIERS}
 */
function kindOf(el) {
    for (const [kind, selector] of /** @type {[keyof typeof PIECE_CARRIERS, string][]} */ (Object.entries(PIECE_CARRIERS))) {
        try {
            if (el.matches(selector)) return kind;
        } catch {
            /* an engine without :has() skips the selectors that need it */
        }
    }
    return '';
}

/** @param {Element} el @returns {string} the pieces the theme `el` wears names */
const piecesOf = (el) => getComputedStyle(el).getPropertyValue(PIECES_PROPERTY).trim();

/** A rounded corner's radius in px, read from the part (the larger of its top-end ones). @param {HTMLElement} el */
const cornerOf = (el) => {
    const s = getComputedStyle(el);
    const r = Math.max(parseFloat(s.borderStartEndRadius) || 0, parseFloat(s.borderTopRightRadius) || 0);
    return Math.min(r, el.offsetWidth / 2, el.offsetHeight / 2);
};

/**
 * The caterpillar's pieces for one part, as markup inside its `.kp-pieces`,
 * in px of the part's padding box (Kenny's pick b-bug-6, research/pastel-character/pairs-b.js
 * `becomes()`, carried onto the package's parts).
 * @param {HTMLElement} el @param {string} kind
 * @returns {{ html: string, q: number }}
 */
function caterpillar(el, kind) {
    const W = el.clientWidth;
    const H = el.clientHeight;
    // The bottom edge of the border box, where a leg starts.
    const foot = el.offsetHeight - el.clientTop;
    const rtl = getComputedStyle(el).direction === 'rtl';
    // x from the start edge, written as a physical left.
    const at = (/** @type {number} */ x, /** @type {number} */ w = 0) => (rtl ? W - x - w : x);
    if (kind === 'spinner') {
        const pom = (/** @type {number} */ k, /** @type {string} */ lag, face = false) =>
            `<i class="${face ? 'kp-pieces__head' : 'kp-pieces__pom'}" style="--k: ${k}; --lag: ${lag}"></i>`;
        const lags = [0.39, 0.26, 0.13];
        return { html: `<span class="kp-pieces__orbit">${lags.map((l, k) => pom(k, `${l}em`)).join('')}${pom(3, '0em', true)}</span>`, q: 0 };
    }
    if (kind === 'row') {
        // A row of pom-poms as round as the row is high, a head at its end;
        // in the busy bar's track they keep 3 px from its edge.
        const inset = el.classList.contains('kp-progressbar__track') ? 3 : 0;
        const h = H - 2 * inset;
        const w = W - 2 * inset;
        const step = h * 0.78;
        // A grid's row ends at the grid's own edge: its head and feelers stay inside it.
        const reserve = el.classList.contains('kp-heat__cells') ? h * 0.6 : 0;
        const n = Math.max(3, Math.floor((w - h * 1.1 - reserve) / step));
        let html = '';
        for (let k = 0; k < n; k++)
            html += `<i class="kp-pieces__bead" style="left: ${px(at(inset + k * step, h))}; top: ${px(inset)}; --s: ${px(h)}; --k: ${k}"></i>`;
        html += `<i class="kp-pieces__head kp-pieces__head--line" style="left: ${px(at(inset + n * step - h * 0.05, h * 1.16 * 1.18))}; top: ${px(inset - h * 0.08)}; --s: ${px(h * 1.16)}; --k: ${n}"></i>`;
        return { html, q: h };
    }
    const q = 9;
    if (kind === 'day') {
        // Two legs under the day, and a head beside the last loading day of its week.
        const cx = W / 2;
        let html = `<i class="kp-pieces__leg" style="left: ${px(cx - q * 0.9)}; top: ${px(foot)}"></i><i class="kp-pieces__leg kp-pieces__leg--b" style="left: ${px(cx + q * 0.9)}; top: ${px(foot)}"></i>`;
        const next = el.closest('td, [role="gridcell"]')?.nextElementSibling?.querySelector('.kp-calendar__day');
        const last = !next || kindOf(next) !== 'day';
        if (last) html += `<i class="kp-pieces__head kp-pieces__head--day" style="left: ${px(at(W + q * 0.7, q * 4.4))}; top: ${px(H / 2)}"></i>`;
        return { html, q };
    }
    // A plate: a head on its top-end corner, legs along its foot.
    const r = cornerOf(el);
    const reach = W - 2 * r;
    const n = Math.max(3, Math.floor(reach / (q * 3.4)));
    let html = '';
    for (let k = 0; k < n; k++)
        html += `<i class="kp-pieces__leg" style="left: ${px(at(r + ((k + 0.5) * reach) / n))}; top: ${px(foot)}; --k: ${k}"></i>`;
    html += `<i class="kp-pieces__head kp-pieces__head--lead" style="left: ${px(rtl ? r * 0.29 : W - r * 0.29)}; top: ${px(r * 0.29)}"></i>`;
    return { html, q };
}

/** What each dressed part was measured at, so a resize that changes nothing writes nothing. @type {WeakMap<Element, string>} */
const measured = new WeakMap();

/** The pieces a theme may name, by name. */
const DRAW = /** @type {Record<string, (el: HTMLElement, kind: string) => { html: string, q: number }>} */ ({ caterpillar });

/**
 * Take a part's pieces away.
 * @param {Element} el
 */
function undress(el) {
    for (const old of el.querySelectorAll(':scope > .kp-pieces')) old.remove();
    el.removeAttribute(PIECES_ATTRIBUTE);
    measured.delete(el);
    if (el instanceof HTMLElement) {
        el.style.removeProperty('--kp-pieces-q');
        el.style.removeProperty('--kp-pieces-d');
    }
}

/**
 * Give a part the pieces its theme names, measured now; a part whose theme
 * names none, or that no longer waits, loses any it had.
 * @param {HTMLElement} el
 */
function dress(el) {
    const kind = kindOf(el);
    const name = kind ? piecesOf(el) : '';
    const draw = DRAW[name];
    if (!kind || !draw || el.getClientRects().length === 0) {
        if (el.hasAttribute(PIECES_ATTRIBUTE)) undress(el);
        return false;
    }
    const size = `${name} ${kind} ${el.clientWidth}x${el.clientHeight}`;
    if (measured.get(el) === size && el.querySelector(':scope > .kp-pieces')) return true;
    for (const old of el.querySelectorAll(':scope > .kp-pieces')) old.remove();
    const { html, q } = draw(el, kind);
    const box = document.createElement('span');
    box.className = `kp-pieces kp-pieces--${kind}`;
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML = html;
    el.append(box);
    if (q) el.style.setProperty('--kp-pieces-q', px(q));
    // The days start one after another in reading order, a week at a time.
    if (kind === 'day') {
        const cell = el.closest('td, [role="gridcell"]');
        const index = cell && cell.parentElement ? [...cell.parentElement.children].indexOf(cell) : 0;
        el.style.setProperty('--kp-pieces-d', `${Math.max(0, index) * 160}ms`);
    }
    el.setAttribute(PIECES_ATTRIBUTE, name);
    measured.set(el, size);
    return true;
}

/**
 * Watch `root` for parts that wait and give each the pieces its theme
 * names, for as long as it waits; a theme switch, a part that starts or
 * stops waiting and a part that changes size are followed.
 * @param {ParentNode} [root]
 * @returns {() => void} detach: every piece goes, the parts are as they came
 */
export function attachLoadingPieces(root = document) {
    if (typeof MutationObserver !== 'function' || typeof getComputedStyle !== 'function') return () => {};
    const dressed = new Set();
    const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => entries.forEach((e) => queue(e.target))) : null;
    /** @type {Set<Element>} */
    const waiting = new Set();
    let frame = 0;
    let everything = false;
    const flush = () => {
        frame = 0;
        const all = everything;
        everything = false;
        const parts = all ? /** @type {Element[]} */ ([.../** @type {ParentNode} */ (root).querySelectorAll(ALL)]) : [...waiting];
        waiting.clear();
        if (all) for (const el of dressed) if (!parts.includes(/** @type {Element} */ (el))) parts.push(/** @type {Element} */ (el));
        for (const el of parts) {
            if (!(el instanceof HTMLElement)) continue;
            if (!el.isConnected) {
                dressed.delete(el);
                sizes?.unobserve(el);
                continue;
            }
            if (dress(el)) {
                if (!dressed.has(el)) {
                    dressed.add(el);
                    sizes?.observe(el);
                }
            } else if (dressed.has(el)) {
                dressed.delete(el);
                sizes?.unobserve(el);
            }
        }
    };
    const schedule = () => {
        if (!frame) frame = requestAnimationFrame(flush);
    };
    /** @param {Element} el */
    const queue = (el) => {
        waiting.add(el);
        schedule();
    };
    const watch = new MutationObserver((records) => {
        for (const r of records) {
            const target = /** @type {Element} */ (r.target);
            if (r.type === 'attributes') {
                if (r.attributeName === 'data-theme' || target === document.documentElement) everything = true;
                if (target.matches?.(ALL) || dressed.has(target)) queue(target);
                // A busy grid or menu changes its parts' state from above.
                for (const el of target.querySelectorAll?.(ALL) ?? []) queue(el);
                for (const el of dressed) if (target.contains?.(el)) queue(/** @type {Element} */ (el));
            } else {
                // A part that waits by what it holds (a heat grid's row of waiting cells) changes with its children.
                if (target.matches?.(ALL) || dressed.has(target)) queue(target);
                for (const node of r.addedNodes) {
                    if (!(node instanceof Element) || node.classList.contains('kp-pieces')) continue;
                    if (node.matches(ALL)) queue(node);
                    for (const el of node.querySelectorAll(ALL)) queue(el);
                }
                for (const node of r.removedNodes) {
                    if (!(node instanceof Element)) continue;
                    // A component that redraws a waiting part's children takes the pieces with them: put them back.
                    if (node.classList.contains('kp-pieces')) {
                        if (dressed.has(target)) queue(target);
                    } else if (dressed.has(node)) queue(node);
                }
            }
        }
        schedule();
    });
    const target = /** @type {Node} */ (root instanceof Document ? root.documentElement : root);
    watch.observe(target, { subtree: true, childList: true, attributes: true, attributeFilter: WATCHED });
    // A second observe() of the same node replaces the first one's options, so
    // the theme on <html> is watched only from a root below it; from the
    // document, the subtree watch above already sees it (`data-theme` is in
    // WATCHED). Observing <html> twice left only the theme watched, and a part
    // that started waiting after the first paint got no pieces.
    if (target !== document.documentElement) watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    everything = true;
    schedule();
    return () => {
        watch.disconnect();
        sizes?.disconnect();
        if (frame) cancelAnimationFrame(frame);
        for (const el of dressed) undress(/** @type {Element} */ (el));
        dressed.clear();
    };
}
