// Spectrum's set of drawings.
/** @typedef {import('./types.js').ArtKind} ArtKind */
/** @typedef {import('./types.js').ArtStroke} ArtStroke */

/**
 * Dark's set, the spectrum [kpadopt4]: every drawing is the instrument's screen. The screen is a frame cut on two opposite
 * corners with its grid faint; the baseline is the line's track; the film (the acting stroke) is what the spectral line has
 * laid; a bracket closes on a reading; coral is the one colour that is meaning. In a 120 by 72 box.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
export const SPECTRUM = {
    // An empty screen: the grid, the baseline, the line waiting at its start edge.
    none: [
        ['ink', 'M22 8h66l10 10v46H32L22 54z'],
        ['line', 'M34 22h52'],
        ['line', 'M34 50h52'],
        ['line', 'M60 14v44'],
        ['line', 'M34 36h52'],
        ['rule', 'M34 30v12'],
    ],
    // The spectrum read and no line found: the baseline flat, a pair of brackets round nothing.
    nomatch: [
        ['ink', 'M22 8h66l10 10v46H32L22 54z'],
        ['line', 'M34 36h14'],
        ['line', 'M72 36h14'],
        ['ink', 'M54 24h-6v24h6'],
        ['ink', 'M66 24h6v24h-6'],
        ['rule', 'M60 31v10'],
    ],
    // The line laid up to a point and cut there in coral: the rest of the track dark.
    error: [
        ['ink', 'M22 8h66l10 10v46H32L22 54z'],
        ['rule', 'M34 36h20'],
        ['red', 'M58 24l8 24'],
        ['red', 'M66 24l-8 24'],
        ['line', 'M70 36h16'],
    ],
    // The track broken in two with the brackets turned away from each other: nothing crosses the gap.
    offline: [
        ['line', 'M10 36h26'],
        ['ink', 'M44 26h-6v20h6'],
        ['ink', 'M76 26h6v20h-6'],
        ['line', 'M84 36h26'],
        ['rule', 'M52 36h4'],
        ['rule', 'M64 36h4'],
    ],
    // The pass finished: the whole track laid in film, the bracket closed on its end.
    done: [
        ['ink', 'M22 8h66l10 10v46H32L22 54z'],
        ['line', 'M34 22h52'],
        ['line', 'M34 50h52'],
        ['rule', 'M34 36h46'],
        ['ink', 'M82 26h6v20h-6'],
        ['rule', 'M46 54l6 5l12-12'],
    ],
    // The screen behind a plate: a shackle, the plate cut on its corners, the keyhole in film.
    locked: [
        ['ink', 'M22 8h66l10 10v46H32L22 54z'],
        ['ink', 'M52 34v-7a8 8 0 0 1 16 0v7'],
        ['ink', 'M48 34h24v18H54l-6-6z'],
        ['rule', 'M60 39v8'],
    ],
};
