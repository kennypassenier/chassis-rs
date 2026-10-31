// Where the card lies: the union of the data area clipped to what is seen, and the room it lends the panel.

/** @typedef {{ top: number, right: number, bottom: number, left: number }} Box */

/**
 * The host's padding box in view.
 * @param {HTMLElement} host
 * @returns {Box}
 */
export function viewOf(host) {
    const box = host.getBoundingClientRect();
    const top = box.top + host.clientTop;
    const left = box.left + host.clientLeft;
    return { top, left, bottom: top + host.clientHeight, right: left + host.clientWidth };
}

/**
 * The union of the rectangles, clipped to the view and to the span that is seen.
 * @param {readonly Box[]} rects @param {Box} view @param {{ left: number, right: number }} seen
 * @returns {Box}
 */
export function coverage(rects, view, seen) {
    const top = Math.max(view.top, Math.min(...rects.map((r) => r.top)));
    const left = Math.max(seen.left, Math.min(...rects.map((r) => r.left)));
    const bottom = Math.max(top, Math.min(view.bottom, Math.max(...rects.map((r) => r.bottom))));
    const right = Math.max(left, Math.min(seen.right, Math.max(...rects.map((r) => r.right))));
    return { top, left, bottom, right };
}

/**
 * An area shorter than the theme's panel (a heat grid of three rows; a register that gives its panel a foot of
 * its own) lends the card the room it needs from either side, within the host: the panel is never cut.
 * @param {Box} box @param {Box} view @param {number} need
 * @returns {Box}
 */
export function lendHeight(box, view, need) {
    const grow = (need - (box.bottom - box.top)) / 2;
    return { ...box, top: Math.max(view.top, box.top - grow), bottom: Math.min(view.bottom, box.bottom + grow) };
}

/**
 * The same sideways: an area narrower than the panel (the cells of a heat grid on a phone, beside its label column, in
 * the part a scroller shows) lends the card the width the panel needs, over what stands beside it, within what is seen,
 * so the panel stands centred in its card and is never cut [laststates-1019].
 * @param {Box} box @param {{ left: number, right: number }} seen @param {number} wide
 * @returns {Box}
 */
export function lendWidth(box, seen, wide) {
    const grow = (wide - (box.right - box.left)) / 2;
    let left = Math.max(seen.left, box.left - grow);
    let right = Math.min(seen.right, box.right + grow);
    // Where one side met the edge of what is seen, the other side takes the rest.
    if (right - left < wide) {
        if (left === seen.left) right = Math.min(seen.right, left + wide);
        else left = Math.max(seen.left, right - wide);
    }
    return { ...box, left, right };
}
