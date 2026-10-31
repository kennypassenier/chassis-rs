// The low sun set of drawings.
/** @typedef {import('./types.js').ArtKind} ArtKind */
/** @typedef {import('./types.js').ArtStroke} ArtStroke */

/**
 * Solstice's set, the low sun [kpadopt4]: every drawing is something the sun does on a horizon. The horizon is a faint line
 * and what is drawn comes up from it, so the strokes are listed from the foot upward, the order they rise in; the sun and
 * what acts is amber, the rays and the arc its path, what needs the eye a red sky. Round at every end.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
export const LOW_SUN = {
    // The sun not yet up: the horizon, a half disc on it and its first rays.
    none: [
        ['line', 'M10 52h100'],
        ['rule', 'M46 52a14 14 0 0 1 28 0'],
        ['line', 'M60 29v-6'],
        ['line', 'M40 36l-4-4'],
        ['line', 'M80 36l4-4'],
    ],
    // The arc traced, and a hollow ring where the sun would stand: nothing matched.
    nomatch: [
        ['line', 'M10 52h100'],
        ['line', 'M16 52a44 44 0 0 1 88 0'],
        ['ink', 'M52 8a8 8 0 1 0 16 0a8 8 0 1 0-16 0'],
        ['rule', 'M74 20l10 10'],
    ],
    // The sky reddened: the sun low behind bands of red haze.
    error: [
        ['line', 'M10 56h100'],
        ['ink', 'M46 52a14 14 0 0 1 28 0'],
        ['red', 'M22 44h76'],
        ['red', 'M32 36h56'],
        ['red', 'M44 28h32'],
    ],
    // The arc broken in its middle and no sun on it.
    offline: [
        ['line', 'M10 56h100'],
        ['ink', 'M14 56a46 46 0 0 1 23-40'],
        ['ink', 'M83 16a46 46 0 0 1 23 40'],
        ['line', 'M54 14h12'],
    ],
    // Noon: the whole sun risen over the horizon, every ray out.
    done: [
        ['line', 'M10 58h100'],
        ['rule', 'M48 34a12 12 0 1 0 24 0a12 12 0 1 0-24 0'],
        ['ink', 'M60 14v6'],
        ['ink', 'M60 48v6'],
        ['ink', 'M34 34h6'],
        ['ink', 'M80 34h6'],
        ['ink', 'M41 15l4 4'],
        ['ink', 'M79 15l-4 4'],
    ],
    // The sun behind a closed shutter: its rays stop at the board, a keyhole in it.
    locked: [
        ['ink', 'M26 36h68v24H26z'],
        ['rule', 'M54 47a6 6 0 1 0 12 0a6 6 0 1 0-12 0'],
        ['rule', 'M60 53v4'],
        ['line', 'M60 12v14'],
        ['line', 'M40 18l6 10'],
        ['line', 'M80 18l-6 10'],
    ],
};
