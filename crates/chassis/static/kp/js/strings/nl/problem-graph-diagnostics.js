// The Dutch words of the problem list, the flash, the network graph, the theme picker, diagnostics and the tri chip [habits-1101].
// The console messages for a developer (themeUnknown, rememberClash, registerLoadFailed, the two contracts) stay English:
// see kept-english.js.
/** @typedef {import('../types.js').Strings} Strings */

/** @type {Partial<Strings>} */
export const NL_PROBLEM_GRAPH_DIAGNOSTICS = {
    problemRemedy: 'Wat nu',
    problemShowOthers: (n) => (n === 1 ? 'Het andere tonen' : `De andere ${n} tonen`),
    problemShowFewer: 'Minder tonen',
    problemCopy: 'Kopiëren',
    problemListLabel: (n) => (n === 1 ? '1 probleem' : `${n} problemen`),
    flashDone: 'Klaar',
    flashRefused: 'Geweigerd',
    flashFailed: 'Mislukt',
    graphShowAll: 'Alles tonen',
    graphShowAllTitle: 'De selectie wissen en elke soort link weer tonen',
    graphHint:
        'Wijs een knooppunt aan of geef het de focus om alleen zijn links te zien. Klik erop, of druk op Enter, om het gekozen te houden; kies er zo meerdere. Pijltjestoetsen gaan van knooppunt naar knooppunt; Esc toont alles.',
    graphKinds: 'Soorten links',
    graphLoading: 'Het netwerk wordt gelezen…',
    graphUnnamed: 'Grafiek',
    graphZoom: 'Zoomen',
    graphZoomIn: 'Inzoomen',
    graphZoomOut: 'Uitzoomen',
    graphZoomReset: 'Beeld herstellen',
    graphZoomResetTitle: 'Het beeld terugzetten op zijn eerste grootte en plek (0)',
    graphZoomHint:
        'Scroll of knijp om te zoomen, sleep de achtergrond om te verschuiven; met de toetsen zoomen + en -, zet 0 terug en verschuift Shift met de pijlen.',
    graphDetailHint: 'Een gekozen knooppunt opent zijn details; Esc sluit die eerst.',
    graphDetailClose: 'Sluiten',
    graphDetailCloseTitle: 'De details sluiten (Esc)',
    breadcrumb: 'Kruimelpad',
    pagination: 'Paginering',
    themePicker: 'Kies een thema',
    themeSaveFailed: 'Deze keuze wordt niet onthouden: opslag is geblokkeerd in deze browser.',
    themeSaveRefused: 'Niet bewaard op de server: je keuze is teruggezet.',
    themeGroupLight: 'Licht',
    themeGroupDark: 'Donker',
    diagnosticsHeading: 'Stylesheet en JavaScript, naast elkaar',
    diagnosticsStylesheet: 'Stylesheet (css/themes.css)',
    diagnosticsScript: 'JavaScript (js/theme-registry.js)',
    diagnosticsVersion: 'Versie',
    diagnosticsThemes: 'Thema’s',
    diagnosticsEffects: 'Onbekende effect-hooks',
    diagnosticsEffectsNone: 'geen gemeld op deze pagina',
    diagnosticsVerdict: 'Oordeel',
    diagnosticsMatch: 'De stylesheet en de JavaScript komen uit dezelfde versie en kennen dezelfde thema’s.',
    diagnosticsStylesheetBehind: (stylesheet, script) =>
        `De stylesheet loopt achter: die is versie ${stylesheet} en de JavaScript is versie ${script}. Kopieer een nieuwere css/themes.css.`,
    diagnosticsScriptBehind: (stylesheet, script) =>
        `De JavaScript loopt achter: de stylesheet is versie ${stylesheet} en de JavaScript is versie ${script}. Kopieer nieuwere bestanden uit js/.`,
    diagnosticsThemesDiffer: (version) =>
        `Beide helften zeggen versie ${version} en toch kennen ze andere thema’s, dus minstens een van de twee bestanden is met de hand aangepast.`,
    diagnosticsNoVersion:
        'De stylesheet geeft geen versie op, dus hij werd gemaakt voor 3.2.0: ouder dan de JavaScript ernaast, wat die ook zegt.',
    diagnosticsOnlyInStylesheet: (names) => `Alleen de stylesheet heeft: ${names}`,
    diagnosticsOnlyInScript: (names) => `Alleen de JavaScript heeft: ${names}`,
    diagnosticsUnknownVersion: 'niet opgegeven',
    triInclude: 'verplicht',
    triExclude: 'weggelaten',
    triAny: 'maakt niet uit',
    triAnnounce: (label, state) => `${label}: ${state}`,
    triHint: 'Tik één keer op een chip om hem verplicht te maken, twee keer om hem weg te laten, een derde keer om hem los te laten.',
    triSummary: (include, exclude) => {
        const line = [include.length ? `met ${include.join(', ')}` : '', exclude.length ? `zonder ${exclude.join(', ')}` : '']
            .filter(Boolean)
            .join(', ');
        return line.charAt(0).toUpperCase() + line.slice(1);
    },
    triCleared: 'Elke filter is losgelaten.',
    segmentedSearchAll: (n) => `Alle ${n} doorzoeken`,
};
