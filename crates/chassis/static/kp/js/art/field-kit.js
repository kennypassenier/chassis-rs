// The field kit set of drawings.
/** @typedef {import('./types.js').ArtKind} ArtKind */
/** @typedef {import('./types.js').ArtStroke} ArtStroke */

/**
 * Forest's set, the field kit [G7, G14]: every drawing is something on a ranger's map or in the wood it describes. The
 * map sheet has the leaf corner (`ink`, the outline of a plate); what is drawn on it is the wood: contour lines are
 * `line`, the trail, a tree and a trig point are `rule` (the acting green), a blaze that marks a fault is `red`. In a 120
 * by 72 box, strokes listed from the ground up, the order they grow in.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
export const FIELD_KIT = {
    // A map with nothing charted yet: contour rings round a bare trig point.
    none: [
        ['ink', 'M22 8h58a10 10 0 0 1 10 10v44H32a10 10 0 0 1-10-10z'],
        ['line', 'M36 46c-2-10 8-17 22-16c13 1 20 10 14 19c-7 8-33 7-36-3z'],
        ['line', 'M46 44c2-6 8-9 15-7c7 2 9 8 4 13c-6 4-18 3-19-6z'],
        ['rule', 'M60 35l5 9h-10z'],
        ['rule', 'M61.5 41a1.5 1.5 0 1 0-3 0a1.5 1.5 0 1 0 3 0'],
        ['rule', 'M30 18h16'],
    ],
    // The trail searched: it runs out where the lens lies and finds nothing.
    nomatch: [
        ['ink', 'M22 8h58a10 10 0 0 1 10 10v44H32a10 10 0 0 1-10-10z'],
        ['line', 'M28 28c10-6 18 2 28-2s14-8 24-4'],
        ['line', 'M28 36c10-6 18 2 28-2s14-8 24-4'],
        ['rule', 'M30 52l8-4 7 3 8-6'],
        ['ink', 'M86 36a11 11 0 1 0-22 0a11 11 0 1 0 22 0'],
        ['rule', 'M82 44l9 10'],
    ],
    // A tree with a red blaze crossed through: the trail is closed here.
    error: [
        ['line', 'M30 62h60'],
        ['ink', 'M56 62V30M64 62V30'],
        ['rule', 'M60 6l15 24H45z'],
        ['red', 'M54 40h12v11H54z'],
        ['red', 'M54 40l12 11M66 40L54 51'],
    ],
    // The trail on one bank and the trail on the other, and a stream between with nothing across it.
    offline: [
        ['ink', 'M8 40h38M74 40h38'],
        ['line', 'M46 24c5 5 5 11 0 16s-5 11 0 16'],
        ['line', 'M74 24c-5 5-5 11 0 16s5 11 0 16'],
        ['rule', 'M12 34h9M25 34h9'],
        ['rule', 'M86 34h9M99 34h9'],
        ['rule', 'M38 22a4 4 0 1 0-8 0a4 4 0 1 0 8 0'],
        ['rule', 'M90 22a4 4 0 1 0-8 0a4 4 0 1 0 8 0'],
    ],
    // A tree grown whole on its ground, a flag at the trig point: the plot is finished.
    done: [
        ['line', 'M36 66h48'],
        ['ink', 'M30 58h60'],
        ['ink', 'M58 58V40h4v18'],
        ['rule', 'M60 6l12 16h-5l10 16H43l10-16h-5z'],
        ['rule', 'M94 58V44l9 4-9 4'],
    ],
    // A gate in a fence, its latch fastened.
    locked: [
        ['ink', 'M30 12v52M90 12v52'],
        ['rule', 'M30 22h60M30 36h60M30 50h60'],
        ['line', 'M32 48L88 24'],
        ['ink', 'M55 31h10v10H55z'],
        ['rule', 'M57 31v-3a3 3 0 0 1 6 0v3'],
    ],
};
