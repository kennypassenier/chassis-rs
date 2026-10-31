// The list toolbar [kpadopt-controls]: the bar above a list, a log, a board or
// a chart that is not (or not only) a data table.
//
//   <div class="kp-toolbar" data-kp-toolbar data-kp-toolbar-key="/" role="group" aria-label="Containers">
//       <div class="kp-toolbar__search">
//           <input type="search" class="kp-field__input kp-toolbar__input" placeholder="Search containers"
//                  aria-label="Search containers" aria-keyshortcuts="/" />
//           <kbd class="kp-kbd kp-toolbar__key" aria-hidden="true">/</kbd>
//       </div>
//       <div class="kp-toolbar__filters">
//           <div class="kp-toolbar__group" role="group" aria-labelledby="tb-status">
//               <b class="kp-toolbar__label" id="tb-status">Status</b>
//               <div class="kp-segmented kp-segmented--chips" data-kp-segmented="multi" aria-label="Status"> … </div>
//           </div>
//       </div>
//       <div class="kp-toolbar__state">12 of 48 · <button class="kp-button kp-button--ghost kp-button--sm">Follow</button></div>
//       <div class="kp-toolbar__active" hidden></div>
//   </div>
//
// Its three zones sit on one grid row, so the search box keeps its width
// whatever the filter groups hold. The filter groups are `.kp-segmented`
// (chips or segments, js/segmented.js); the state zone is a slot for a count,
// a follow switch, a table/cards choice. The active row under them lists the
// filters that are on as the data table's own removable tags, and is absent
// when none is on.
//
// What this module does:
//   - Escape in the search clears it (and fires `input`, so the page filters).
//   - `data-kp-toolbar-key="/"` focuses the search on that key from anywhere
//     on the page that is not a field. The hint cap in the markup says so.
//   - the active row: `setToolbarActive(toolbar, filters)` draws it; a press
//     on a tag's cross fires `kp-toolbar-remove`, a press on Clear all fires
//     `kp-toolbar-clear`. The page turns the filter off and calls
//     setToolbarActive again; the focus goes to the next tag.
//
// Events (bubbling, on the toolbar):
//   kp-toolbar-remove   { id: string, label: string }
//   kp-toolbar-clear    {}
//
// The input is a `.kp-field__input`, so each theme's field look is already on
// it. Nothing runs on import; attachToolbars(root) returns a detach.

// The module is a facade [closure-pattern B, Kenny 2026-10-30]: the names, the active row (active.js) and the ToolbarWatch
// controller live in js/toolbar/, listed in js/README.md.

import { watchToolbars } from './toolbar/controller.js';

export { TOOLBAR, TOOLBAR_REMOVE_EVENT, TOOLBAR_CLEAR_EVENT } from './toolbar/values.js';
export { toolbarSearch, setToolbarActive } from './toolbar/active.js';

/** The tag a filter that is on is drawn as: `id` names it to the page (the label when absent). @typedef {{ id?: string, label: string }} ToolbarFilter */

/**
 * What `decorate` is told about the control it is handed: `kind` is `tag-remove` (a tag's cross; `value` is the filter's id) or
 * `clear-all`; `host` is the toolbar and `key` its `data-kp-key`.
 * @typedef {{ kind: 'tag-remove' | 'clear-all', host: HTMLElement, key?: string, value?: string, label?: string }} ToolbarDecorateInfo
 */

/**
 * Wire every `[data-kp-toolbar]` under `root`: Escape in the search, the
 * search key, and the active row's two buttons. The active row is hidden when
 * it holds no tag.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachToolbars(root = document) {
    return watchToolbars(root);
}
