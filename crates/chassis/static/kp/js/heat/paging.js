// The Earlier / Today / Later bar before a heat grid.
import { getStrings } from '../strings.js';
import { HEAT_PAGE_EVENT } from './constants.js';
import { make } from './dom.js';
import { DECORATE } from './grid-state.js';
/** @typedef {import('./types.js').HeatPaging} HeatPaging */

/* ---------------------------------------------------------------- the paging bar */

/** The paging buttons `decorate` has been handed. @type {WeakSet<Element>} */
const MARKED = new WeakSet();

/** The bar each grid has. @type {WeakMap<Element, HTMLElement>} */
const PAGERS = new WeakMap();

/** @param {HTMLElement} el @returns {HTMLElement | null} the bar before the grid */
function pagerOf(el) {
    const kept = PAGERS.get(el);
    if (kept?.isConnected) return kept;
    const before = el.previousElementSibling;
    return before instanceof HTMLElement && before.matches('.kp-heat__pager') ? before : null;
}

/** @param {HTMLElement} el @returns {number} the page the grid shows now: 0 is today, 1 the page before */
export function heatOffset(el) {
    const n = Number(el.getAttribute('data-kp-heat-offset'));
    return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * The Earlier / Today / Later bar before a heat grid [wish-1120, homelab 100]: three buttons and the words of the window between
 * them. A press fires `kp-heat-page` on the grid (the event Page Up and Page Down already send) with `{ direction: 'earlier' | 'later'
 * | 'today', offset, source: 'pager' }`, where `offset` is the page it asks for (0 is today, 1 the page before); a grid that is not
 * `data-kp-heat-owned` also moves its `data-kp-heat-offset` and the bar's disabled buttons itself, an owned one waits for the page to
 * call this again with the new `offset` and `label`. Today is off at offset 0, Later at `min` (0), Earlier at `max` (none). Called
 * again it rewrites in place. The page draws the window's columns with `setHeat` as it always did.
 * @param {HTMLElement} el the heat grid
 * @param {HeatPaging} [paging]
 * @returns {HTMLElement | null} the bar, null for a grid that is not in a page
 */
export function setHeatPaging(el, paging = {}) {
    const doc = el.ownerDocument;
    const s = getStrings();
    let bar = pagerOf(el);
    if (!bar) {
        if (!el.parentNode) return null;
        bar = make(doc, 'div', 'kp-heat__pager', { role: 'group' });
        const button = (/** @type {string} */ part) => make(doc, 'button', `kp-button kp-button--ghost kp-button--sm kp-heat__pager-${part}`, { type: 'button', 'data-kp-heat-page': part });
        const words = make(doc, 'span', 'kp-heat__pager-label');
        words.setAttribute('aria-live', 'polite');
        bar.append(button('earlier'), button('today'), button('later'), words);
        el.before(bar);
        /** @param {MouseEvent} event */
        bar.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target.closest('[data-kp-heat-page]') : null;
            if (!target || !(target instanceof HTMLButtonElement) || target.disabled) return;
            const direction = /** @type {'earlier' | 'later' | 'today'} */ (target.getAttribute('data-kp-heat-page'));
            const now = heatOffset(el);
            const offset = direction === 'today' ? 0 : direction === 'earlier' ? now + 1 : now - 1;
            if (!el.hasAttribute('data-kp-heat-owned')) {
                el.setAttribute('data-kp-heat-offset', String(offset));
                setHeatPaging(el, { ...(PAGING.get(el) ?? {}), offset });
            }
            el.dispatchEvent(new CustomEvent(HEAT_PAGE_EVENT, { bubbles: true, detail: { direction, offset, source: 'pager' } }));
        });
    }
    PAGERS.set(el, bar);
    const given = { ...(PAGING.get(el) ?? {}), ...paging };
    PAGING.set(el, given);
    const offset = paging.offset ?? heatOffset(el);
    el.setAttribute('data-kp-heat-offset', String(offset));
    const min = given.min ?? 0;
    const text = [
        ['earlier', s.heatEarlier, given.max !== undefined && offset >= given.max],
        ['today', s.heatToday, offset === 0],
        ['later', s.heatLater, offset <= min],
    ];
    bar.setAttribute('aria-label', s.heatPagerLabel);
    for (const [part, words, off] of /** @type {[string, string, boolean][]} */ (text)) {
        const b = /** @type {HTMLButtonElement} */ (bar.querySelector(`[data-kp-heat-page="${part}"]`));
        if (b.textContent !== words) b.textContent = words;
        b.disabled = off;
        const decorate = DECORATE.get(el);
        if (decorate && !MARKED.has(b)) {
            MARKED.add(b);
            const key = el.getAttribute('data-kp-key');
            decorate(b, { kind: /** @type {'pager-earlier' | 'pager-today' | 'pager-later'} */ (`pager-${part}`), host: el, ...(key === null ? {} : { key }), label: words });
        }
    }
    const label = /** @type {HTMLElement} */ (bar.querySelector('.kp-heat__pager-label'));
    const wanted = given.label ?? '';
    if (label.textContent !== wanted) label.textContent = wanted;
    return bar;
}

/** The paging each grid was last given. @type {WeakMap<Element, HeatPaging>} */
export const PAGING = new WeakMap();

/**
 * Take the paging bar away.
 * @param {HTMLElement} el the heat grid
 */
export function removeHeatPaging(el) {
    pagerOf(el)?.remove();
    PAGERS.delete(el);
    PAGING.delete(el);
    el.removeAttribute('data-kp-heat-offset');
}
