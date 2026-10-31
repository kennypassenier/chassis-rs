// The horizon set of drawings.
/** @typedef {import('./types.js').ArtKind} ArtKind */
/** @typedef {import('./types.js').ArtStroke} ArtStroke */

/**
 * Synthwave's set, the floor [kpadopt4]: the empty state already carries the striped sun on its horizon, so each drawing is
 * what stands on the floor under it, in neon tubes: the marquee's bulbs (what waits), a ring (what is looked for or what
 * failed), the horizon's tube in two halves (what is cut), the lock on a shutter. Pink acts (the acting stroke), cyan
 * reads, red is a tube that failed; the floor's lines close on a point, nothing else runs diagonal. In a 120 by 72 box.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
export const HORIZON = {
    // The marquee with its bulbs unlit, the floor closing on the horizon under it.
    none: [
        ['ink', 'M26 14h6'],
        ['ink', 'M42 14h6'],
        ['ink', 'M58 14h6'],
        ['ink', 'M74 14h6'],
        ['ink', 'M90 14h6'],
        ['rule', 'M10 30h100'],
        ['line', 'M60 30l-40 34'],
        ['line', 'M60 30l-20 34'],
        ['line', 'M60 30v34'],
        ['line', 'M60 30l20 34'],
        ['line', 'M60 30l40 34'],
        ['line', 'M18 42h84'],
        ['line', 'M8 56h104'],
    ],
    // A neon ring held over the floor with a laser laid under it: it holds nothing.
    nomatch: [
        ['ink', 'M72 24a12 12 0 1 0-24 0a12 12 0 1 0 24 0'],
        ['line', 'M56 24h8'],
        ['rule', 'M12 44h96'],
        ['line', 'M18 54h84'],
        ['line', 'M8 64h104'],
    ],
    // A red neon ring with its bar across it: the tube that failed, the floor still under it.
    error: [
        ['red', 'M72 24a12 12 0 1 0-24 0a12 12 0 1 0 24 0'],
        ['red', 'M54 24h12'],
        ['rule', 'M12 44h96'],
        ['line', 'M18 54h84'],
        ['line', 'M8 64h104'],
    ],
    // The horizon tube in two halves, each ending in a plug that meets no socket.
    offline: [
        ['rule', 'M10 30h38'],
        ['ink', 'M48 22v16'],
        ['ink', 'M72 22v16'],
        ['rule', 'M72 30h38'],
        ['line', 'M52 30h4'],
        ['line', 'M64 30h4'],
        ['line', 'M18 46h84'],
        ['line', 'M8 58h104'],
    ],
    // Every bulb of the marquee lit, the horizon closed under them.
    done: [
        ['rule', 'M24 14h8'],
        ['rule', 'M40 14h8'],
        ['rule', 'M56 14h8'],
        ['rule', 'M72 14h8'],
        ['rule', 'M88 14h8'],
        ['ink', 'M10 30h100'],
        ['line', 'M18 42h84'],
        ['line', 'M8 56h104'],
    ],
    // The shutter down: slats, a lock strung on the lowest one.
    locked: [
        ['ink', 'M32 8h56'],
        ['ink', 'M32 16h56'],
        ['ink', 'M32 24h56'],
        ['ink', 'M32 32h56'],
        ['ink', 'M54 40v-3a6 6 0 0 1 12 0v3'],
        ['rule', 'M52 40h16v12H52z'],
        ['line', 'M18 62h84'],
    ],
};
