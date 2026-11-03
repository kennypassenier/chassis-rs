// The add row: a new line typed in a row of fields and added with Enter [forms-1102].
//
// Kitchen's "What I ate" and its category tables, and Medicine Cabinet's forms and units, each built an add row of their own
// beside the package. It is one part now, in two shapes, both the kit form (`data-kp-form`: the busy Add, the failed summary,
// a message per field):
//
// Over a data table, its fields under the table's columns (`data-kp-addrow-for` names the table):
//
//   <form class="kp-addrow" data-kp-addrow data-kp-addrow-for="meals" data-kp-form novalidate>
//     <div class="kp-form__summary" data-kp-form-summary tabindex="-1" hidden></div>
//     <div class="kp-addrow__cells">
//       <div class="kp-field kp-addrow__cell" data-kp-addrow-column="dish">
//         <label class="kp-field__label" for="new-dish">Dish</label>
//         <input class="kp-field__input" id="new-dish" name="dish" required />
//         <span class="kp-field__error" data-kp-field-error hidden></span>
//       </div> …
//       <div class="kp-addrow__submit"><button class="kp-button kp-button--primary" data-kp-submit>Add</button></div>
//     </div>
//   </form>
//
// Opt-in knobs on the row: `data-kp-addrow-labels="show"` keeps the labels shown over their fields when the row is not stacked
// (Kitchen's date, meal and dish columns want their words over the fields); `data-kp-addrow-name="dish"` names the field whose
// value the "Added x" status says, where the first filled value would be an id or a date.
//
// Keys: Ctrl+Enter (Cmd+Enter; `data-kp-addrow-submit-key="Mod+Enter"`, any key spec, `none` for no key, or
// `configureAddRow({ submitKey })`) adds the line from any field of the row, a select and an open list included; plain Enter keeps
// its meaning everywhere. `data-kp-addrow-enter="submit"` also lets a plain Enter on a CLOSED select add the line (the list then
// opens with Space, Alt+Down, the arrows or typing; an open list still picks its option with Enter) [enter-1103].
//
// Each cell stands under the column `data-kp-addrow-column` names (its id, `data-kp-field`, else its words, or its number), as
// wide as the column, and follows it when the table is resized, scrolled sideways or a column is hidden; the column words name
// the fields, so the labels are for screen readers only. The Add button stands under `data-kp-addrow-submit-column`, else the
// last column without a field (an actions column), else after the last. While the table shows cards (`data-kp-cards` on a
// phone) or the row is narrower than 30rem, the fields stand under each other with their labels, the Add button the full width,
// as one card over the table's cards (`data-kp-addrow-stacked`).
//
// In a form grid, one line (no `data-kp-addrow-for`): a label, the fields side by side in the control column (name and unit),
// the Add button in the actions column, and the refusal under them:
//
//   <form class="kp-addrow kp-addrow--line" data-kp-addrow data-kp-form novalidate>   (a block of the form grid: its rows share the tracks)
//     <div class="kp-formgrid__row">
//       <span class="kp-formgrid__label">New form</span>
//       <div class="kp-formgrid__control kp-addrow__fields"> …two .kp-field… </div>
//       <div class="kp-formgrid__actions"><button class="kp-button kp-button--primary" data-kp-submit>Add</button></div>
//     </div>
//   </form>
//
// A valid line fires `kp-addrow-add` `{ values, data, waitUntil(promise) }` (cancelable: a cancel refuses it). The busy Add
// waits on the promise; one that resolves to nothing adds the line: the fields empty, the focus on the first, a status says
// "Added Pasta pesto" and `kp-addrow-added` `{ values }` fires (the page puts the row in its table). One that resolves to words
// or `false`, or rejects, refuses it with those words in the refusal line under the row (`.kp-field__error`, with the error icon,
// `role="alert"`); one that resolves to `{ errors: { name: message } }` puts the messages on those fields. The row keeps what was
// typed after a refusal. Every word is in the dictionary (`addRowAdded`, `addRowRefused`).
//
// Nothing runs on import; attachAddRows(root) returns a detach (js/auto.js loads it with the forms for a page that has one).

import { attachAll } from './controller.js';
import { AddRow } from './add-row/controller.js';
import { ADD_ROW } from './add-row/constants.js';
export { configureAddRow } from './add-row/keys.js';

export { ADD_ROW, ADD_ROW_FOR, ADD_ROW_COLUMN, ADD_ROW_SUBMIT_COLUMN, ADD_ROW_LABELS, ADD_ROW_NAME, ADD_ROW_SUBMIT_KEY_ATTRIBUTE, ADD_ROW_SUBMIT_KEY, ADD_EVENT, ADDED_EVENT, STACKED } from './add-row/constants.js';
export { valuesOf, sayRefusal } from './add-row/submit.js';
export { columnNumber } from './add-row/layout.js';

/**
 * Wire every add row under `root`. Its form is the kit form: attach the forms too (js/auto.js does both).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachAddRows(root = document) {
    return attachAll(root, ADD_ROW, AddRow);
}
