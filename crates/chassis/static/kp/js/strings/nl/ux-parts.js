// The Dutch words of the segmented fold, the tri-state tag, the popover form, the date navigator and row deletes [habits-1101].
/** @typedef {import('../types.js').Strings} Strings */

/** @type {Partial<Strings>} */
export const NL_UX_PARTS = {
    segmentedFoldName: 'Tonen',
    segmentedFoldAll: 'Alles',
    segmentedFoldButton: (name, chosen) => `${name}: ${chosen}`,
    segmentedFoldMany: (n) => `${n} gekozen`,
    triTagAny: 'maakt niet uit',
    triTagInclude: 'wel',
    triTagExclude: 'niet',
    popoverFormInvalid: 'Deze waarde kan niet.',
    popoverFormClose: 'Sluiten',
    dateNavGroup: 'Getoonde datums',
    dateNavPrev: '‹ Vorige',
    dateNavNext: 'Volgende ›',
    dateNavToday: 'Vandaag',
    dateNavPrevTitle: (unit) => (unit === 'week' ? 'Vorige week' : `Vorige ${unit}`),
    dateNavNextTitle: (unit) => (unit === 'week' ? 'Volgende week' : `Volgende ${unit}`),
    dateNavTodayTitle: (unit) => (unit === 'dag' ? 'Vandaag tonen' : `Deze ${unit} tonen`),
    dateNavUnits: { day: 'dag', week: 'week', month: 'maand' },
    dateNavWeekLabel: (n, from, to) => `Week ${n} · ${from} tot ${to}`,
    dateNavShown: (range) => `Nu getoond: ${range}`,
    dateNavCurrent: 'huidige',
    rowDeleted: (name) => `${name} verwijderd`,
    rowDeletedNameless: 'Rij verwijderd',
    rowRestored: (name) => `${name} is terug`,
};
