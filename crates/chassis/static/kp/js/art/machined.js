// Titanium's machined set of drawings.
/** @typedef {import('./types.js').ArtKind} ArtKind */
/** @typedef {import('./types.js').ArtStroke} ArtStroke */

/**
 * Titanium's set, the machined part [kpadopt4]: every drawing is a part on a machinist's drawing, cut from bar stock with the
 * chamfer at its top start and bottom end corners: a blank plate, a plate probed, a plate fractured, a bar cut in two, a
 * part with its bore inspected, a part under its clasp. `rule` is the bare tool edge, `line` the faint grain and centre
 * lines, `ink` the part's own outline, `red` the fracture. In a 120 by 72 box, strokes listed in the order they are cut.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
export const MACHINED = {
    // Bar stock before the first cut: the chamfered plate, its brushed grain, the datum cross where the work starts.
    none: [
        ['ink', 'M36 8h56v48l-8 8H28V16z'],
        ['line', 'M38 24h46'],
        ['line', 'M38 48h46'],
        ['line', 'M20 36h8M92 36h8'],
        ['rule', 'M54 36h12M60 30v12'],
    ],
    // The plate probed: three drilled holes, the stylus come down on a fourth place, and nothing there to find.
    nomatch: [
        ['ink', 'M36 8h56v48l-8 8H28V16z'],
        ['ink', 'M50 29a3 3 0 1 0-6 0a3 3 0 1 0 6 0'],
        ['ink', 'M63 29a3 3 0 1 0-6 0a3 3 0 1 0 6 0'],
        ['ink', 'M76 29a3 3 0 1 0-6 0a3 3 0 1 0 6 0'],
        ['line', 'M44 46h32'],
        ['rule', 'M60 46h4M62 44v4'],
        ['rule', 'M100 6L63 43'],
    ],
    // The plate fractured through: the crack runs top to bottom in red, the halves no longer one part.
    error: [
        ['ink', 'M36 8h22M62 8h30v48l-8 8H62M58 64H28V16l8-8'],
        ['red', 'M58 8l5 12-9 9 8 10-7 9 6 8-2 8'],
        ['line', 'M38 28h12'],
        ['line', 'M70 48h14'],
    ],
    // A bar parted: two halves with their chamfered ends, the axis through both, the gap dimensioned.
    offline: [
        ['ink', 'M14 28h34l4 4v8l-4 4H14z'],
        ['ink', 'M106 28H72l-4 4v8l4 4h34z'],
        ['line', 'M8 36h104'],
        ['rule', 'M52 56h16'],
        ['rule', 'M56 53l-4 3 4 3M64 53l4 3-4 3'],
    ],
    // The finished part: the plate, its bore, and the inspection tick stamped in the bore.
    done: [
        ['ink', 'M36 8h56v48l-8 8H28V16z'],
        ['ink', 'M72 36a12 12 0 1 0-24 0a12 12 0 1 0 24 0'],
        ['rule', 'M54 36l4 4 9-9'],
        ['line', 'M36 20h8'],
        ['line', 'M76 52h8'],
    ],
    // The part under its clasp: the body with its chamfers, the shackle over it, the key bore.
    locked: [
        ['ink', 'M46 32h34v26l-6 6H40V38z'],
        ['rule', 'M48 32v-8a12 12 0 0 1 24 0v8'],
        ['ink', 'M63 46a3 3 0 1 0-6 0a3 3 0 1 0 6 0'],
        ['rule', 'M60 49v7'],
        ['line', 'M14 56h18M88 56h18'],
    ],
};
