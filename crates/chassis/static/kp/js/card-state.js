// A card in four data states [kpadopt4-rows; JobTracker's `Card` with
// `state` and `body={filled, empty, loading, error}`, homelab's `failBox`].
//
// A card that shows data read from somewhere is in one of four states, and
// it keeps its place and its size in all of them (UI principles: "loading,
// empty, error and filled take the same footprint"):
//
//   <section class="kp-card" data-kp-state="loading" aria-labelledby="files-t">
//       <div class="kp-card__header">
//           <h2 class="kp-card__title" id="files-t">Files</h2>
//           <div class="kp-card__actions">…the card's tools…</div>
//       </div>
//       <p class="kp-card__body">Everything in this application's folder.</p>
//       <div class="kp-card__stage">
//           <div class="kp-card__data">…the data, drawn by the page…</div>
//       </div>
//   </section>
//
// The stage holds the data and, on top of it in the same grid cell, the
// state's note, so a state never moves the header, the footer or the card
// beside it:
//
//   loading  the data table's own loading card (js/busy-card.js) centred over
//            the stage, the data under it dimmed and inert (stale data stays
//            readable while it is read again); the stage keeps at least
//            `--kp-card-stage-min` so a first load has room for the card;
//   empty    the package's empty state (`.kp-empty`) as the state plate
//            (`.kp-stateplate`) filling the stage: an optional picture (`art`),
//            the title at heading size, a sentence and an optional action;
//   error    the destructive alert as the same plate: what could not be read,
//            why, and a normal-size Try again, which fires `kp-card-retry`
//            on the card;
//   ready    the data.
//
// In empty and error the data keeps its room (hidden, not removed), so a
// failed refresh of a full card does not collapse it; clear the data when it
// no longer holds and the stage falls back to its least height. The page decides what
// a retry is (usually: set loading, read again, set ready). When the focused
// Try again goes with its state, the focus moves to the stage, so the
// keyboard keeps its place.
//
// setCardState(card, state, { words, title, text, action }) is the way in for
// a page that draws with the DOM; a framework that writes `data-kp-state`
// itself is followed by attachCardStates(root), and may render its own note
// inside `.kp-card__state` (the module then leaves its content alone). Every
// word the module adds is in js/strings.js.

// The module is a facade [closure-pattern B, Kenny 2026-10-30]: the names, the parts, the note, the per-card sync (CardSync, which also
// serves setCardState() before any attach) and the CardStateController live in js/card-state/, listed in js/README.md.

import { attachAll } from './controller.js';
import { CardStateController } from './card-state/controller.js';
import { CARD_STATE } from './card-state/values.js';

export { CARD_STATE, CARD_STATES, CARD_STATE_EVENT, CARD_RETRY_EVENT } from './card-state/values.js';
export { setCardState } from './card-state/sync.js';

/**
 * @typedef {'loading' | 'empty' | 'error' | 'ready'} CardState
 * @typedef {object} CardStateOptions
 * @property {string} [words] what the loading card says under its spinner (default `cardLoading`, or the card's `data-kp-loading-words`)
 * @property {string} [title] the empty or error note's first line, in bold: "No appointments yet", "Could not list the files"
 * @property {string} [text] its sentence: why, or what fills it
 * @property {Node | readonly Node[] | null} [action] a button or link under an empty note ("Add an appointment"), or several (an array, or a fragment): they lie on the plate's own action row; an error note always has Try again
 * @property {boolean} [retry] false leaves Try again out of an error note (a read the page cannot repeat)
 * @property {Node | string | null} [art] a picture over the note's title, empty or error: a node (an inline SVG, an icon) or a glyph; aria-hidden either way
 */

/**
 * Sync every card with a `data-kp-state` under `root`, follow the attribute
 * later, and turn a press on Try again into `kp-card-retry`. A card rendered
 * after this ran is attached by calling it on that subtree.
 * @param {ParentNode} [root]
 * @returns {() => void} detach: stops following; a loading card's busy card is taken out
 */
export function attachCardStates(root = document) {
    return attachAll(root, CARD_STATE, CardStateController);
}
