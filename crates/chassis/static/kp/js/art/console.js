// Nostromo's console set of drawings.
/** @typedef {import('./types.js').ArtKind} ArtKind */
/** @typedef {import('./types.js').ArtStroke} ArtStroke */

/**
 * Nostromo's set, the console [kpadopt4]: every drawing is a vector the ship's computer writes on an amber screen, of the
 * hardware the case is made of: a cassette bay, a scope, a tape reel, a jack, a row of lamps, a key switch. The register
 * sets the drawing in dark glass: `rule` is the lit phosphor, `line` the dim trace, `ink` the cream of the case's own
 * markings, `red` the alarm. In a 120 by 72 box, strokes in the order the beam writes them, top down.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
export const CONSOLE = {
    // An empty cassette bay: the case, the label strip, the window with its two bare hubs. Nothing wound on them.
    none: [
        ['ink', 'M26 12h68a4 4 0 0 1 4 4v38a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z'],
        ['line', 'M30 18h60v10H30z'],
        ['ink', 'M38 34h44v16H38z'],
        ['rule', 'M54 42a4 4 0 1 0-8 0a4 4 0 1 0 8 0'],
        ['rule', 'M74 42a4 4 0 1 0-8 0a4 4 0 1 0 8 0'],
    ],
    // The scope searched: its rings and crosshair, the sweep line, and no blip anywhere.
    nomatch: [
        ['ink', 'M86 36a26 26 0 1 0-52 0a26 26 0 1 0 52 0'],
        ['line', 'M73 36a13 13 0 1 0-26 0a13 13 0 1 0 26 0'],
        ['line', 'M60 10v52'],
        ['line', 'M34 36h52'],
        ['rule', 'M60 36l18-17'],
    ],
    // The tape off its reel: the reel stands, the tape runs out of it in red and tangles.
    error: [
        ['ink', 'M54 34a16 16 0 1 0-32 0a16 16 0 1 0 32 0'],
        ['line', 'M42 34a4 4 0 1 0-8 0a4 4 0 1 0 8 0'],
        ['red', 'M54 34c10 0 10 18 20 18s10-30 20-30 10 26 16 22'],
        ['red', 'M110 44c3 8-5 12-9 6'],
    ],
    // The jack and its socket, drawn apart: the plug on its cable, the socket on its own, a spark in the gap.
    offline: [
        ['line', 'M8 36h22'],
        ['ink', 'M30 28h16v16H30z'],
        ['ink', 'M46 31h8'],
        ['ink', 'M46 41h8'],
        ['rule', 'M58 36l2-4 3 8 2-4'],
        ['ink', 'M74 26h16v20H74z'],
        ['line', 'M78 31h5'],
        ['line', 'M78 41h5'],
        ['line', 'M90 36h22'],
    ],
    // A row of five lamps, every one lit, and the check under them.
    done: [
        ['ink', 'M28 26a6 6 0 1 0-12 0a6 6 0 1 0 12 0'],
        ['ink', 'M47 26a6 6 0 1 0-12 0a6 6 0 1 0 12 0'],
        ['ink', 'M66 26a6 6 0 1 0-12 0a6 6 0 1 0 12 0'],
        ['ink', 'M85 26a6 6 0 1 0-12 0a6 6 0 1 0 12 0'],
        ['ink', 'M104 26a6 6 0 1 0-12 0a6 6 0 1 0 12 0'],
        ['rule', 'M23 26h-2M42 26h-2M61 26h-2M80 26h-2M99 26h-2'],
        ['line', 'M12 40h96'],
        ['rule', 'M50 52l7 7 14-15'],
    ],
    // The key switch: the plate with its four screws, the cylinder, the key slot, the label tape under it.
    locked: [
        ['ink', 'M32 8h56a4 4 0 0 1 4 4v48a4 4 0 0 1-4 4H32a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z'],
        ['line', 'M37 16a1.5 1.5 0 1 0-3 0a1.5 1.5 0 1 0 3 0M86 16a1.5 1.5 0 1 0-3 0a1.5 1.5 0 1 0 3 0'],
        ['ink', 'M70 30a10 10 0 1 0-20 0a10 10 0 1 0 20 0'],
        ['rule', 'M60 24v12'],
        ['line', 'M44 50h32'],
    ],
};
