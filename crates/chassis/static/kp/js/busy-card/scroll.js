// The ancestors that clip a host sideways, and the span of its width that no ancestor's scrolling hides.

/** The ancestors of `host` that clip it sideways (overflow-x other than visible), nearest first. @param {HTMLElement} host */
export function scrollersAround(host) {
    /** @type {HTMLElement[]} */
    const found = [];
    for (let a = host.parentElement; a && a !== host.ownerDocument.documentElement; a = a.parentElement) {
        const x = getComputedStyle(a).overflowX;
        if (x !== 'visible' && a.clientWidth > 0) found.push(a);
    }
    return found;
}

/**
 * The span of `host`'s width (left to right, in viewport pixels) that no ancestor's sideways scrolling hides.
 * @param {HTMLElement} host @param {number} left @param {number} right
 */
export function seenAcross(host, left, right) {
    let seenLeft = left;
    let seenRight = right;
    for (const a of scrollersAround(host)) {
        const box = a.getBoundingClientRect();
        seenLeft = Math.max(seenLeft, box.left + a.clientLeft);
        seenRight = Math.min(seenRight, box.left + a.clientLeft + a.clientWidth);
    }
    return { left: seenLeft, right: Math.max(seenLeft, seenRight) };
}
