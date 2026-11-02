// The Dutch words of the repeating row editor and the attention band's cap [habits-1101].
/** @typedef {import('../types.js').Strings} Strings */

/** @type {Partial<Strings>} */
export const NL_ROWS_ATTENTION = {
    rowsUnitOne: 'rij',
    rowsUnitMany: 'rijen',
    rowsAdd: (unit) => `Een ${unit} toevoegen`,
    rowsRemove: (unit, n) => `${unit} ${n} verwijderen`,
    rowsAdded: (unit, n, total) => `${unit} ${n} toegevoegd. ${total} in totaal.`,
    rowsRemoved: (unit, n, total) => `${unit} ${n} verwijderd. Nog ${total} over.`,
    rowsAtMin: (min, units) => `Minstens ${min} ${units} nodig.`,
    rowsAtMax: (max, units) => `Hoogstens ${max} ${units}.`,
    rowsEmptyTitle: (units) => `Nog geen ${units}`,
    rowsEmptyText: (unit) => `Voeg de eerste ${unit} toe om te beginnen.`,
    attentionMore: (n) => `Nog ${n} tonen`,
    attentionFewer: 'Minder tonen',
};
