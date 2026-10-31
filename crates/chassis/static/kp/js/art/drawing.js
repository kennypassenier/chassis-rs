// The drawing-board set of drawings.
/** @typedef {import('./types.js').ArtKind} ArtKind */
/** @typedef {import('./types.js').ArtStroke} ArtStroke */

/**
 * Blueprint's set, the working drawing [G6, G13, G16]: every drawing is something a draughtsman does on a sheet. The part
 * is the finished line (`ink`), what the pen draws now is cyan (`rule`), the construction and the hatch are faint (`line`),
 * a flagged fault is `red`. In a 120 by 72 box, strokes listed in the order the pen draws them.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
export const DRAWING = {
    // A part not drawn yet: its four corner marks, the centre lines and the compass circle round the centre.
    none: [
        ['line', 'M18 36h84'],
        ['line', 'M60 8v56'],
        ['ink', 'M26 20V10h10'],
        ['ink', 'M84 10h10v10'],
        ['ink', 'M94 52v10H84'],
        ['ink', 'M36 62H26V52'],
        ['rule', 'M72 36a12 12 0 1 0-24 0a12 12 0 1 0 24 0'],
        ['ink', 'M30 68h60M30 65v6M90 65v6'],
    ],
    // The circle searched: a leader from it to a note that holds nothing.
    nomatch: [
        ['line', 'M16 36h60'],
        ['line', 'M46 10v52'],
        ['ink', 'M62 36a16 16 0 1 0-32 0a16 16 0 1 0 32 0'],
        ['rule', 'M58 25l16-12h20'],
        ['ink', 'M94 8h18v10H94z'],
    ],
    // The part with its failure flagged: the filled triangle in red, the part's outline unfinished at one corner.
    error: [
        ['ink', 'M30 14h60v40H30z'],
        ['line', 'M60 14v40M30 34h60'],
        ['red', 'M60 20l11 20H49z'],
        ['red', 'M60 26v7M60 36v1'],
        ['rule', 'M30 64h60M30 61v6M90 61v6'],
    ],
    // Two parts on one centre line, and the break in it where they no longer meet.
    offline: [
        ['ink', 'M10 24h36v24H10z'],
        ['ink', 'M74 24h36v24H74z'],
        ['line', 'M4 36h6M46 36h6M68 36h6M110 36h6'],
        ['ink', 'M53 36l3-6 6 12 3-6'],
        ['rule', 'M10 56h36M10 53v6M46 53v6'],
        ['rule', 'M74 56h36M74 53v6M110 53v6'],
    ],
    // The section hatched and checked: the part is complete.
    done: [
        ['ink', 'M30 12h60v44H30z'],
        ['line', 'M30 56L74 12M44 56L88 12M60 56L90 26M30 38L56 12'],
        ['rule', 'M50 36l8 8 14-16'],
        ['ink', 'M30 64h60M30 61v6M90 61v6'],
    ],
    // The part held under a lock: hatched across, the padlock drawn on its centre.
    locked: [
        ['ink', 'M30 10h60v52H30z'],
        ['line', 'M30 62L82 10M30 40L60 10M52 62L90 24'],
        ['ink', 'M50 32h20v18H50z'],
        ['rule', 'M54 32v-6a6 6 0 0 1 12 0v6'],
        ['rule', 'M20 6h6M23 3v6M94 6h6M97 3v6'],
    ],
};
