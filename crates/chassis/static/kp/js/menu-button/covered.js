// The edges of the screen a menu must stay clear of: what the page declares covered, and the bars stuck over it.
/** @typedef {import('./types.js').Covered} Covered */

/**
 * How far in from each of the screen's edges a menu must stay: what the page
 * declares as covered (its scrolling box's `scroll-padding`, which the
 * package's sticky nav writes), or a bar stuck (fixed or sticky) along the
 * screen at that edge, whichever reaches further: a header or a footer
 * across it, a side nav down it. A menu over a side nav hung outside the
 * page it belongs to (the review page's nav, Kenny, 2026-10-05). A bar the
 * menu button lives in does not count, nor a small floating control (less
 * than half the screen along its edge).
 * @param {Window} view
 * @param {Element} wrapper
 * @param {Element} [skip] an element to see through (the open menu)
 * @returns {Covered}
 */
export function coveredEdges(view, wrapper, skip) {
    const doc = view.document;
    const html = doc.documentElement;
    const width = html.clientWidth;
    const height = html.clientHeight;
    const pad = view.getComputedStyle(doc.scrollingElement ?? html);
    const px = (/** @type {string} */ v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
    const box = wrapper.getBoundingClientRect();
    const midX = Math.min(Math.max(box.left + box.width / 2, 1), width - 1);
    const midY = Math.min(Math.max(box.top + box.height / 2, 1), height - 1);
    /**
     * The stuck bar at this point, if any, long enough along its edge.
     * @param {number} x @param {number} y @param {'width' | 'height'} along
     */
    const barAt = (x, y, along) => {
        for (const hit of doc.elementsFromPoint(x, y)) {
            if (skip?.contains(hit)) continue;
            for (let el = /** @type {Element | null} */ (hit); el && el !== html && el !== doc.body; el = el.parentElement) {
                const { position } = view.getComputedStyle(el);
                if (position !== 'fixed' && position !== 'sticky') continue;
                if (el.contains(wrapper) || wrapper.contains(el)) return null;
                const r = el.getBoundingClientRect();
                return r[along] >= (along === 'width' ? width : height) / 2 ? r : null;
            }
            return null;
        }
        return null;
    };
    /**
     * How far the bars stacked at one edge reach in, probing past each. The
     * first is looked for a little way in too: a body margin keeps a side
     * nav 8 px off the edge (the catalogue's).
     * @param {number} size the screen along this axis
     * @param {(inset: number) => DOMRect | null} at the bar `inset` px in from the edge
     * @param {(bar: DOMRect) => number} reach how far in that bar ends
     */
    const stacked = (size, at, reach) => {
        let inset = 0;
        /** @type {DOMRect | null} */
        let first = null;
        for (const start of [0.5, 8.5, 16.5, 32.5]) if ((first = at(start))) break;
        for (let bar = first, n = 0; bar && n < 4; n += 1) {
            if (reach(bar) <= inset + 0.5) break;
            inset = reach(bar);
            bar = inset < size ? at(inset + 0.5) : null;
        }
        return inset;
    };
    const top = stacked(
        height,
        (d) => barAt(midX, d, 'width'),
        (bar) => bar.bottom,
    );
    const bottom = stacked(
        height,
        (d) => barAt(midX, height - d, 'width'),
        (bar) => height - bar.top,
    );
    const left = stacked(
        width,
        (d) => barAt(d, midY, 'height'),
        (bar) => bar.right,
    );
    const right = stacked(
        width,
        (d) => barAt(width - d, midY, 'height'),
        (bar) => width - bar.left,
    );
    return {
        top: Math.max(top, px(pad.scrollPaddingTop)),
        bottom: Math.max(bottom, px(pad.scrollPaddingBottom)),
        left: Math.max(left, px(pad.scrollPaddingLeft)),
        right: Math.max(right, px(pad.scrollPaddingRight)),
    };
}
