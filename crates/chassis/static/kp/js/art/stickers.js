// The stickers set of drawings.
/** @typedef {import('./types.js').ArtKind} ArtKind */
/** @typedef {import('./types.js').ArtStroke} ArtStroke */

/**
 * Pastel's set, the sticker sheet [G7, G9, G18]: every drawing is something done to a page of a planner. A sticker is
 * white paper with its second pass, a flat sky shape 5 units off register (`line`, filled); the paper is `ink` (a closed
 * shape, filled with the card colour, outlined in plum); what is drawn on it is `rule` (plum, open); a mistake is `red`.
 * The last stroke of every drawing is the washi tape that holds it (the register fills it mint). In a 120 by 72 box,
 * strokes listed in the order they are stuck on.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
export const STICKERS = {
    // A blank planner page: three empty pearls on a thread, waiting for something to be threaded.
    none: [
        ['line', 'M33 13h56a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H33a6 6 0 0 1-6-6V19a6 6 0 0 1 6-6z'],
        ['ink', 'M28 8h56a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6z'],
        ['rule', 'M32 20h24'],
        ['rule', 'M32 34h56'],
        ['rule', 'M46 34a2.5 2.5 0 1 0-5 0a2.5 2.5 0 1 0 5 0'],
        ['rule', 'M62.5 34a2.5 2.5 0 1 0-5 0a2.5 2.5 0 1 0 5 0'],
        ['rule', 'M79 34a2.5 2.5 0 1 0-5 0a2.5 2.5 0 1 0 5 0'],
        ['rule', 'M32 48h34'],
        ['ink', 'M13 16L27 6l6 8-14 10z'],
    ],
    // The page searched: its lines with nothing on them, and a lens held over its foot.
    nomatch: [
        ['line', 'M33 13h56a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H33a6 6 0 0 1-6-6V19a6 6 0 0 1 6-6z'],
        ['ink', 'M28 8h56a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6z'],
        ['rule', 'M32 20h24'],
        ['rule', 'M32 30h34'],
        ['line', 'M89 45a12 12 0 1 0-24 0a12 12 0 1 0 24 0'],
        ['ink', 'M86 42a12 12 0 1 0-24 0a12 12 0 1 0 24 0'],
        ['rule', 'M83 51l11 11'],
        ['ink', 'M13 16L27 6l6 8-14 10z'],
    ],
    // A cross-out sticker stuck on the page where the entry should be.
    error: [
        ['line', 'M33 13h56a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H33a6 6 0 0 1-6-6V19a6 6 0 0 1 6-6z'],
        ['ink', 'M28 8h56a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6z'],
        ['rule', 'M32 18h24'],
        ['rule', 'M32 54h40'],
        ['line', 'M70 37a11 11 0 1 0-22 0a11 11 0 1 0 22 0'],
        ['ink', 'M67 34a11 11 0 1 0-22 0a11 11 0 1 0 22 0'],
        ['red', 'M51 29l12 10M63 29L51 39'],
        ['ink', 'M13 16L27 6l6 8-14 10z'],
    ],
    // Two stickers on a thread that no longer joins them.
    offline: [
        ['line', 'M24 26h18a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6V32a6 6 0 0 1 6-6z'],
        ['line', 'M86 26h18a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H86a6 6 0 0 1-6-6V32a6 6 0 0 1 6-6z'],
        ['ink', 'M20 22h18a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V28a6 6 0 0 1 6-6z'],
        ['ink', 'M82 22h18a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H82a6 6 0 0 1-6-6V28a6 6 0 0 1 6-6z'],
        ['rule', 'M44 36h9'],
        ['rule', 'M67 36h9'],
        ['red', 'M56 31l8 10M64 31l-8 10'],
        ['ink', 'M8 24L20 16l5 7-12 8z'],
    ],
    // The page's round sticker, stuck on with a tick: nothing is left to do.
    done: [
        ['line', 'M87 39a22 22 0 1 0-44 0a22 22 0 1 0 44 0'],
        ['ink', 'M82 34a22 22 0 1 0-44 0a22 22 0 1 0 44 0'],
        ['rule', 'M49 35l8 8 15-17'],
        ['rule', 'M44 66h4'],
        ['rule', 'M54 66h12'],
        ['rule', 'M72 66h4'],
        ['ink', 'M34 14l12-8 5 7-12 8z'],
    ],
    // The planner shut, its strap across the cover and the padlock sticker on it.
    locked: [
        ['line', 'M39 13h46a6 6 0 0 1 6 6v42a6 6 0 0 1-6 6H39a6 6 0 0 1-6-6V19a6 6 0 0 1 6-6z'],
        ['ink', 'M34 8h46a6 6 0 0 1 6 6v42a6 6 0 0 1-6 6H34a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6z'],
        ['rule', 'M28 36h58'],
        ['ink', 'M54 34h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H54a2 2 0 0 1-2-2V36a2 2 0 0 1 2-2z'],
        ['rule', 'M55 34v-4a5 5 0 0 1 10 0v4'],
        ['ink', 'M22 14l12-8 5 7-12 9z'],
    ],
};
