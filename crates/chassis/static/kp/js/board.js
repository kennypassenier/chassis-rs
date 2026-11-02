// The board: lanes of cards a person moves between [habits-1101; the Habits todo app's Boards page, where a lane is a tag].
//
// The editable counterpart of the read-only pipeline (js/pipeline.js), built from parts the package has: every lane is dressed as
// the pipeline's lane (its plate, its name and its exact count, painted by every theme as its own), and its cards stand in a
// reorder list (js/structure.js) whose group is the board's, so a card moves along a lane and between lanes by pointer and by
// keyboard (← → on its handle), said in words, reported as `kp-reorder` with `fromList` / `toList` (the lanes' keys).
//
//   <section class="kp-board" data-kp-board aria-label="Weekly review">
//     <section data-kp-board-lane="todo" data-kp-board-label="To do" data-kp-tone="1" data-kp-board-limit="5">
//       <ul data-kp-reorder> <li data-kp-item="t1">…<button data-kp-handle>…</button>…</li> … </ul>
//     </section>
//     …
//   </section>
//
// The cards are the page's own (a task row, a kp card): the board only arranges them. Per lane:
//   data-kp-board-lane    its key, reported as `fromList` / `toList`
//   data-kp-board-label   its name on the plate (and on its tab)
//   data-kp-board-limit   a work-in-progress limit: the count reads "4 / 3", and a lane past it takes the pipeline's failing-stage
//                         look with "Over the limit" in words (said once when it goes over); nothing is refused
//   data-kp-tone          1 to 5, the lane's chart colour, as on the pipeline
// An empty lane says where a card can go and stays a drop target.
//
// Narrow (under 40rem of the board's own width), `data-kp-board-narrow` [uxtouch1101, Kenny 2026-11-01: "one column with a switcher"]:
//   tabs (default)     one lane at a time under a switcher: a button per lane with its name over its exact count ("2 / 2" with a
//                      limit, on the destructive plate past it), wrapping onto whole tracks, never sideways; ← → Home End move
//                      between the buttons (a tablist), the lane follows. A card dragged over a button opens that lane
//   scroll             the lanes side by side in the board's own box, which scrolls sideways (a lane at 85% of the width, snapping)
//
// Move to [uxtouch1101]: a card whose ⋯ menu the page filled (setMenu, as js/task-row.js does) gets a "Move to" group in front of
// the page's entries, one entry per other lane with what it holds now; its context menu (`data-kp-context-menu="inner"`) shows
// the same. A pick sends the card to the end of that lane: said in words, reported as `kp-reorder` with `fromList` / `toList`, and
// a narrow board keeps showing the lane the reader works in (the focus goes to the card that took the moved card's place).
// boardMoveGroup(el, card) gives the group to a page that builds its own menu; moveBoardCard(el, card, lane) moves from the page;
// `data-kp-board-move="off"` leaves every menu alone. Dragging is unchanged on a wide board.
//
// States: setBoardState(el, state, words): `loading` lays the data table's busy card over the lanes; `empty` and `error` put the
// package's plate over the whole board (`error` with Try again, `kp-board-retry`). `kp-board-lane` `{ lane, source }` fires when a
// narrow board with tabs shows another lane. Words are in the dictionary (`board…`).
//
// Each board is one Board controller (js/board/controller.js over js/board/lanes.js, on js/controller.js).

import { attachAll, controllerOf } from './controller.js';
import { Board } from './board/controller.js';
import { BOARD } from './board/values.js';

export { BOARD, BOARD_LANE_EVENT, BOARD_RETRY_EVENT, MOVE_PREFIX as BOARD_MOVE_PREFIX } from './board/values.js';

/** @typedef {'loading' | 'ready' | 'empty' | 'error'} BoardState */
/** @typedef {{ strings?: Partial<import('./strings.js').Strings> }} BoardOptions */

/**
 * Attach every board under `root` (the root itself included).
 * @param {ParentNode} [root]
 * @param {BoardOptions} [options]
 * @returns {() => void} detach
 */
export function attachBoards(root = document, options = {}) {
    return attachAll(root, BOARD, Board, options);
}

/**
 * The board as a whole: `loading` (the busy card over the lanes), `ready`, `empty` (the plate over the board, `words` its heading)
 * or `error` (the plate with Try again, `words` the reason).
 * @param {Element} el
 * @param {BoardState} state
 * @param {string} [words]
 */
export function setBoardState(el, state, words = '') {
    controllerOf(el, Board)?.setState(state, words);
}

/**
 * Show a lane of a narrow board under its switcher (on a wide board every lane shows already).
 * @param {Element} el
 * @param {string} lane the lane's key
 */
export function showBoardLane(el, lane) {
    controllerOf(el, Board)?.select(lane, 'page');
}

/**
 * Count the lanes again after the page changed a limit or a label (the counts follow the cards by themselves).
 * @param {Element} el
 */
export function recountBoard(el) {
    controllerOf(el, Board)?.count();
}

/**
 * The "Move to" group for a card of the board, for a page that builds the card's menu itself (setContextMenu with a function):
 * one entry per other lane, its value `kp-board-move:<lane>`; a pick of it anywhere in the board moves the card.
 * @param {Element} el the board
 * @param {HTMLElement} card
 * @returns {import('./menu-button.js').MenuGroup | null} null when there is no other lane
 */
export function boardMoveGroup(el, card) {
    return controllerOf(el, Board)?.moveGroup(card) ?? null;
}

/**
 * Send a card to the end of a lane, as a "Move to" pick does.
 * @param {Element} el the board
 * @param {HTMLElement} card
 * @param {string} lane the lane's key
 * @returns {boolean} whether it moved
 */
export function moveBoardCard(el, card, lane) {
    return controllerOf(el, Board)?.move(card, lane) ?? false;
}
