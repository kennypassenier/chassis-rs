// The Dutch words of the reorder, the board, the context menu, the markdown editor and the task row [habits-1101].
/** @typedef {import('../types.js').Strings} Strings */

/** @param {number} count @returns {string} */
const cards = (count) => (count === 1 ? '1 kaart' : `${count} kaarten`);

/** @type {Partial<Strings>} */
export const NL_BOARD_MENU_MARKDOWN = {
    reorderMovedTo: (name, list, at, of) => `${name} verplaatst naar ${list}, plaats ${at} van ${of}`,
    reorderGroupEnd: 'Die kant op is er geen lijst meer',
    reorderGroupKeys: 'Pijl omhoog en omlaag verplaatsen binnen de lijst; pijl links en rechts verplaatsen naar de lijst ervoor of erna.',
    boardCountLabel: (count, limit) => (limit > 0 ? `${count} van hoogstens ${limit}` : String(count)),
    boardOver: 'Over de limiet',
    boardOverSaid: (lane, count, limit) => `${lane} heeft er ${count}, meer dan de limiet van ${limit}`,
    boardLaneEmpty: 'Hier staat nog niets. Sleep een kaart hierheen, of stuur er een met Verplaatsen naar in het menu.',
    boardLanes: 'Kolommen',
    boardLoading: 'Het bord wordt gelezen',
    boardEmpty: 'Er staat nog niets op het bord.',
    boardFailed: (reason) => (reason ? `Het bord kon niet gelezen worden: ${reason}` : 'Het bord kon niet gelezen worden.'),
    boardRetry: 'Opnieuw proberen',
    boardTabLabel: (lane, count, limit, over) =>
        `${lane}, ${limit > 0 ? `${count} van hoogstens ${limit}` : cards(count)}${over ? ', over de limiet' : ''}`,
    boardMoveTo: 'Verplaatsen naar',
    boardMoveHint: (count, limit) => {
        if (limit <= 0) return `nu ${cards(count)}`;
        return count > limit
            ? `nu ${count} / ${limit}, over de limiet`
            : count === limit
              ? `nu ${count} / ${limit}, op de limiet`
              : `nu ${count} / ${limit}`;
    },
    boardMovedSaid: (name, lane, count, limit) =>
        `${name} verplaatst naar ${lane}, dat er nu ${limit > 0 ? `${count} van hoogstens ${limit}` : count} heeft`,
    contextMenuLabel: 'Acties',
    mdToolbar: 'Opmaak',
    mdBold: 'Vet',
    mdItalic: 'Cursief',
    mdHeading: 'Kop',
    mdList: 'Opsomming',
    mdChecklist: 'Checklist',
    mdLink: 'Link',
    mdLinkText: 'linktekst',
    mdWithKeys: (action, keys) => `${action} (${keys})`,
    mdWrite: 'Schrijven',
    mdPreview: 'Voorbeeld',
    mdPreviewEmpty: 'Nog niets om te tonen.',
    taskRowDone: (title) => `Klaar: ${title}`,
    taskRowReopen: (title) => `Heropenen: ${title}`,
    taskRowMove: (title) => `${title} verplaatsen`,
    taskRowMore: (title) => `Meer voor ${title}`,
};
