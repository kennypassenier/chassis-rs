// The chip filter: a chip group that filters a data table by one column, with an exact count on every chip [forms-1102].
//
// Almanac and Medicine Cabinet each wired segmented chips to `handle.filter` by hand and mirrored `kp-datatable-view` back
// into them. Now the group names its table and column, and that is all:
//
//   <div class="kp-segmented kp-segmented--chips" data-kp-segmented="single" aria-label="Show"
//        data-kp-filter-for="deliveries" data-kp-filter-column="status"></div>
//   <div class="kp-datatable" id="deliveries" data-kp-datatable data-kp-filter-ui="none"> …
//       <th data-kp-field="status" data-kp-filter="choice">Status</th> …
//
//   data-kp-filter-for      the id of the data table's wrapper (or of the table in it)
//   data-kp-filter-column   the column: its id (`data-kp-field`, else its words) or its number; its header carries
//                           `data-kp-filter="choice"`, so the table filters by it (a column without one is said in the console)
//   data-kp-filter-chips    auto: the chips are made from the column's values (the header's `data-kp-filter-options` in
//                           that order, else every value, sorted), made again when a new value arrives; own: the page's
//                           chips stay. Default: auto when the group holds no chips, own when it does
//   data-kp-filter-counts   off: no counts are written (a server table, whose page writes them with setSegmentedCounts)
//
// "All" is always there: a group without an All item gets one first ("All", the dictionary's `chipFilterAll`). A press
// filters the table (`handle.filter`): in a single group the chip chosen, in a multi group every chip on; All lifts the
// filter. The table's filter, whoever sets it (a remembered view, the address, the page's own call), lights the chips. Each
// chip shows how many of the table's rows hold its value, and All the whole count: every row the table holds, not a row held
// out (`data-kp-row-hidden`), a detail, group or loading row; the search does not narrow them, so a chip never jumps while a
// person types. The counts follow the rows: a row added, removed, edited or held out is counted again on the next frame.
// A client table only; a server table's page writes the counts its server sends.
//
// Nothing runs on import; attachChipFilters(root) returns a detach (js/auto.js loads it for a page that has one).

import { attachAll } from './controller.js';
import { ChipFilter } from './chip-filter/controller.js';
import { CHIP_FILTER } from './chip-filter/constants.js';

export { CHIP_FILTER, FILTER_FOR, FILTER_COLUMN, FILTER_CHIPS, FILTER_COUNTS } from './chip-filter/constants.js';
export { countValues, chipValues, chipCounts } from './chip-filter/counts.js';

/**
 * Tie every chip filter under `root` to its table. Wire the chips' own group with attachSegmented first (js/auto.js does both).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachChipFilters(root = document) {
    return attachAll(root, CHIP_FILTER, ChipFilter);
}
