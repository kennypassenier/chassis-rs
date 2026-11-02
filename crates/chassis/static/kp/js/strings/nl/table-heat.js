// The Dutch words of the data table, the heat grid and the matrix [habits-1101].
/** @typedef {import('../types.js').Strings} Strings */

/** @param {number} n @returns {string} */
const rows = (n) => `${n} ${n === 1 ? 'rij' : 'rijen'}`;

/** @type {Partial<Strings>} */
export const NL_TABLE_HEAT = {
    tableSearch: 'Zoeken…',
    tableSearchLabel: 'In de tabel zoeken',
    tableSelectAll: 'Elke rij op deze pagina selecteren',
    tableSelectRow: (key) => `Rij ${key} selecteren`,
    tableEmpty: 'Niets gevonden.',
    tableRows: (n) => rows(n),
    tableRowsFiltered: (shown, total) => `${shown} van ${rows(total)}`,
    tablePage: (at, of) => `${at} / ${of}`,
    tableRegion: 'Tabel',
    tableSearchScope: 'Zoeken in',
    tableSearchAllColumns: 'Alle kolommen',
    tableFilters: (active) => (active > 0 ? `Filters (${active})` : 'Filters'),
    tableFiltersLabel: 'Filters',
    tableActiveFilters: 'Actieve filters',
    tableFilterValue: (column, value) => `${column}: ${value}`,
    tableFilterRange: (column, from, to) => `${column}: ${from}–${to}`,
    tableFilterOpenEnd: 'alles',
    tableFilterFrom: (column) => `${column}, van`,
    tableFilterTo: (column) => `${column}, tot`,
    tableFilterMin: 'Min',
    tableFilterMax: 'Max',
    tableFilterFromLabel: 'Van',
    tableFilterToLabel: 'Tot',
    tableRowMenu: 'Meer acties',
    tableRemoveFilter: (label) => `Filter ${label} weghalen`,
    tableClearFilters: 'Alle filters wissen',
    toolbarShowingOnly: 'Alleen getoond',
    toolbarClearAll: 'Alles wissen',
    keysLabel: 'Sneltoetsen',
    heatLoading: 'Lezen…',
    heatEmpty: 'Niets om te tonen.',
    heatFailed: 'Kon niet gelezen worden.',
    heatLegendLess: 'Minder',
    heatLegendMore: 'Meer',
    heatLegendLabel: 'Legende',
    heatKeysMove: 'bewegen',
    heatKeysPick: 'een kolom kiezen',
    heatKeysDrop: 'de keuze loslaten',
    heatKeysPage: 'eerder of later',
    heatPagerLabel: 'Een andere periode tonen',
    heatEarlier: 'Eerder',
    heatToday: 'Vandaag',
    heatLater: 'Later',
    matrixSelf: 'zichzelf',
    matrixUnknown: 'onbekend',
    tableClearSearch: 'Zoekterm en filters wissen',
    tableAddFilter: (active) => (active > 0 ? `+ Filter toevoegen (${active} actief)` : '+ Filter toevoegen'),
    tableAddFilterMenu: 'Filteren op kolom',
    tableAddFilterItem: (column) => `Filteren op ${column}`,
    tableAddFilterItemActive: (column) => `${column}, al gefilterd: die filter bewerken`,
    tableFilterMarked: 'gefilterd',
    tableFilterEditor: (column) => `Filteren op ${column}`,
    tableFilterChoicesLegend: (column) => `Rijen tonen met als ${column.toLowerCase()}`,
    tableFilterBound: (kind, bound, column) => {
        if (kind === 'date') return bound === 'from' ? `${column} op of na` : `${column} op of voor`;
        return bound === 'from' ? 'Van' : 'Tot';
    },
    tableFilterChoicePill: (column, values) => `${column}: ${values.join(', ')}`,
    tableFilterSpanPill: (column, from, to, kind) => {
        if (from !== '' && to !== '') return `${column}: ${from}${kind === 'date' ? ' tot ' : '–'}${to}`;
        if (from !== '') return `${column}: vanaf ${from}`;
        return `${column}: tot ${to}`;
    },
    tableEditFilter: (label) => `Filter ${label} bewerken`,
    tableFilterApply: 'Toepassen',
    tableFilterCancel: 'Annuleren',
    tableFilterClearAll: 'Alles wissen',
    tableFilterNotNumber: (label, value) => `${label} vraagt een getal, zoals 10; "${value}" is er geen.`,
    tableFilterNotDate: (label, value) =>
        `${label}: "${value}" is geen datum die dit veld kan lezen; schrijf hem zoals het veld hem toont, of gebruik de kalender.`,
    tableFilterBackwards: (from, to) => `De periode loopt achterstevoren: van ${from} tot ${to}. Wissel de twee waarden om.`,
    tableDensity: 'Dichtheid',
    tableDensityComfortable: 'Ruim',
    tableDensityCompact: 'Compact',
    tableRowsPerPage: 'Rijen per pagina',
    tableShowing: (from, to, count, total) => {
        if (count === 0) return `0 van ${total} getoond`;
        if (count === total) return `${from}–${to} van ${total} getoond`;
        return `${from}–${to} van ${count} getoond (gefilterd uit ${total})`;
    },
    tableSelected: (n) => `${n} geselecteerd`,
    tableClearSelection: 'Selectie wissen',
    tableSortBy: 'Sorteren op',
    tableSortNone: 'Geen',
    tableSortAscending: 'Oplopend',
    tableSortDescending: 'Aflopend',
    tableFailed: 'De rijen konden niet geladen worden.',
    tableRetry: 'Opnieuw proberen',
    tableSortKey: (column, direction, kind) => {
        const up = direction === 'ascending';
        if (kind === 'number' || kind === 'order') return `${column} ${up ? 'laag naar hoog' : 'hoog naar laag'}`;
        if (kind === 'date') return `${column} ${up ? 'oudste eerst' : 'nieuwste eerst'}`;
        return `${column} ${up ? 'A tot Z' : 'Z tot A'}`;
    },
    tableSortedBy: (keys) => `Gesorteerd op ${keys.join(', dan ')}.`,
    tableNotSorted: 'Niet gesorteerd.',
    tableSortReset: 'De sortering terugzetten',
    tableBusyElapsed: (seconds) => (seconds < 60 ? `al ${seconds} s` : `al ${Math.floor(seconds / 60)} min ${seconds % 60} s`),
    tableColumns: 'Kolommen',
    tableColumnsLabel: 'Zichtbare kolommen',
    tableColumnLocked: (column) => `${column} (altijd zichtbaar)`,
    tableShowAllColumns: 'Elke kolom tonen',
    tableColumnsShown: (shown, total) => `${shown} van ${total} kolommen getoond`,
    tableDetailsColumn: 'Details',
    tableRowDetails: (key) => `Details van ${key}`,
    tableReorderColumn: 'Rij verplaatsen',
    tableReorderRow: (name) => `${name} verplaatsen (Alt+Omhoog of Alt+Omlaag)`,
    tableReorderOff: 'Wis de sortering, de filters en de zoekterm om de rijen te herschikken',
    tableGroupRows: (group, count) => `${group}: ${rows(count)}`,
    tableEdit: (column, key, value) => `${column} van ${key}: ${value}. Bewerken`,
    tableEditField: (column, key) => `${column} van ${key}`,
    tableEditing: (column, key) => `${column} van ${key} bewerken. Druk op Enter om te bewaren, of Escape om te annuleren.`,
    tableEdited: (key, column, before, after) => `${key}: ${column} gewijzigd van ${before} naar ${after}.`,
    tableEditUndone: (key, column, value) => `Ongedaan gemaakt: ${key} ${column} is weer ${value}.`,
    tableEditCancelled: 'Bewerken geannuleerd; er is niets veranderd.',
    tableEditRequired: 'Een waarde is verplicht.',
    tableEditInvalid: 'Deze waarde kan niet bewaard worden.',
    tableGridStart: 'Tab de tabel in om te beginnen.',
    tableGridPosition: (row, total, column, text) =>
        `${row === 0 ? 'Koprij' : `Rij ${row} van ${total}`}, kolom ${column}: ${text}`,
};
