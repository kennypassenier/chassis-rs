// The swipe row [parts-1102; the Habits todo app's task rows on a phone: right is done, left is tomorrow].
//
//   <ul class="kp-task-list" data-kp-swipe data-kp-swipe-start="done:Done:success" data-kp-swipe-end="tomorrow:Tomorrow:info">
//       <li class="kp-task-row" data-kp-row-key="t1" data-kp-label="Buy milk">…</li>
//   </ul>
//
// A finger that slides a row sideways moves the row's parts and shows, in the room they leave, the action's plate in its tone
// with its words: `data-kp-swipe-start` at the start edge (swiping toward the end, right in a left-to-right page),
// `data-kp-swipe-end` at the end edge. Each is `key:Words:tone`, the tone one of success, info, warning, destructive, primary.
// Past the threshold (35 % of the row, at most 140 px) the plate arms (its words bold, its edge marked) and a phone ticks once;
// let go there and the row fires `kp-swipe { key, action, row }` (the key is the row's `data-kp-swipe-key`, `data-kp-row-key`,
// `data-kp-item` or id); let go before it and nothing happens. Either way the row slides home in the theme's own time and curve,
// at once under reduced motion. The click the lift would send is swallowed. A side with no action only gives a little.
//
// Never in the way: touch only (a mouse keeps its click, drag and text selection) unless `data-kp-swipe-pointers="any"`; the move
// locks as a swipe after 12 px sideways and 1.5 times more sideways than up or down, and rows carry `touch-action: pan-y` on a
// coarse pointer, so a vertical move stays the page's scroll; a press on the row's check box, handle, icon buttons or menu button
// keeps its own meaning (and `data-kp-swipe-ignore` marks more); a long press needs a still finger, so it never becomes a swipe.
// `data-kp-swipe="off"` on the list (a person's setting) or `data-kp-swipe-off` on a row stops it.
//
// A swipe is a shortcut, never the only way: give every action the row's ⋯ menu as well (js/menu-button.js, as js/task-row.js
// draws it), so a keyboard, a mouse and a screen reader reach it; the page's own Undo toast follows the action.
//
// Nothing runs on import; attachSwipes(root) returns a detach.

import { attachAll } from './controller.js';
import { SWIPE } from './swipe/constants.js';
import { SwipeControl } from './swipe/controller.js';

export { SWIPE, SWIPE_EVENT } from './swipe/constants.js';

/**
 * Wire every swiping list under `root` (the root itself included). Idempotent.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachSwipes(root = document) {
    return attachAll(root, SWIPE, SwipeControl);
}
