// The measures of the marks a full chart draws.

/** The marks' measures, in SVG pixels unless named otherwise. */
export const MARKS = Object.freeze({
    /** A column's share of the room its neighbours leave, its narrowest and widest, and the slots a lone column divides the plot in. */
    columnShare: 0.76,
    columnMin: 1.5,
    columnMax: 48,
    columnSlots: 12,
    /** A lone reading's dot, a run's ring, and a snapped dot (hot and not). */
    dot: 3.5,
    ring: 4.25,
    snapHot: 4.5,
    /** The median's words: their rise above the line, their drop below it when there is no room above, the room kept under the top, their inset from the end. */
    labelRise: 6,
    labelDrop: 14,
    labelRoom: 8,
    labelInset: 4,
    /** An event mark's rise above the plot, its hit circle and its dot. */
    markRise: 9,
    markHit: 10,
    markDot: 5,
    /** The edge counts' inset from the plot's ends and their rise above it. */
    edgeInset: 2,
    edgeRise: 5,
});
