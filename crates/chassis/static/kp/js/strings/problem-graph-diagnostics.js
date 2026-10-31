// The words of problems, flashes, the graph, breadcrumbs, pagination, themes and diagnostics.

/**
 * @typedef {object} ProblemGraphDiagnosticsStrings
 * @property {string} problemRemedy  The label before the remedy of a problem, "What now" (js/problems.js) [kpadopt5]
 * @property {(n: number) => string} problemShowOthers  The button that opens the problems folded away, "Show the other 3" [kpadopt5]
 * @property {string} problemShowFewer  The button that folds them again [kpadopt5]
 * @property {string} problemCopy  The copy button on a remedy that is a command [kpadopt5]
 * @property {(n: number) => string} problemListLabel  The name of a list of problems for a screen reader, "3 problems" [kpadopt5]
 * @property {string} flashDone  The word on a button after its work went well and the page gave no word of its own (js/flash.js) [kpadopt5]
 * @property {string} flashRefused  The word on a button after the work was refused [kpadopt5]
 * @property {string} flashFailed  The word on a button after the work failed without an answer [kpadopt5]
 * @property {string} graphShowAll  The network graph's way back to every node and every kind of link (js/graph.js) [scope-143]
 * @property {string} graphShowAllTitle  Its title [scope-143]
 * @property {string} graphHint  The hint under the graph, and the second half of its picture's accessible name: what a pointer, a click and the keys do [scope-143]
 * @property {string} graphKinds  The name of the list of kinds of link over the graph [scope-143]
 * @property {string} graphLoading  A loading graph's sentence when the page gives none (`setGraphState(el, 'loading')`) [scope-143]
 * @property {string} graphUnnamed  The picture's name when the graph has no `aria-label` [scope-143]
 * @property {string} graphZoom  The name of the group of zoom controls inside the graph (`data-kp-zoom`) [graph-1020]
 * @property {string} graphZoomIn  The zoom-in control's name [graph-1020]
 * @property {string} graphZoomOut  The zoom-out control's name [graph-1020]
 * @property {string} graphZoomReset  The words on the control that puts the view back [graph-1020]
 * @property {string} graphZoomResetTitle  Its title and accessible name [graph-1020]
 * @property {string} graphZoomHint  The sentence added to the hint while zoom is on: wheel or pinch, drag, the keys [graph-1020]
 * @property {string} graphDetailHint  The sentence added to the hint while details are on: what a pick opens and what Esc does [graph-1020]
 * @property {string} graphDetailClose  The words on the button that closes a node's details [graph-1020]
 * @property {string} graphDetailCloseTitle  Its title [graph-1020]

 * @property {string} breadcrumb
 * @property {string} pagination
 * @property {string} themePicker
 * @property {string} themeSaveFailed
 * @property {string} themeSaveRefused
 * @property {string} contractDestructive
 * @property {string} contractSemantic
 * @property {string} themeGroupLight
 * @property {string} themeGroupDark
 * @property {(requested: string, applied: string) => string} themeUnknown
 * @property {(name: string, component: string) => string} rememberClash  The console warning when two elements of one component ask to be remembered under the same name
 * @property {(theme: string, href: string) => string} registerLoadFailed  The console error when a lazily loaded register did not arrive; the theme stays what it was [scope-50]
 * @property {string} diagnosticsHeading
 * @property {string} diagnosticsStylesheet
 * @property {string} diagnosticsScript
 * @property {string} diagnosticsVersion
 * @property {string} diagnosticsThemes
 * @property {string} diagnosticsEffects  The diagnostics row that lists unknown hook values [AR44]
 * @property {string} diagnosticsEffectsNone
 * @property {string} diagnosticsVerdict
 * @property {string} diagnosticsMatch
 * @property {(stylesheet: string, script: string) => string} diagnosticsStylesheetBehind
 * @property {(stylesheet: string, script: string) => string} diagnosticsScriptBehind
 * @property {(version: string) => string} diagnosticsThemesDiffer
 * @property {string} diagnosticsNoVersion
 * @property {(names: string) => string} diagnosticsOnlyInStylesheet
 * @property {(names: string) => string} diagnosticsOnlyInScript
 * @property {string} diagnosticsUnknownVersion
 * @property {string} triInclude  A three-way filter chip that must be in, as a screen reader hears it after the chip's name (js/segmented.js, `data-kp-segmented="tri"`) [kpadopt4]
 * @property {string} triExclude  A chip that must not be in [kpadopt4]
 * @property {string} triAny  A chip that may or may not be in [kpadopt4]
 * @property {(label: string, state: string) => string} triAnnounce  What a three-way group says after a press, "Chicken: required" [kpadopt4]
 * @property {string} triHint  The line under a three-way group while nothing is chosen [kpadopt4]
 * @property {(include: string[], exclude: string[]) => string} triSummary  The same line once something is chosen [kpadopt4]
 * @property {string} triCleared  What a three-way group says after Clear all [kpadopt4]
 * @property {(n: number) => string} segmentedSearchAll  The placeholder of a field whose chips are only its most used choices: "Search all 9" (js/segmented/link.js) [mc-r2]
 */

/** @type {ProblemGraphDiagnosticsStrings} */
export const PROBLEM_GRAPH_DIAGNOSTICS_STRINGS = {
    problemRemedy: 'What now',
    problemShowOthers: (n) => `Show the other ${n}`,
    problemShowFewer: 'Show fewer',
    problemCopy: 'Copy',
    problemListLabel: (n) => (n === 1 ? '1 problem' : `${n} problems`),
    flashDone: 'Done',
    flashRefused: 'Refused',
    flashFailed: 'Failed',
    // The network graph [scope-143]: its own words; the nodes, kinds and
    // the sentences of its states are the page's.
    graphShowAll: 'Show all',
    graphShowAllTitle: 'Clear the selection and show every kind of link again',
    graphHint:
        'Hover or focus a node to see only its links. Click it, or press Enter, to keep it picked; pick several the same way. Arrow keys move between nodes; Esc shows all.',
    graphKinds: 'Kinds of link',
    graphLoading: 'Reading the network…',
    graphUnnamed: 'Graph',
    graphZoom: 'Zoom',
    graphZoomIn: 'Zoom in',
    graphZoomOut: 'Zoom out',
    graphZoomReset: 'Reset view',
    graphZoomResetTitle: 'Put the picture back at its first size and place (0)',
    graphZoomHint: 'Scroll or pinch to zoom, drag the background to move; with the keys, + and - zoom, 0 resets and Shift with the arrows moves.',
    graphDetailHint: 'A picked node opens its details; Esc closes them first.',
    graphDetailClose: 'Close',
    graphDetailCloseTitle: 'Close the details (Esc)',
    breadcrumb: 'Breadcrumb',
    pagination: 'Pagination',
    themePicker: 'Choose a theme',
    themeSaveFailed: 'This choice will not be remembered — storage is blocked in this browser.',
    themeSaveRefused: 'Not saved on the server — your choice has been put back.',
    /** The two contract violations enforceContracts reports [DI10, DI4]. */
    contractDestructive:
        'A destructive action must offer an undo (data-kp-undo) or a confirmation (data-kp-confirm="phrase"). SC 3.3.4 accepts either; it accepts neither of them missing.',
    contractSemantic: 'A control carrying a semantic colour must also say what it means: colour is never the only carrier.',
    /** The two sections of a grouped theme picker [TH63]. */
    themeGroupLight: 'Light',
    themeGroupDark: 'Dark',
    /**
     * The loud fallback and the diagnostics page [TH97, AR25].
     *
     * The console warning is in here for the same reason the rest is: a
     * consumer whose users are not English speakers should be able to
     * replace it, and a message written into theme-core.js has no door.
     */
    themeUnknown: (requested, applied) =>
        `kp-themes: "${requested}" is not a theme this build knows, so "${applied}" was applied instead. The stored choice was left alone; open the diagnostics page to see which half is behind.`,
    rememberClash: (name, component) =>
        `kp-themes: two ${component} elements both ask to be remembered as "${name}", so only the first one is. Give the second a data-kp-remember of its own.`,
    registerLoadFailed: (theme, href) =>
        `kp-themes: the register for "${theme}" did not load from ${href}, so the page keeps the theme it was wearing. Check the pattern given to attachLazyRegisters().`,
    diagnosticsHeading: 'Stylesheet and JavaScript, side by side',
    diagnosticsStylesheet: 'Stylesheet (css/themes.css)',
    diagnosticsScript: 'JavaScript (js/theme-registry.js)',
    diagnosticsVersion: 'Version',
    diagnosticsThemes: 'Themes',
    diagnosticsEffects: 'Unknown effect hooks',
    diagnosticsEffectsNone: 'none reported on this page',
    diagnosticsVerdict: 'Verdict',
    diagnosticsMatch: 'The stylesheet and the JavaScript come from the same version, and they know the same themes.',
    diagnosticsStylesheetBehind: (stylesheet, script) =>
        `The stylesheet is behind: it is version ${stylesheet} and the JavaScript is version ${script}. Copy a newer css/themes.css.`,
    diagnosticsScriptBehind: (stylesheet, script) =>
        `The JavaScript is behind: the stylesheet is version ${stylesheet} and the JavaScript is version ${script}. Copy newer files from js/.`,
    diagnosticsThemesDiffer: (version) =>
        `Both halves say version ${version} and yet they know different themes, so at least one of the two files has been edited by hand.`,
    diagnosticsNoVersion:
        'The stylesheet declares no version, so it was generated before 3.2.0 — older than the JavaScript beside it, whatever that one says.',
    diagnosticsOnlyInStylesheet: (names) => `Only the stylesheet has: ${names}`,
    diagnosticsOnlyInScript: (names) => `Only the JavaScript has: ${names}`,
    diagnosticsUnknownVersion: 'not declared',
    // A three-way filter chip (js/segmented.js, `data-kp-segmented="tri"`) [kpadopt4].
    triInclude: 'required',
    triExclude: 'left out',
    triAny: 'either way',
    triAnnounce: (label, state) => `${label}: ${state}`,
    triHint: 'Tap a chip once to require it, twice to leave it out, a third time to let it go.',
    triSummary: (include, exclude) => {
        const line = [include.length ? `with ${include.join(', ')}` : '', exclude.length ? `without ${exclude.join(', ')}` : '']
            .filter(Boolean)
            .join(', ');
        return line.charAt(0).toUpperCase() + line.slice(1);
    },
    triCleared: 'Every filter is let go.',
    segmentedSearchAll: (n) => `Search all ${n}`,
};
