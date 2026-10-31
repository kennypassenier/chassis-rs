// The HUD set of drawings.
/** @typedef {import('./types.js').ArtKind} ArtKind */
/** @typedef {import('./types.js').ArtStroke} ArtStroke */

/**
 * Cyberpunk's set, the HUD [kpadopt4]: every drawing is the system looking at a holo card. The card is a plate cut at its
 * dossier corner and its foot; scan lines are faint; the reticle (four corner brackets, the acting stroke in signal
 * yellow) is the system targeting; cyan reads out; red is the alarm. In a 120 by 72 box.
 * @type {Record<ArtKind, ArtStroke[]>}
 */
export const HUD = {
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
