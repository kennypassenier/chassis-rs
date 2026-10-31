// Scrolling an option into view inside its own scroll container only, never the window.

/**
 * Scroll the nearest scrollable ancestor of `el` so `el` is visible, and
 * nothing above it: the window and any outer scroller stay where they are.
 * Unlike `Element.scrollIntoView`, which always propagates to every
 * ancestor, this sets `scrollTop` on one container only.
 *
 * @param {Element} el
 * @param {'nearest' | 'start' | 'center' | 'end'} [block]
 */
export function scrollWithin(el, block = 'nearest') {
    let box = el.parentElement;
    while (box && box !== document.body && box !== document.documentElement) {
        const { overflowY } = getComputedStyle(box);
        if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && box.scrollHeight > box.clientHeight) break;
        box = box.parentElement;
    }
    if (!box || box === document.body || box === document.documentElement) return;
    const view = box.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const top = rect.top - view.top - box.clientTop;
    const bottom = top + rect.height;
    let delta = 0;
    if (block === 'start') delta = top;
    else if (block === 'end') delta = bottom - box.clientHeight;
    else if (block === 'center') delta = top + rect.height / 2 - box.clientHeight / 2;
    else if (top < 0) delta = top;
    else if (bottom > box.clientHeight) delta = Math.min(bottom - box.clientHeight, top);
    if (delta) box.scrollTop += delta;
}
