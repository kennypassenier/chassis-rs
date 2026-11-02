// The Dutch words of the activity feed and the editable timeline [habits-1101].
/** @typedef {import('../types.js').Strings} Strings */

/** Dutch short units for a span, largest first. @type {[string, number][]} */
const SPAN_WORDS = [
    ['w', 604800],
    ['d', 86400],
    ['u', 3600],
    ['min', 60],
    ['s', 1],
];
/** @type {Record<string, number>} */
const UNIT_SECONDS = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800 };

/** @type {Partial<Strings>} */
export const NL_FEED_SEQUENCER = {
    feedLabel: 'Activiteit',
    feedUnitOne: 'gebeurtenis',
    feedUnitMany: 'gebeurtenissen',
    feedToday: 'Vandaag',
    feedYesterday: 'Gisteren',
    feedShown: (shown, total, unit) => `${shown} van ${total} ${unit}`,
    feedFailed: (n) => `${n} mislukt`,
    feedAllOk: 'alles ok',
    feedStateRunning: 'bezig',
    feedStateInfo: 'notitie',
    feedBy: 'door',
    feedMoreLabel: (title) => `Details van ${title}`,
    feedOpen: 'Openen',
    feedStale: (reason, since) => `Niet ververst: ${reason}.${since ? ` Rijen van ${since}.` : ''}`,
    feedStaleAction: 'Opnieuw lezen',
    feedLoading: 'De activiteit wordt gelezen…',
    feedEmptyTitle: 'Er is nog niets gebeurd',
    feedEmptyText: 'Nieuwe activiteit verschijnt hier zodra ze gebeurt.',
    feedErrorTitle: 'De activiteit kon niet gelezen worden',
    feedErrorText: 'De host antwoordde niet. Er ging niets verloren.',
    feedRetry: 'Opnieuw proberen',
    feedEarlier: 'Eerdere laden',
    feedEarlierLoading: 'Eerdere laden…',
    feedEarlierError: 'Eerdere activiteit kon niet geladen worden.',
    feedEarlierRetry: 'Opnieuw proberen',
    feedBackTo: (shown, total, date) =>
        shown === total ? `${shown} getoond, terug tot ${date}` : `${shown} van ${total} getoond, terug tot ${date}`,
    feedEnd: (shown, date) => `Niets eerder: alle ${shown} zijn getoond, terug tot ${date}.`,
    feedNew: (title) => `Nieuw: ${title}`,
    feedNewMany: (n, title) => `${n} nieuwe, de nieuwste: ${title}`,
    sequencerLabel: 'Tijdlijn',
    sequencerLoading: 'De tijdlijn wordt gelezen',
    sequencerEmpty: 'Nog niets op de tijdlijn',
    sequencerEmptyText: 'Voeg een stap toe en hij komt hier te staan.',
    sequencerFailed: 'De tijdlijn kon niet gelezen worden',
    sequencerZoomLabel: 'Zoomen',
    sequencerZoomIn: 'Inzoomen',
    sequencerZoomOut: 'Uitzoomen',
    sequencerZoomFit: 'Passend',
    sequencerZoomValue: (percent) => `${percent}%`,
    sequencerSpan: (value, unit) => {
        const seconds = UNIT_SECONDS[unit] ?? 60;
        let rest = Math.round(Math.abs(value) * seconds);
        if (rest === 0) return `0 ${SPAN_WORDS.find(([, size]) => size === seconds)?.[0] ?? 'min'}`;
        /** @type {string[]} */
        const parts = [];
        for (const [word, size] of SPAN_WORDS) {
            const n = Math.floor(rest / size);
            rest -= n * size;
            if (n) parts.push(`${n} ${word}`);
        }
        return `${value < 0 ? '-' : ''}${parts.join(' ')}`;
    },
    sequencerTotal: (span) => `Totaal ${span}`,
    sequencerNow: (span) => `Nu, ${span}`,
    sequencerHint: 'Sleep een stap om hem te verplaatsen, sleep zijn randen om de lengte te wijzigen · Enter neemt een stap op voor het toetsenbord',
    sequencerHintReadonly: 'Kies een stap om zijn tijden te zien',
    sequencerItemHelp: 'Druk op Enter om hem op te nemen en gebruik dan de pijltjestoetsen.',
    sequencerItem: (label, lane, start, length, partner) =>
        `${label}, ${lane}, begint om ${start}, duurt ${length}${partner ? `, loopt samen met ${partner}` : ''}`,
    sequencerGrabbed: (label) =>
        `${label} opgenomen. Pijlen verplaatsen, Shift met pijlen wijzigt de lengte, Alt met omhoog of omlaag wisselt van rij, Enter zet neer, Escape zet terug.`,
    sequencerDropped: (summary) => `Neergezet. ${summary}`,
    sequencerCancelled: (label) => `${label} teruggezet.`,
    sequencerRefusedOverlap: (label, other) => `${label} kan daar niet: het zou ${other} overlappen.`,
    sequencerRefusedEdge: (label) => `${label} kan die kant niet verder op.`,
    sequencerRefusedLocked: (label) => `${label} staat vast.`,
    sequencerRefusedLink: (label) => `${label} kan niet samen met die stap lopen.`,
    sequencerPushed: (n) => (n === 1 ? '1 andere stap schoof mee op.' : `${n} andere stappen schoven mee op.`),
    sequencerLinkStart: (label) => `Kies de stap waarmee ${label} samen loopt en druk op Enter. Escape annuleert.`,
    sequencerLinked: (label, partner) => `${label} loopt nu samen met ${partner}.`,
    sequencerUnlinked: (label) => `${label} loopt op zichzelf.`,
    sequencerSelectedNone: 'Geen stap gekozen.',
    sequencerLinkButton: 'Loopt samen met…',
    sequencerUnlinkButton: 'Loopt op zichzelf',
    sequencerLinkCancel: 'Annuleren',
    sequencerReadout: (start, length) => `Om ${start}, ${length}`,
    sequencerReadoutRefused: 'Niet hier',
};
