// The selector, attribute names and event of the chip filter [forms-1102].

/** A chip group that filters a data table. */
export const CHIP_FILTER = '[data-kp-segmented][data-kp-filter-for]';
/** The id of the data table the chips filter (the `[data-kp-datatable]` wrapper, or the table inside it). */
export const FILTER_FOR = 'data-kp-filter-for';
/** The column the chips filter by: its id (`data-kp-field`, else its words) or its number. */
export const FILTER_COLUMN = 'data-kp-filter-column';
/** `auto`: the chips are made from the column's values (the default when the group holds no chips); `own`: the page's chips stay. */
export const FILTER_CHIPS = 'data-kp-filter-chips';
/** `off`: the module writes no counts (a server table, whose page writes them with setSegmentedCounts). */
export const FILTER_COUNTS = 'data-kp-filter-counts';
/** The value the All item stands for in a single group: no filter. */
export const ALL_VALUE = '';
/** Set on the group while it is linked to its table. */
export const LINKED = 'data-kp-filter-linked';
