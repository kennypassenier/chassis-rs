// Drawings for an empty state, in the theme's own hand [kpadopt4; homelab's `drawing()` and `nx-art`].
//
//   <div class="kp-empty" data-kp-art="none">
//       <p class="kp-empty__title">No applications yet</p> …
//   </div>
//
// attachArt() puts a small line drawing at the top of every element with
// `data-kp-art`: what kind of emptiness it is, drawn the way the theme draws.
// The kinds:
//
//   none      nothing here yet
//   nomatch   nothing matched the search or the filter
//   error     it could not be read
//   offline   the connection is gone
//   done      all clear, nothing left to do
//   locked    there is something, and this reader may not see it
//
// A drawing is a picture only (`aria-hidden`): the title and the sentence of
// the empty state carry the meaning. Each theme draws its own set: the svg
// holds every set this package has, one `<g data-kp-art-set>` each, and the
// theme's register shows its own (`.kp-art` is hidden until a register shows
// it), so a theme switch needs no script and a theme without a set shows no
// drawing rather than another theme's. Formal's set is the ledger: a page of
// ruled lines, an entry struck through in red ink, the account closed with the
// double rule. Every stroke is ruled in on arrival, top down, by the register.
//
//   data-kp-art-size="sm" | "lg"   5rem or 10rem wide instead of 7.5rem
//
// Nothing runs on import; attachArt(root) returns a detach that takes the
// drawings out again.

/** An element that gets a drawing. */
export const ART = '[data-kp-art]';
/** The kinds a drawing can show. */
export const ART_KINDS = /** @type {const} */ (['none', 'nomatch', 'error', 'offline', 'done', 'locked']);

/**
 * @typedef {'none' | 'nomatch' | 'error' | 'offline' | 'done' | 'locked'} ArtKind
 * @typedef {'rule' | 'line' | 'ink' | 'red'} ArtInk the stroke's colour: the theme's acting colour, a faint ruled line, the page's ink, the destructive ink
 * @typedef {[ArtInk, string]} ArtStroke an ink and an SVG path, drawn in that order
 */

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Formal's set, the ledger [G7, G8, G19]: every drawing is something a clerk does to a ledger page. The page is a hairline
 * frame with the double rule at its head; its lines are faint ruled lines; what acts is a navy rule; what needs the eye is
 * red ink. In a 120 by 72 box, strokes listed top down, the order they are ruled in.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
const LEDGER = {
    // An open page, ruled and blank, the pen's tick waiting at the first line.
    none: [
        ['ink', 'M26 8h68v56H26z'],
        ['rule', 'M30 16h60'],
        ['rule', 'M30 19h60'],
        ['line', 'M30 29h60'],
        ['line', 'M30 38h60'],
        ['line', 'M30 47h60'],
        ['line', 'M30 56h60'],
        ['rule', 'M33 25v4'],
    ],
    // The page searched: its lines with no entry under them, and the reading glass over its foot.
    nomatch: [
        ['ink', 'M20 8h64v56H20z'],
        ['rule', 'M24 16h56'],
        ['rule', 'M24 19h56'],
        ['line', 'M24 29h56'],
        ['line', 'M24 38h56'],
        ['line', 'M24 47h30'],
        ['ink', 'M86 44a12 12 0 1 0-24 0a12 12 0 1 0 24 0'],
        ['rule', 'M83 53l13 13'],
    ],
    // An entry struck through in red ink, ruled off along its start edge.
    error: [
        ['ink', 'M26 8h68v56H26z'],
        ['rule', 'M30 16h60'],
        ['rule', 'M30 19h60'],
        ['line', 'M30 29h60'],
        ['ink', 'M36 37c4-5 7 4 11-1s6 3 10-1 7 3 11 0 5 2 8 0'],
        ['red', 'M33 37.5h50'],
        ['red', 'M30 31v13'],
        ['line', 'M30 47h60'],
        ['line', 'M30 56h60'],
    ],
    // The double rule broken in its middle: the two halves of the account no longer meet.
    offline: [
        ['rule', 'M10 30h38'],
        ['rule', 'M10 34h38'],
        ['ink', 'M48 26v12'],
        ['rule', 'M72 30h38'],
        ['rule', 'M72 34h38'],
        ['ink', 'M72 26v12'],
        ['line', 'M56 32h8'],
        ['line', 'M10 48h100'],
    ],
    // The account closed: a column of figures, ruled under, and closed with the double rule.
    done: [
        ['ink', 'M26 8h68v56H26z'],
        ['line', 'M30 17h60'],
        ['ink', 'M70 17h16'],
        ['line', 'M30 26h60'],
        ['ink', 'M74 26h12'],
        ['line', 'M30 35h60'],
        ['ink', 'M66 35h20'],
        ['rule', 'M62 44h26'],
        ['rule', 'M62 47.5h26'],
        ['ink', 'M70 55h16'],
    ],
    // The ledger shut, its strap across the cover and the clasp closed on it.
    locked: [
        ['ink', 'M30 10h60v52H30z'],
        ['ink', 'M36 10v52'],
        ['rule', 'M30 36h60'],
        ['ink', 'M54 31h12v10H54z'],
        ['rule', 'M57 31v-4a3 3 0 0 1 6 0v4'],
    ],
};

/**
 * Dark's set, the spectrum [kpadopt4]: every drawing is the instrument's screen. The screen is a frame cut on two opposite
 * corners with its grid faint; the baseline is the line's track; the film (the acting stroke) is what the spectral line has
 * laid; a bracket closes on a reading; coral is the one colour that is meaning. In a 120 by 72 box.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
const SPECTRUM = {
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

/**
 * Cyberpunk's set, the HUD [kpadopt4]: every drawing is the system looking at a holo card. The card is a plate cut at its
 * dossier corner and its foot; scan lines are faint; the reticle (four corner brackets, the acting stroke in signal
 * yellow) is the system targeting; cyan reads out; red is the alarm. In a 120 by 72 box.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
const HUD = {
    // An empty holo card, the reticle standing open at its middle, the cursor waiting.
    none: [
        ['ink', 'M22 8h64l12 12v44H34L22 52z'],
        ['line', 'M30 22h8'],
        ['line', 'M30 28h4'],
        ['rule', 'M48 30h6'],
        ['rule', 'M48 30v6'],
        ['rule', 'M72 30h-6'],
        ['rule', 'M72 30v6'],
        ['rule', 'M48 46h6'],
        ['rule', 'M48 46v-6'],
        ['rule', 'M72 46h-6'],
        ['rule', 'M72 46v-6'],
        ['line', 'M57 38h6'],
    ],
    // The reticle hunting wide and finding nothing, a read-out prefix beside it.
    nomatch: [
        ['ink', 'M22 8h64l12 12v44H34L22 52z'],
        ['rule', 'M40 24h10'],
        ['rule', 'M40 24v10'],
        ['rule', 'M80 24h-10'],
        ['rule', 'M80 24v10'],
        ['rule', 'M40 52h10'],
        ['rule', 'M40 52v-10'],
        ['rule', 'M80 52h-10'],
        ['rule', 'M80 52v-10'],
        ['line', 'M56 38h8'],
        ['line', 'M60 34v8'],
    ],
    // The card torn: its top half displaced sideways, two bands of red between the halves.
    error: [
        ['ink', 'M28 8h64l12 12v10H28z'],
        ['red', 'M14 34h34'],
        ['red', 'M72 38h34'],
        ['ink', 'M22 42h64v22H34L22 52z'],
        ['line', 'M40 54h24'],
    ],
    // The uplink: four bars of signal rising, cut through by one red stroke, nothing diagonal in the card.
    offline: [
        ['ink', 'M44 54v-6'],
        ['ink', 'M54 54v-14'],
        ['ink', 'M64 54v-22'],
        ['ink', 'M74 54v-30'],
        ['red', 'M30 62h60'],
        ['line', 'M30 14h20'],
        ['line', 'M70 14h20'],
    ],
    // Target locked and cleared: the reticle closed tight on a tick.
    done: [
        ['ink', 'M22 8h64l12 12v44H34L22 52z'],
        ['rule', 'M44 26h8'],
        ['rule', 'M44 26v8'],
        ['rule', 'M76 26h-8'],
        ['rule', 'M76 26v8'],
        ['rule', 'M44 50h8'],
        ['rule', 'M44 50v-8'],
        ['rule', 'M76 50h-8'],
        ['rule', 'M76 50v-8'],
        ['ink', 'M53 39l5 5l10-11'],
    ],
    // A card behind the lock: the shackle, the notched body, the reticle's four corners in red.
    locked: [
        ['ink', 'M22 8h64l12 12v44H34L22 52z'],
        ['ink', 'M52 34v-6a8 8 0 0 1 16 0v6'],
        ['ink', 'M48 34h24v18H56l-8-8z'],
        ['red', 'M60 40v6'],
        ['line', 'M28 60h8'],
    ],
};

/**
 * Synthwave's set, the floor [kpadopt4]: the empty state already carries the striped sun on its horizon, so each drawing is
 * what stands on the floor under it, in neon tubes: the marquee's bulbs (what waits), a ring (what is looked for or what
 * failed), the horizon's tube in two halves (what is cut), the lock on a shutter. Pink acts (the acting stroke), cyan
 * reads, red is a tube that failed; the floor's lines close on a point, nothing else runs diagonal. In a 120 by 72 box.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
const HORIZON = {
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

/**
 * Pastel's set, the sticker sheet [G7, G9, G18]: every drawing is something done to a page of a planner. A sticker is
 * white paper with its second pass, a flat sky shape 5 units off register (`line`, filled); the paper is `ink` (a closed
 * shape, filled with the card colour, outlined in plum); what is drawn on it is `rule` (plum, open); a mistake is `red`.
 * The last stroke of every drawing is the washi tape that holds it (the register fills it mint). In a 120 by 72 box,
 * strokes listed in the order they are stuck on.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
const STICKERS = {
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

/**
 * Forest's set, the field kit [G7, G14]: every drawing is something on a ranger's map or in the wood it describes. The
 * map sheet has the leaf corner (`ink`, the outline of a plate); what is drawn on it is the wood: contour lines are
 * `line`, the trail, a tree and a trig point are `rule` (the acting green), a blaze that marks a fault is `red`. In a 120
 * by 72 box, strokes listed from the ground up, the order they grow in.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
const FIELD_KIT = {
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

/**
 * Blueprint's set, the working drawing [G6, G13, G16]: every drawing is something a draughtsman does on a sheet. The part
 * is the finished line (`ink`), what the pen draws now is cyan (`rule`), the construction and the hatch are faint (`line`),
 * a flagged fault is `red`. In a 120 by 72 box, strokes listed in the order the pen draws them.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
const DRAWING = {
    // A part not drawn yet: its four corner marks, the centre lines and the compass circle round the centre.
    none: [
        ['line', 'M18 36h84'],
        ['line', 'M60 8v56'],
        ['ink', 'M26 20V10h10'],
        ['ink', 'M84 10h10v10'],
        ['ink', 'M94 52v10H84'],
        ['ink', 'M36 62H26V52'],
        ['rule', 'M72 36a12 12 0 1 0-24 0a12 12 0 1 0 24 0'],
        ['ink', 'M30 68h60M30 65v6M90 65v6'],
    ],
    // The circle searched: a leader from it to a note that holds nothing.
    nomatch: [
        ['line', 'M16 36h60'],
        ['line', 'M46 10v52'],
        ['ink', 'M62 36a16 16 0 1 0-32 0a16 16 0 1 0 32 0'],
        ['rule', 'M58 25l16-12h20'],
        ['ink', 'M94 8h18v10H94z'],
    ],
    // The part with its failure flagged: the filled triangle in red, the part's outline unfinished at one corner.
    error: [
        ['ink', 'M30 14h60v40H30z'],
        ['line', 'M60 14v40M30 34h60'],
        ['red', 'M60 20l11 20H49z'],
        ['red', 'M60 26v7M60 36v1'],
        ['rule', 'M30 64h60M30 61v6M90 61v6'],
    ],
    // Two parts on one centre line, and the break in it where they no longer meet.
    offline: [
        ['ink', 'M10 24h36v24H10z'],
        ['ink', 'M74 24h36v24H74z'],
        ['line', 'M4 36h6M46 36h6M68 36h6M110 36h6'],
        ['ink', 'M53 36l3-6 6 12 3-6'],
        ['rule', 'M10 56h36M10 53v6M46 53v6'],
        ['rule', 'M74 56h36M74 53v6M110 53v6'],
    ],
    // The section hatched and checked: the part is complete.
    done: [
        ['ink', 'M30 12h60v44H30z'],
        ['line', 'M30 56L74 12M44 56L88 12M60 56L90 26M30 38L56 12'],
        ['rule', 'M50 36l8 8 14-16'],
        ['ink', 'M30 64h60M30 61v6M90 61v6'],
    ],
    // The part held under a lock: hatched across, the padlock drawn on its centre.
    locked: [
        ['ink', 'M30 10h60v52H30z'],
        ['line', 'M30 62L82 10M30 40L60 10M52 62L90 24'],
        ['ink', 'M50 32h20v18H50z'],
        ['rule', 'M54 32v-6a6 6 0 0 1 12 0v6'],
        ['rule', 'M20 6h6M23 3v6M94 6h6M97 3v6'],
    ],
};

/**
 * Solstice's set, the low sun [kpadopt4]: every drawing is something the sun does on a horizon. The horizon is a faint line
 * and what is drawn comes up from it, so the strokes are listed from the foot upward, the order they rise in; the sun and
 * what acts is amber, the rays and the arc its path, what needs the eye a red sky. Round at every end.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
const LOW_SUN = {
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

/**
 * Brutalism's set, the slab [kpadopt4]: every drawing is a thing of weight on its footprint, drawn in the one ink line. A
 * slab is a square outline, its footprint the L of ground its hard shadow would fall on, and each stroke is listed in the
 * order it is set down: the ground first, then what falls on it. Nothing is round; a bolt is a small square; what is
 * wrong is taped off in red stripes.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
const SLAB = {
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

/**
 * Deco's set, the lobby's fan [kpadopt4]: every drawing is the fan, the deco gesture, in gold hairlines: closed it is a
 * pointed shape standing on its pivot (a lozenge) over the double rule, open it is ribs from that pivot with the leaf's arcs
 * across them. Strokes are listed from the centre outward, the order the inlay is drawn in, two at a time. The lozenge is
 * the jewel, the chevron the cut, ruby only where something broke.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
const FAN = {
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

/**
 * Nostromo's set, the console [kpadopt4]: every drawing is a vector the ship's computer writes on an amber screen, of the
 * hardware the case is made of: a cassette bay, a scope, a tape reel, a jack, a row of lamps, a key switch. The register
 * sets the drawing in dark glass: `rule` is the lit phosphor, `line` the dim trace, `ink` the cream of the case's own
 * markings, `red` the alarm. In a 120 by 72 box, strokes in the order the beam writes them, top down.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
const CONSOLE = {
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

/**
 * Titanium's set, the machined part [kpadopt4]: every drawing is a part on a machinist's drawing, cut from bar stock with the
 * chamfer at its top start and bottom end corners: a blank plate, a plate probed, a plate fractured, a bar cut in two, a
 * part with its bore inspected, a part under its clasp. `rule` is the bare tool edge, `line` the faint grain and centre
 * lines, `ink` the part's own outline, `red` the fracture. In a 120 by 72 box, strokes listed in the order they are cut.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
const MACHINED = {
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

/** Every set the package has, by the name a register shows. @type {Record<string, Record<ArtKind, ArtStroke[]>>} */
export const ART_SETS = {
    ledger: LEDGER,
    spectrum: SPECTRUM,
    hud: HUD,
    horizon: HORIZON,
    stickers: STICKERS,
    fieldkit: FIELD_KIT,
    drawing: DRAWING,
    lowsun: LOW_SUN,
    slab: SLAB,
    fan: FAN,
    nostromo: CONSOLE,
    titanium: MACHINED,
};

/** @param {string} value @returns {value is ArtKind} */
const isKind = (value) => /** @type {readonly string[]} */ (ART_KINDS).includes(value);

/**
 * The drawing for one kind: an svg with every set's group, hidden from a screen reader.
 * @param {Document} doc
 * @param {ArtKind} kind
 * @returns {SVGSVGElement}
 */
export function drawArt(doc, kind) {
    const svg = /** @type {SVGSVGElement} */ (doc.createElementNS(SVG, 'svg'));
    svg.setAttribute('class', 'kp-art');
    svg.setAttribute('viewBox', '0 0 120 72');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.dataset.kpArtKind = kind;
    for (const [name, set] of Object.entries(ART_SETS)) {
        const group = doc.createElementNS(SVG, 'g');
        group.setAttribute('data-kp-art-set', name);
        set[kind].forEach(([ink, d], i) => {
            const path = doc.createElementNS(SVG, 'path');
            path.setAttribute('d', d);
            path.setAttribute('pathLength', '1');
            path.setAttribute('class', `kp-art__${ink}`);
            // The order the strokes are ruled in, top down (through the CSSOM, which a strict style-src allows).
            path.style.setProperty('--kp-art-i', String(i));
            group.append(path);
        });
        svg.append(group);
    }
    return svg;
}

/**
 * Give every element with `data-kp-art` under `root` its drawing, and follow a change of the kind.
 * @param {ParentNode} [root]
 * @returns {() => void} detach: the drawings go
 */
export function attachArt(root = document) {
    const hosts = /** @type {HTMLElement[]} */ ([...(root instanceof Element && root.matches(ART) ? [root] : []), ...root.querySelectorAll(ART)]);
    /** @type {SVGSVGElement[]} */
    const made = [];
    const place = (/** @type {HTMLElement} */ host) => {
        host.querySelector(':scope > .kp-art')?.remove();
        const kind = host.dataset.kpArt ?? '';
        if (!isKind(kind)) return;
        const svg = drawArt(host.ownerDocument, kind);
        host.prepend(svg);
        made.push(svg);
    };
    for (const host of hosts) place(host);
    if (typeof MutationObserver === 'undefined' || hosts.length === 0)
        return () => {
            for (const svg of made) svg.remove();
        };
    const watch = new MutationObserver((records) => {
        for (const record of records) place(/** @type {HTMLElement} */ (record.target));
    });
    for (const host of hosts) watch.observe(host, { attributes: true, attributeFilter: ['data-kp-art'] });
    return () => {
        watch.disconnect();
        for (const svg of made) svg.remove();
    };
}
