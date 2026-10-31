// The pipeline: where each item stands, one lane per stage [kpadopt4; JobTracker's Overview `Pipeline`].
//
// A read-only board, not a drag-and-drop one: a lane per stage (draft, sent,
// interview, offer), each with its name and its exact count on a plate in the
// stage's colour, the share of all under it, and the items as cards. A lane
// marked `closed` (closed, no status) stands under the board across its whole
// width. The page gives the lanes and the cards; the board draws them in
// place, by id, so a refresh moves nothing that stayed.
//
//   <section class="kp-pipeline" data-kp-pipeline data-kp-pipeline-limit="4" aria-label="Applications by stage"></section>
//
//   setPipeline(el, {
//       lanes: [{ key: 'draft', label: 'Draft', tone: 1 }, …, { key: 'closed', label: 'Closed · no status', closed: true }],
//       cards: [{ id: 'a1', lane: 'sent', title: 'Frontend developer', sub: 'Acme', meta: '02/10/2026', mark: 'AC', href: '/d/a1' }],
//   });
//
//   lanes    side by side at one width each, as tall as the tallest; under
//            40rem of the board's own width they turn to rows
//   cards    a link (`href`) or a button; `mark` is the short sign in the
//            lane's colour, `sub` and `meta` the lines under the title; a
//            `dimmed` card is filtered out but kept in its place, and
//            setPipelineSelected() marks the one that is open
//   limit    `data-kp-pipeline-limit` cards per lane, the rest behind
//            “+N more” (a toggle, `aria-expanded`); the counts are exact
//   share    each lane's share of all cards under its plate, whole percent;
//            `data-kp-pipeline-share="false"` leaves it out
//   states   setPipelineState(el, state, words): `loading` keeps the lanes
//            and lays the data table's own loading card (js/busy-card.js)
//            over the board, the cards drawn once it has gone; `empty` and
//            `error` put the package's state plate over the whole board
//            (lanes included, none of their counts drawn) at the height the
//            board had [r1r2-1019]: `empty` says `words` or “Nothing on the
//            board yet.”, `error` “Could not read the board.” with `words` as
//            its reason and Try again (`kp-pipeline-retry`)
//   danger   a lane marked `danger: true` is a failing stage: its name plate
//            is the destructive status plate and it says “Needs attention”
//            in words as well [r1r2-1019]
//   names    a lane's name wraps and never ends in an ellipsis; the plates of
//            the lanes on a board share one height (a subgrid)
//   keys     one tab stop: ← → to the neighbouring lane (the same place, or
//            its last card), ↑ ↓ along a lane, Home and End to a lane's first
//            and last; Enter follows the link or presses the button
//
// Events (bubbling, on the board): `kp-pipeline-open` `{ id, card, source }`
// when a card is opened (a link is still followed), `kp-pipeline-retry` from
// Try again, `kp-pipeline-more` `{ lane, open }` when a lane shows more or fewer.
//
// Each board is one PipelineBoard controller (js/pipeline/controller.js over core.js, lanes.js and view.js, on js/controller.js); the parts are
// listed in js/README.md.

import { attachAll, controllerOf } from './controller.js';
import { PipelineBoard } from './pipeline/controller.js';
import { PIPELINE } from './pipeline/values.js';

export { PIPELINE, PIPELINE_OPEN_EVENT, PIPELINE_RETRY_EVENT, PIPELINE_MORE_EVENT } from './pipeline/values.js';

/**
 * @typedef {{ key: string, label: string, tone?: 1 | 2 | 3 | 4 | 5, closed?: boolean, danger?: boolean }} PipelineLane
 * @typedef {object} PipelineCard
 * @property {string} id
 * @property {string} lane the lane's key
 * @property {string} title
 * @property {string} [sub] the line under the title (a company)
 * @property {string} [meta] a short last line (a date)
 * @property {string} [mark] a short sign, two letters, in the lane's colour
 * @property {string} [href] a link; without it the card is a button
 * @property {boolean} [dimmed] filtered out, kept in its place
 * @typedef {'loading' | 'ready' | 'empty' | 'error'} PipelineState
 * @typedef {import('./strings.js').Strings} Strings
 * @typedef {{ strings?: Partial<Strings> }} PipelineOptions
 * @typedef {{ el: HTMLElement, strings: Strings, lanes: PipelineLane[], cards: PipelineCard[], state: PipelineState,
 *   words: string, open: Set<string>, selected: string | null, active: string | null, board: HTMLElement,
 *   closed: HTMLElement, plate: HTMLElement, plateKey: string, live: HTMLElement,
 *   nodes: Map<string, HTMLElement>, busy: import('./busy-card.js').BusyCard | null, leaving: Promise<void> | null, drawn: boolean }} PipelineModel
 */

/**
 * Attach every board under `root`.
 * @param {ParentNode} [root]
 * @param {PipelineOptions} [options]
 * @returns {() => void} detach
 */
export function attachPipelines(root = document, options = {}) {
    return attachAll(root, PIPELINE, PipelineBoard, options);
}

/**
 * The lanes and the cards. Cards are kept by id, so a refresh keeps a focused card and moves nothing that stayed. A board
 * that was loading is ready from here on. `lanes` may be left out after the first call.
 * @param {Element} el
 * @param {{ lanes?: PipelineLane[], cards: PipelineCard[] }} data
 */
export function setPipeline(el, { lanes, cards }) {
    controllerOf(el, PipelineBoard)?.setData(lanes, cards);
}

/**
 * The board as a whole: `loading` (the lanes kept, the table's loading card over them), `ready`, `empty` (the state plate
 * over the whole board, `words` its heading) or `error` (the plate with Try again, `words` the reason under its heading).
 * @param {Element} el
 * @param {PipelineState} state
 * @param {string} [words]
 */
export function setPipelineState(el, state, words = '') {
    controllerOf(el, PipelineBoard)?.setState(state, words);
}

/**
 * Mark the card that is open (`aria-current`), or none.
 * @param {Element} el
 * @param {string | null} id
 */
export function setPipelineSelected(el, id) {
    controllerOf(el, PipelineBoard)?.setSelected(id);
}
