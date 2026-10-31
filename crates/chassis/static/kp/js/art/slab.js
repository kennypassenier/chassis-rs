// The slab set of drawings.
/** @typedef {import('./types.js').ArtKind} ArtKind */
/** @typedef {import('./types.js').ArtStroke} ArtStroke */

/**
 * Brutalism's set, the slab [kpadopt4]: every drawing is a thing of weight on its footprint, drawn in the one ink line. A
 * slab is a square outline, its footprint the L of ground its hard shadow would fall on, and each stroke is listed in the
 * order it is set down: the ground first, then what falls on it. Nothing is round; a bolt is a small square; what is
 * wrong is taped off in red stripes.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
export const SLAB = {
    // The footprint and the slab that stands on it, nothing on the slab yet.
    none: [
        ['line', 'M34 62h54V20'],
        ['ink', 'M28 12h54v44H28z'],
    ],
    // The footprint with nothing on it and the slab lifted off, up and to the left, where it was.
    nomatch: [
        ['line', 'M40 62h56V20'],
        ['ink', 'M18 6h54v44H18z'],
        ['rule', 'M44 56v-2'],
        ['rule', 'M70 56v-2'],
    ],
    // The slab taped off: three red stripes across it.
    error: [
        ['line', 'M34 62h54V20'],
        ['ink', 'M28 12h54v44H28z'],
        ['red', 'M28 34L50 12'],
        ['red', 'M28 56L72 12'],
        ['red', 'M50 56l32-32'],
    ],
    // Two slabs on their ground with the cable between them cut through.
    offline: [
        ['line', 'M6 62h108'],
        ['ink', 'M6 20h34v36H6z'],
        ['ink', 'M80 20h34v36H80z'],
        ['rule', 'M40 38h12'],
        ['rule', 'M68 38h12'],
        ['red', 'M54 30v16'],
        ['red', 'M66 30v16'],
    ],
    // The slab set down on its footprint and stamped with a tick.
    done: [
        ['line', 'M34 62h54V20'],
        ['ink', 'M28 12h54v44H28z'],
        ['rule', 'M42 34l10 10 18-22'],
    ],
    // The slab bolted shut: four square bolts, a padlock on it.
    locked: [
        ['line', 'M32 64h66V16'],
        ['ink', 'M26 8h68v52H26z'],
        ['ink', 'M44 32h32v20H44z'],
        ['rule', 'M50 32v-6a10 10 0 0 1 20 0v6'],
        ['ink', 'M31 13h5v5h-5z'],
        ['ink', 'M84 13h5v5h-5z'],
        ['ink', 'M31 50h5v5h-5z'],
        ['ink', 'M84 50h5v5h-5z'],
    ],
};
