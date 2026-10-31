// The words of the data table, the toolbar, the heat grid and the matrix.

/**
 * @typedef {object} TableHeatStrings
 * @property {string} tableSearch
 * @property {string} tableSearchLabel
 * @property {string} tableSelectAll
 * @property {(key: string) => string} tableSelectRow
 * @property {string} tableEmpty
 * @property {(n: number) => string} tableRows
 * @property {(shown: number, total: number) => string} tableRowsFiltered
 * @property {(at: number, of: number) => string} tablePage
 * @property {string} tableRegion
 * @property {string} tableSearchScope      The name of the "In" choice beside the search box
 * @property {string} tableSearchAllColumns The "In" choice's first option
 * @property {(active: number) => string} tableFilters  The filter panel's toggle, with the number of active filters
 * @property {string} tableFiltersLabel     The filter panel's group name
 * @property {string} tableActiveFilters    The list of removable filter pills
 * @property {(column: string, value: string) => string} tableFilterValue  A choice filter's pill
 * @property {(column: string, from: string, to: string) => string} tableFilterRange  A range or date filter's pill; an open end is `tableFilterOpenEnd`
 * @property {string} tableFilterOpenEnd    The open end of a range in its pill
 * @property {(column: string) => string} tableFilterFrom  The lower bound's accessible name
 * @property {(column: string) => string} tableFilterTo    The upper bound's accessible name
 * @property {(label: string) => string} tableRemoveFilter  A pill's remove button
 * @property {string} tableClearFilters
 * @property {string} toolbarShowingOnly  The word before the filters that are on, in a list toolbar's active row (js/toolbar.js) [kpadopt-controls]
 * @property {string} toolbarClearAll       The toolbar's button that turns every filter off [kpadopt-controls]
 * @property {string} keysLabel            The accessible name of a line of keyboard shortcuts (js/keys.js) [kpadopt-controls]
 * @property {string} heatLoading           What a heat grid's or matrix's cell says while its value is being read (js/heat.js) [kpadopt2-grids]
 * @property {string} heatEmpty             A heat grid or matrix with no rows [kpadopt2-grids]
 * @property {string} heatFailed            A heat grid or matrix that could not be read [kpadopt2-grids]
 * @property {string} heatLegendLess        The less end of a heat legend's value ramp (js/heat.js, setHeatLegend) [gap-tab-count]
 * @property {string} heatLegendMore        The more end of the ramp [gap-tab-count]
 * @property {string} heatLegendLabel       The name of a heat grid's legend for a screen reader [gap-tab-count]
 * @property {string} heatKeysMove          The heat legend's key line: the arrow keys [gap-tab-count]
 * @property {string} heatKeysPick          Enter or Space on a cell: pick the column [gap-tab-count]
 * @property {string} heatKeysDrop          Escape: drop the picked column [gap-tab-count]
 * @property {string} heatKeysPage          Page Up and Page Down: show earlier or later columns [gap-tab-count]
 * @property {string} heatPagerLabel  The name of a heat grid's Earlier / Today / Later bar for a screen reader (js/heat.js) [wish-1120]
 * @property {string} heatEarlier  The paging bar's button to the page before [wish-1120]
 * @property {string} heatToday  The paging bar's button back to the present [wish-1120]
 * @property {string} heatLater  The paging bar's button to the page after [wish-1120]
 * @property {string} matrixSelf            A matrix cell that pairs a row with itself, for a screen reader [kpadopt2-grids]
 * @property {string} matrixUnknown         A matrix cell with no answer, for a screen reader [kpadopt2-grids]
 * @property {string} tableClearSearch      The way out of the no-match state
 * @property {(active: number) => string} tableAddFilter  The "+ Add filter" button of a table in the add-filter mode, with the number of active filters
 * @property {string} tableAddFilterMenu    The name of its menu of filterable columns
 * @property {(column: string) => string} tableAddFilterItem  A column in that menu, not filtered yet
 * @property {(column: string) => string} tableAddFilterItemActive  A column in that menu that is filtered already: choosing it edits that filter
 * @property {string} tableFilterMarked     The mark beside a filtered column in the menu
 * @property {(column: string) => string} tableFilterEditor  The editor's accessible name
 * @property {(column: string) => string} tableFilterChoicesLegend  The editor's list of choices, for a screen reader
 * @property {(kind: 'range' | 'date', bound: 'from' | 'to', column: string) => string} tableFilterBound  A bound's visible label in the editor
 * @property {(column: string, values: string[]) => string} tableFilterChoicePill  A choice filter's one pill in the add-filter mode
 * @property {(column: string, from: string, to: string, kind: 'range' | 'date') => string} tableFilterSpanPill  A range or date filter's pill in the add-filter mode; an open end is left out
 * @property {(label: string) => string} tableEditFilter  A pill's own button, which reopens its editor
 * @property {string} tableFilterApply
 * @property {string} tableFilterCancel
 * @property {string} tableFilterClearAll   The add-filter mode's way out of every filter, shown from two pills
 * @property {(label: string, value: string) => string} tableFilterNotNumber  A number bound that is not a number
 * @property {(label: string, value: string) => string} tableFilterNotDate  A date bound the picker cannot read
 * @property {(from: string, to: string) => string} tableFilterBackwards  A range whose lower bound is above its upper
 * @property {string} tableDensity
 * @property {string} tableDensityComfortable
 * @property {string} tableDensityCompact
 * @property {string} tableRowsPerPage
 * @property {(from: number, to: number, count: number, total: number) => string} tableShowing  The status line: "Showing 1–25 of 60"
 * @property {(n: number) => string} tableSelected  The action bar's count
 * @property {string} tableClearSelection
 * @property {string} tableSortBy           The card layout's sort control
 * @property {string} tableSortNone         Its first option
 * @property {string} tableSortAscending
 * @property {string} tableSortDescending
 * @property {string} tableFailed
 * @property {string} tableRetry
 * @property {(column: string, direction: 'ascending' | 'descending', kind: string) => string} tableSortKey  One key of a multi-column sort in words; `kind` is text, number, date or order
 * @property {(keys: string[]) => string} tableSortedBy  The multi-sort summary, from the keys in order
 * @property {string} tableNotSorted
 * @property {string} tableSortReset
 * @property {(seconds: number) => string} tableBusyElapsed
 * @property {string} tableColumns          The column menu's button
 * @property {string} tableColumnsLabel     The column menu's name
 * @property {(column: string) => string} tableColumnLocked  A column that cannot be hidden, in the menu
 * @property {string} tableShowAllColumns
 * @property {(shown: number, total: number) => string} tableColumnsShown
 * @property {string} tableDetailsColumn    The expansion column's header, read by a screen reader only
 * @property {(key: string) => string} tableRowDetails  A row's expand button
 * @property {string} tableReorderColumn  The name of the data table's column of drag handles for a screen reader [wish-1120]
 * @property {(name: string) => string} tableReorderRow  A row's drag handle: "Move media", with Alt+Up and Alt+Down named in the aria-keyshortcuts [wish-1120]
 * @property {string} tableReorderOff  Why the handles are off while the table is sorted, filtered or searched [wish-1120]
 * @property {(group: string, count: number) => string} tableGroupRows  A group row's fold button: the group's name and how many of its rows match [J2]
 * @property {(column: string, key: string, value: string) => string} tableEdit  An editable cell's button
 * @property {(column: string, key: string) => string} tableEditField  The editor's accessible name
 * @property {(column: string, key: string) => string} tableEditing  Said when an editor opens
 * @property {(key: string, column: string, before: string, after: string) => string} tableEdited
 * @property {(key: string, column: string, value: string) => string} tableEditUndone
 * @property {string} tableEditCancelled
 * @property {string} tableEditRequired
 * @property {string} tableEditInvalid     A rejected edit with no message of its own
 * @property {string} tableGridStart        The keyboard grid's line before the first cell is focused
 * @property {(row: number, rows: number, column: string, text: string) => string} tableGridPosition  Row 0 is the header row
 */

/** @type {TableHeatStrings} */
export const TABLE_HEAT_STRINGS = {
    tableSearch: 'Search…',
    tableSearchLabel: 'Search the table',
    // "On this page", because that is what it does [gap-13]: the header box
    // used to tick every filtered row on every page while saying "visible".
    tableSelectAll: 'Select every row on this page',
    tableSelectRow: (key) => `Select row ${key}`,
    tableEmpty: 'Nothing found.',
    tableRows: (n) => `${n} rows`,
    tableRowsFiltered: (shown, total) => `${shown} of ${total} rows`,
    /** The pager's position, "2 / 5". A function, so a consumer reorders it. @param {number} at @param {number} of */
    tablePage: (at, of) => `${at} / ${of}`,
    /**
     * The name of the scrolling region around a table [TH95], used only
     * when the table has no caption and the consumer named nothing: a
     * region with no name is announced as "region" and tells a reader
     * nothing about what they just tabbed into.
     */
    tableRegion: 'Table',
    tableSearchScope: 'Search in',
    tableSearchAllColumns: 'All columns',
    tableFilters: (active) => (active > 0 ? `Filters (${active})` : 'Filters'),
    tableFiltersLabel: 'Filters',
    tableActiveFilters: 'Active filters',
    tableFilterValue: (column, value) => `${column}: ${value}`,
    tableFilterRange: (column, from, to) => `${column}: ${from}–${to}`,
    tableFilterOpenEnd: 'any',
    tableFilterFrom: (column) => `${column}, from`,
    tableFilterTo: (column) => `${column}, to`,
    tableRemoveFilter: (label) => `Remove filter ${label}`,
    tableClearFilters: 'Clear all filters',
    toolbarShowingOnly: 'Showing only',
    toolbarClearAll: 'Clear all',
    keysLabel: 'Keyboard shortcuts',
    heatLoading: 'Reading…',
    heatEmpty: 'Nothing to show.',
    heatFailed: 'Could not be read.',
    heatLegendLess: 'Less',
    heatLegendMore: 'More',
    heatLegendLabel: 'Legend',
    heatKeysMove: 'move',
    heatKeysPick: 'pick a column',
    heatKeysDrop: 'drop the pick',
    heatKeysPage: 'earlier or later',
    heatPagerLabel: 'Show another period',
    heatEarlier: 'Earlier',
    heatToday: 'Today',
    heatLater: 'Later',
    matrixSelf: 'itself',
    matrixUnknown: 'unknown',
    tableClearSearch: 'Clear the search and filters',
    // The add-filter mode [Kenny, 2026-09-14, "Allebei, per tabel"], in the
    // words of the approved mock, research/datatable/demo.html#filter-add.
    tableAddFilter: (active) => (active > 0 ? `+ Add filter (${active} active)` : '+ Add filter'),
    tableAddFilterMenu: 'Filter by column',
    tableAddFilterItem: (column) => `Filter on ${column}`,
    tableAddFilterItemActive: (column) => `${column}, already filtered: edit that filter`,
    tableFilterMarked: 'filtered',
    tableFilterEditor: (column) => `Filter on ${column}`,
    tableFilterChoicesLegend: (column) => `Show rows whose ${column.toLowerCase()} is`,
    tableFilterBound: (kind, bound, column) => {
        if (kind === 'date') return bound === 'from' ? `${column} on or after` : `${column} on or before`;
        return bound === 'from' ? 'From' : 'To';
    },
    tableFilterChoicePill: (column, values) => `${column}: ${values.join(', ')}`,
    tableFilterSpanPill: (column, from, to, kind) => {
        if (from !== '' && to !== '') return `${column}: ${from}${kind === 'date' ? ' to ' : '–'}${to}`;
        if (from !== '') return `${column}: from ${from}`;
        return `${column}: up to ${to}`;
    },
    tableEditFilter: (label) => `Edit filter ${label}`,
    tableFilterApply: 'Apply',
    tableFilterCancel: 'Cancel',
    tableFilterClearAll: 'Clear all',
    tableFilterNotNumber: (label, value) => `${label} takes a number, like 10; "${value}" is not one.`,
    tableFilterNotDate: (label, value) =>
        `${label}: "${value}" is not a date this field can read; write it the way the field shows, or use the calendar.`,
    tableFilterBackwards: (from, to) => `The range runs backwards: from ${from} to ${to}. Swap the two values.`,
    tableDensity: 'Density',
    tableDensityComfortable: 'Comfortable',
    tableDensityCompact: 'Compact',
    tableRowsPerPage: 'Rows per page',
    /** "Showing 1–25 of 60", and where a search or filter hides rows, how many. */
    tableShowing: (from, to, count, total) => {
        if (count === 0) return `Showing 0 of ${total}`;
        if (count === total) return `Showing ${from}–${to} of ${total}`;
        return `Showing ${from}–${to} of ${count} (filtered from ${total})`;
    },
    tableSelected: (n) => `${n} selected`,
    tableClearSelection: 'Clear selection',
    tableSortBy: 'Sort by',
    tableSortNone: 'None',
    tableSortAscending: 'Ascending',
    tableSortDescending: 'Descending',
    tableFailed: 'The rows could not be loaded.',
    tableRetry: 'Try again',
    // The seven features of 2026-09-13 ("Alle zeven, nu"), in the words the
    // approved mocks of research/datatable/demo.html used.
    tableSortKey: (column, direction, kind) => {
        const up = direction === 'ascending';
        if (kind === 'number' || kind === 'order') return `${column} ${up ? 'low to high' : 'high to low'}`;
        if (kind === 'date') return `${column} ${up ? 'oldest first' : 'newest first'}`;
        return `${column} ${up ? 'A to Z' : 'Z to A'}`;
    },
    tableSortedBy: (keys) => `Sorted by ${keys.join(', then ')}.`,
    tableNotSorted: 'Not sorted.',
    tableSortReset: 'Reset the sort',
    tableBusyElapsed: (seconds) => (seconds < 60 ? `${seconds} s so far` : `${Math.floor(seconds / 60)} min ${seconds % 60} s so far`),
    tableColumns: 'Columns',
    tableColumnsLabel: 'Visible columns',
    tableColumnLocked: (column) => `${column} (always shown)`,
    tableShowAllColumns: 'Show every column',
    tableColumnsShown: (shown, total) => `${shown} of ${total} columns shown`,
    tableDetailsColumn: 'Details',
    tableRowDetails: (key) => `Details for ${key}`,
    tableReorderColumn: 'Move row',
    tableReorderRow: (name) => `Move ${name} (Alt+Up or Alt+Down)`,
    tableReorderOff: 'Clear the sort, the filters and the search to reorder the rows',
    tableGroupRows: (group, count) => `${group}: ${count} ${count === 1 ? 'row' : 'rows'}`,
    tableEdit: (column, key, value) => `${column} of ${key}: ${value}. Edit`,
    tableEditField: (column, key) => `${column} of ${key}`,
    tableEditing: (column, key) => `Editing ${column} of ${key}. Press Enter to save, or Escape to cancel.`,
    tableEdited: (key, column, before, after) => `${key}: ${column} changed from ${before} to ${after}.`,
    tableEditUndone: (key, column, value) => `Undone: ${key} ${column} is ${value} again.`,
    tableEditCancelled: 'Edit cancelled; nothing changed.',
    tableEditRequired: 'A value is required.',
    tableEditInvalid: 'This value cannot be saved.',
    tableGridStart: 'Tab into the table to start.',
    tableGridPosition: (row, rows, column, text) => `${row === 0 ? 'Header row' : `Row ${row} of ${rows}`}, column ${column}: ${text}`,
};
