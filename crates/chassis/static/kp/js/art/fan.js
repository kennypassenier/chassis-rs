// The fan set of drawings.
/** @typedef {import('./types.js').ArtKind} ArtKind */
/** @typedef {import('./types.js').ArtStroke} ArtStroke */

/**
 * Deco's set, the lobby's fan [kpadopt4]: every drawing is the fan, the deco gesture, in gold hairlines: closed it is a
 * pointed shape standing on its pivot (a lozenge) over the double rule, open it is ribs from that pivot with the leaf's arcs
 * across them. Strokes are listed from the centre outward, the order the inlay is drawn in, two at a time. The lozenge is
 * the jewel, the chevron the cut, ruby only where something broke.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
export const FAN = {
    // The fan closed, standing on its pivot over the double rule: nothing opened yet.
    none: [
        ['rule', 'M60 56l-4 4 4 4 4-4z'],
        ['ink', 'M60 56L52 14h16z'],
        ['line', 'M30 66h60'],
        ['line', 'M30 69h60'],
    ],
    // The ribs without their leaf: the fan open and nothing on it that matched.
    nomatch: [
        ['rule', 'M60 56l-4 4 4 4 4-4z'],
        ['line', 'M60.0 62.0L67.6 18.7'],
        ['line', 'M60.0 62.0L52.4 18.7'],
        ['line', 'M60.0 62.0L82.0 23.9'],
        ['line', 'M60.0 62.0L38.0 23.9'],
        ['line', 'M60.0 62.0L93.7 33.7'],
        ['line', 'M60.0 62.0L26.3 33.7'],
        ['line', 'M60.0 62.0L101.3 47.0'],
        ['line', 'M60.0 62.0L18.7 47.0'],
        ['line', 'M24 66h72'],
    ],
    // One rib broken through in ruby, the rest of the fan whole.
    error: [
        ['rule', 'M60 56l-4 4 4 4 4-4z'],
        ['red', 'M60.0 62.0L63.4 42.5'],
        ['red', 'M64.6 36.0L67.6 18.7'],
        ['ink', 'M60.0 62.0L52.4 18.7'],
        ['ink', 'M60.0 62.0L82.0 23.9'],
        ['ink', 'M60.0 62.0L38.0 23.9'],
        ['ink', 'M60.0 62.0L93.7 33.7'],
        ['ink', 'M60.0 62.0L26.3 33.7'],
        ['ink', 'M60.0 62.0L101.3 47.0'],
        ['ink', 'M60.0 62.0L18.7 47.0'],
    ],
    // Two chevrons turned toward each other and no longer meeting, over the double rule.
    offline: [
        ['line', 'M10 66h100'],
        ['line', 'M10 69h100'],
        ['ink', 'M24 24l16 16-16 16'],
        ['ink', 'M96 24l-16 16 16 16'],
        ['rule', 'M60 34l6 6-6 6-6-6z'],
    ],
    // The fan wide open with its leaf: everything is done.
    done: [
        ['rule', 'M60 56l-4 4 4 4 4-4z'],
        ['ink', 'M60.0 62.0L67.6 18.7'],
        ['ink', 'M60.0 62.0L52.4 18.7'],
        ['ink', 'M60.0 62.0L82.0 23.9'],
        ['ink', 'M60.0 62.0L38.0 23.9'],
        ['ink', 'M60.0 62.0L93.7 33.7'],
        ['ink', 'M60.0 62.0L26.3 33.7'],
        ['ink', 'M60.0 62.0L101.3 47.0'],
        ['ink', 'M60.0 62.0L18.7 47.0'],
        ['rule', 'M101.3 47.0A44 44 0 0 0 18.7 47.0'],
        ['rule', 'M86.3 52.4A28 28 0 0 0 33.7 52.4'],
    ],
    // The fan folded shut with its band and the lozenge clasp across it.
    locked: [
        ['ink', 'M60 60L50 12h20z'],
        ['rule', 'M44 38h32'],
        ['rule', 'M60 32l6 6-6 6-6-6z'],
        ['line', 'M30 66h60'],
        ['line', 'M30 69h60'],
    ],
};
