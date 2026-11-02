// While an item is held over the day timeline's box near its top or bottom edge, the hours scroll under it [parts-1102 r2], faster
// the closer it is to the edge, one step per frame, so a block can be carried to an hour that is out of sight. The owner says where
// the pointer is; each frame that scrolls calls `onScroll` so the owner can place the item again.

import { EDGE_BAND_PX, EDGE_SPEED_PX } from './constants.js';

/**
 * @param {HTMLElement} box the scrolling box
 * @param {() => void} onScroll called after every frame that moved the box
 * @returns {{ at: (clientY: number | null) => void, stop: () => void }} `at(null)`: the pointer left the box
 */
export function edgeScroller(box, onScroll) {
    const win = box.ownerDocument.defaultView;
    /** @type {number | null} */
    let y = null;
    let frame = 0;
    const speed = () => {
        if (y === null) return 0;
        const r = box.getBoundingClientRect();
        if (y < r.top + EDGE_BAND_PX) return -EDGE_SPEED_PX * Math.min(1, (r.top + EDGE_BAND_PX - y) / EDGE_BAND_PX);
        if (y > r.bottom - EDGE_BAND_PX) return EDGE_SPEED_PX * Math.min(1, (y - (r.bottom - EDGE_BAND_PX)) / EDGE_BAND_PX);
        return 0;
    };
    const tick = () => {
        frame = 0;
        const by = Math.round(speed());
        if (!by) return;
        const before = box.scrollTop;
        box.scrollTop = before + by;
        if (box.scrollTop !== before) onScroll();
        frame = win?.requestAnimationFrame(tick) ?? 0;
    };
    return {
        at(clientY) {
            y = clientY;
            if (!frame && speed()) frame = win?.requestAnimationFrame(tick) ?? 0;
        },
        stop() {
            y = null;
            if (frame) win?.cancelAnimationFrame(frame);
            frame = 0;
        },
    };
}
