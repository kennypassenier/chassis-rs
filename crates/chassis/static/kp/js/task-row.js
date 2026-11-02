// The task row [habits-1101; the Habits todo app's rows on every list, the Planner's days and the board's cards].
//
// A list row with a check for done, a title, a line of facts under it and fixed action columns, built from the package's parts:
//
//   ┌────┬────┬──────────────────────────────────┬────┬────┐
//   │ ⠿  │ ☐  │ Write the quarterly report       │ ▶  │ ⋯  │   handle · check · title · actions (one column each)
//   │    │    │ ● Work  Due tomorrow  #writing   …         │   the facts run under the title and the actions
//   └────┴────┴──────────────────────────────────┴────┴────┘
//
//   handle   the reorder list's handle (`data-kp-handle`): the row moves in its list and, with `data-kp-reorder-group`, to
//            another list (js/structure.js); `handle: false` keeps the column empty so rows still line up
//   check    the field's check box (`.kp-field__check`) in a label as large as the row's buttons
//   title    a button: `kp-task-open` `{ key, source }`; a done row strikes it through
//   facts    `.kp-badge` for a deadline (tones), `.kp-cat-dot` with a project's name, `.kp-cat-chip` for a tag, muted words
//   actions  the page's icon buttons, then the ⋯ menu button (js/menu-button.js); `data-kp-context-menu="inner"` gives the row
//            the same entries on a right click, a long press and Shift+F10 (js/context-menu.js)
//
// The row carries `data-kp-row-key`, so an element marked `data-kp-row-pick` picks rows with Ctrl/Cmd+click, Shift+click and a
// long press (js/row-pick.js); a picked row is ringed and tinted (`data-kp-picked`). `data-kp-priority` (`high`, `medium`) draws
// an edge inside the border; `data-kp-done` mutes it. `.kp-task-list` is the list: rows in one grid with a small gap.
//
// buildTaskRow(doc, spec) draws one from data; the markup is complete without it, for a page that draws its own.

export { buildTaskRow, TASK_TOGGLE_EVENT, TASK_OPEN_EVENT } from './task-row/build.js';
export { factNode } from './task-row/facts.js';

/** @typedef {import('./task-row/build.js').TaskRowSpec} TaskRowSpec */
/** @typedef {import('./task-row/facts.js').TaskFact} TaskFact */

