// Attach everything, once, when the document is ready [KT6].
//
// The one file in js/ that is allowed a side effect, and it says so in
// package.json. Every other module is pure since 3.0.0: importing it
// does nothing, and a consumer calls attachX() when the markup is there.
// This entry is for the consumer who wants what 2.x did — one script tag
// and the page comes alive — and it is what kyu and almanac load.
//
//   <script type="module" src="/js/auto.js"></script>
//
// It attaches to the whole document. A consumer who renders parts of a
// page later calls the individual attach functions on that subtree.
//
// Only what the page carries is fetched [scope-115]. Until 6.1.0 this file
// imported every module and called every attach function; each walked the
// document for its own selector and, on a page without that component,
// found nothing — after the browser had downloaded and parsed it. Now the
// document is asked first, one querySelector per module, and a module is
// `import()`ed only when its selector matches. The attach functions are the
// modules' own, untouched; what changes is when their module arrives, so
// `attachAll()` is asynchronous: the detach it returns carries `ready`, a
// promise that resolves once every needed module has attached, and
// `modules`, the names fetched (complete once `ready` resolves: a `late`
// module the others gave work to is asked for after they attached).
//
// Four modules are not asked about, because what they do does not depend on
// markup a load-time check can see (measured over every attach function,
// 2026-09-17): remember restores state before the first frame; overlays
// dismisses toasts made later by `toast()` and watches for popovers added
// later; the theme picker's module keeps a theme chosen in another tab in
// step; effects arms its attribute on the root, which every register
// styles, and acts on theme knobs rather than on markup.
//
// The selectors below are each attach function's own. tests/auto-lazy.spec.mjs
// opens every page that loads this file twice — as it is, and with the eager
// entry of 6.1.0 served in its place — and the markup must come out the same.

import { applyStoredTheme } from './no-flash.js';
import { applyTheme } from './theme-core.js';
import { THEMES } from './theme-registry.js';
import { attachRemembered, restoreRemembered } from './remember.js';
import { attachDialogs, attachDismissals, attachScrollbars, attachTabs, attachTooltips } from './overlays.js';
import { attachThemePickers } from './theme-picker.js';
import { attachEffects } from './effects.js';
import { asOf, presentUnder, settleAfter } from './as-of.js';
import { applyStoredCalm } from './calm.js';

/**
 * @typedef {object} Need
 * @property {string} name the module, as `detach.modules` reports it
 * @property {string} when every selector through which the module's attach functions act
 * @property {() => Promise<any>} load
 * @property {(module: any, root: ParentNode) => unknown[]} attach
 * @property {boolean} [late] attaches after every other module the same attachAll() fetched, and is asked for then
 */

/** @type {Need[]} */
export const NEEDS = [
    {
        name: 'components',
        when: [
            '[data-kp-contract-error]',
            '[data-kp-destructive]',
            '[data-kp-semantic]',
            '[data-kp-confirm]',
            '[data-kp-type-confirm]',
            '.kp-skip-link',
            '[data-kp-skip]',
            '[data-kp-to-top]',
            '[data-kp-nav-toggle]',
            '.kp-nav-wrap--sticky',
            '.kp-nav',
        ].join(', '),
        load: () => import('./components.js'),
        attach: (m, root) => [
            m.enforceContracts(root),
            m.attachConfirmations(root),
            m.attachTypeConfirms(root),
            m.attachSkipLinks(root),
            m.attachToTop(root),
            m.attachNavToggles(root),
            m.attachStickyNavs(root),
            m.attachNavMenus(root),
        ],
    },
    { name: 'sidenav', when: '.kp-sidenav', load: () => import('./sidenav.js'), attach: (m, root) => [m.attachSidenavs(root)] },
    { name: 'alarm', when: '[data-kp-alarm]', load: () => import('./alarm.js'), attach: (m, root) => [m.attachAlarms(root)] },
    {
        name: 'combobox',
        when: '[data-kp-combobox], select',
        load: () => import('./combobox.js'),
        attach: (m, root) => [m.attachComboboxes(root), m.attachSelects(root)],
    },
    {
        name: 'palette',
        when: '[data-kp-palette], [data-kp-shortcuts]',
        load: () => import('./palette.js'),
        attach: (m, root) => [m.attachPalettes(root)],
    },
    { name: 'datatable', when: '[data-kp-datatable]', load: () => import('./datatable.js'), attach: (m, root) => [m.attachDataTables(root)] },
    { name: 'tables', when: '.kp-table-wrap', load: () => import('./tables.js'), attach: (m, root) => [m.attachTableRegions(root)] },
    {
        name: 'forms',
        when: '[data-kp-form], [data-kp-submit], .kp-switch, [data-kp-formgrid-stage]',
        load: () => import('./forms.js'),
        attach: (m, root) => [m.attachForms(root), m.attachSwitches(root), m.attachFormgridStages(root)],
    },
    {
        name: 'patterns',
        when: '[data-kp-copy], [data-kp-undo-action], [data-kp-secret]',
        load: () => import('./patterns.js'),
        attach: (m, root) => [m.attachPatterns(root)],
    },
    {
        name: 'structure',
        when: '[data-kp-tree], [data-kp-reorder], [data-kp-split]',
        load: () => import('./structure.js'),
        attach: (m, root) => [m.attachStructure(root)],
    },
    { name: 'datepicker', when: '[data-kp-datepicker]', load: () => import('./datepicker.js'), attach: (m, root) => [m.attachDatePickers(root)] },
    { name: 'upload', when: '[data-kp-upload]', load: () => import('./upload.js'), attach: (m, root) => [m.attachUploads(root)] },
    { name: 'wizard', when: '[data-kp-wizard]', load: () => import('./wizard.js'), attach: (m, root) => [m.attachWizards(root)] },
    { name: 'colorpicker', when: '[data-kp-colorpicker]', load: () => import('./colorpicker.js'), attach: (m, root) => [m.attachColorPickers(root)] },
    { name: 'gridlayout', when: '[data-kp-grid]', load: () => import('./gridlayout.js'), attach: (m, root) => [m.attachGrids(root)] },
    { name: 'log', when: '[data-kp-source]', load: () => import('./log.js'), attach: (m, root) => [m.attachLogs(root)] },
    { name: 'progressbar', when: '.kp-progressbar', load: () => import('./progressbar.js'), attach: (m, root) => [m.attachProgressbars(root)] },
    // The live step list of a run [scope-143].
    { name: 'steplist', when: '.kp-steplist', load: () => import('./steplist.js'), attach: (m, root) => [m.attachSteplists(root)] },
    // The dashboard components [scope-143]: row buttons on shared columns,
    // the KPI tile's sparkline and filter toggle, the attention band and
    // the time chart.
    { name: 'actions', when: '.kp-row-actions', load: () => import('./actions.js'), attach: (m, root) => [m.attachActionColumns(root)] },
    // Rows the keyboard walks, j / k [kpadopt4-rows].
    { name: 'row-keys', when: '[data-kp-row-keys]', load: () => import('./actions.js'), attach: (m, root) => [m.attachRowKeys(root)] },
    {
        name: 'kpi',
        when: 'svg[data-kp-spark], button.kp-kpi--toggle, .kp-kpis[data-kp-kpis-columns]',
        load: () => import('./kpi.js'),
        attach: (m, root) => [m.attachSparklines(root), m.attachKpiToggles(root), m.attachKpiStrips(root)],
    },
    // The page's one hover card, filled when it opens [kpadopt-9]. Anchors may
    // appear later: a page that builds them after the boot attaches it itself.
    { name: 'hovercard', when: '[data-kp-hovercard]', load: () => import('./hovercard.js'), attach: (m, root) => [m.attachHoverCards(root)] },
    { name: 'attention', when: '.kp-attention', load: () => import('./attention.js'), attach: (m, root) => [m.attachAttention(root)] },
    // Tiles of one height across a board, and the ticking freshness line
    // (port spec H and I.4).
    { name: 'tiles', when: '[data-kp-tiles-set]', load: () => import('./tiles.js'), attach: (m, root) => [m.attachTileSets(root)] },
    // The arrow keys over a board of tiles, one place in the tab order [gap-tab-count].
    { name: 'tile-keys', when: '[data-kp-tiles-keys]', load: () => import('./tiles.js'), attach: (m, root) => [m.attachTileKeys(root)] },
    { name: 'freshness', when: '[data-kp-ago]', load: () => import('./freshness.js'), attach: (m, root) => [m.attachAgo(root)] },
    { name: 'chart', when: '[data-kp-chart]', load: () => import('./chart.js'), attach: (m, root) => [m.attachCharts(root)] },
    // A bar that folds what does not fit behind a More menu, and the phone's
    // bottom tab bar [kpadopt-nav]. The fold builds its menu on the menu
    // button's module, which it imports itself.
    { name: 'nav-fold', when: '[data-kp-nav-fold]', load: () => import('./nav-fold.js'), attach: (m, root) => [m.attachNavFolds(root)] },
    { name: 'tabbar', when: '.kp-tabbar', load: () => import('./tabbar.js'), attach: (m, root) => [m.attachTabbars(root)] },
    // The count on a tab of the underline row, drawn from its attributes [gap-tab-count].
    {
        name: 'tab-count',
        when: '.kp-tab[data-kp-tab-count], .kp-tab[data-kp-tab-count-state]',
        load: () => import('./tabbar.js'),
        attach: (m, root) => [m.attachTabCounts(root)],
    },
    // The menu button with its rich menu [scope-143]: every other action, grouped.
    { name: 'menu-button', when: '[data-kp-menu-button]', load: () => import('./menu-button.js'), attach: (m, root) => [m.attachMenuButtons(root)] },
    // The segmented control, the list toolbar and the inline key line [kpadopt-controls].
    { name: 'segmented', when: '[data-kp-segmented]', load: () => import('./segmented.js'), attach: (m, root) => [m.attachSegmented(root)] },
    // Action tiles, status rows and the facet list [kpadopt2-tiles].
    { name: 'action-tiles', when: '.kp-action', load: () => import('./action-tiles.js'), attach: (m, root) => [m.attachActionTiles(root)] },
    { name: 'statusrow', when: '.kp-statuslist', load: () => import('./statusrow.js'), attach: (m, root) => [m.attachStatusLists(root)] },
    // A card in four data states [kpadopt4-rows].
    { name: 'card-state', when: '.kp-card[data-kp-state]', load: () => import('./card-state.js'), attach: (m, root) => [m.attachCardStates(root)] },
    { name: 'facets', when: '[data-kp-facets]', load: () => import('./facets.js'), attach: (m, root) => [m.attachFacets(root)] },
    // The identity mark, the share bar, the bullet list, the code block and the live tick [kpadopt4-data].
    { name: 'idmark', when: '[data-kp-idmark]', load: () => import('./idmark.js'), attach: (m, root) => [m.attachIdmarks(root)] },
    { name: 'passkeys', when: '[data-kp-passkeys]', load: () => import('./passkeys.js'), attach: (m, root) => [m.attachPasskeys(root)] },
    { name: 'thread', when: '[data-kp-thread]', load: () => import('./thread.js'), attach: (m, root) => [m.attachThreads(root)] },
    { name: 'stackbar', when: '[data-kp-stackbar]', load: () => import('./stackbar.js'), attach: (m, root) => [m.attachStackbars(root)] },
    { name: 'bullets', when: '[data-kp-bullets]', load: () => import('./bullets.js'), attach: (m, root) => [m.attachBullets(root)] },
    { name: 'code', when: '[data-kp-code]', load: () => import('./code.js'), attach: (m, root) => [m.attachCodes(root)] },
    // The rows group [kpadopt5]: ticking rows with the keyboard, the selection bar, the "N new lines" pill, the JSON box and the request inspector.
    {
        name: 'row-select',
        when: '[data-kp-select-keys], [data-kp-datatable]:has([data-kp-select-row])',
        load: () => import('./row-select.js'),
        attach: (m, root) => [m.attachRowSelect(root)],
    },
    {
        name: 'selection-bar',
        when: '[data-kp-selection]',
        load: () => import('./selection-bar.js'),
        attach: (m, root) => [m.attachSelectionBars(root)],
    },
    { name: 'newpill', when: '[data-kp-follow]', load: () => import('./newpill.js'), attach: (m, root) => [m.attachNewPills(root)] },
    { name: 'json-field', when: 'textarea[data-kp-json]', load: () => import('./json-field.js'), attach: (m, root) => [m.attachJsonFields(root)] },
    {
        name: 'request-inspector',
        when: '[data-kp-requests]',
        load: () => import('./request-inspector.js'),
        attach: (m, root) => [m.attachRequestInspectors(root)],
    },
    { name: 'tick', when: '[data-kp-tick]', load: () => import('./tick.js'), attach: (m, root) => [m.attachTicks(root)] },
    { name: 'wheel', when: '[data-kp-wheel]', load: () => import('./wheel.js'), attach: (m, root) => [m.attachWheels(root)] },
    { name: 'focus-steps', when: '[data-kp-focus-steps]', load: () => import('./focus-steps.js'), attach: (m, root) => [m.attachFocusSteps(root)] },
    { name: 'timer', when: '[data-kp-timers], [data-kp-timer-start]', load: () => import('./timer.js'), attach: (m, root) => [m.attachTimers(root)] },
    { name: 'checklist', when: '[data-kp-checklist]', load: () => import('./checklist.js'), attach: (m, root) => [m.attachChecklists(root)] },
    // A quantity with minus and plus, the kitchen timers, the checklist, one step at a time and the wheel [kpadopt4].
    { name: 'quantity', when: '[data-kp-quantity]', load: () => import('./quantity.js'), attach: (m, root) => [m.attachQuantities(root)] },
    { name: 'toolbar', when: '[data-kp-toolbar]', load: () => import('./toolbar.js'), attach: (m, root) => [m.attachToolbars(root)] },
    { name: 'keys', when: '.kp-kbd[data-kp-key]', load: () => import('./keys.js'), attach: (m, root) => [m.attachKeys(root)] },
    // The month heatmap [scope-143]: a month of days, each a plate in the
    // colour of its state; the page gives the days with setCalendarDays().
    { name: 'calendar', when: '[data-kp-calendar]', load: () => import('./calendar.js'), attach: (m, root) => [m.attachCalendars(root)] },
    // The heat grid, the matrix and the value with a bar in a table cell [kpadopt2-grids].
    { name: 'heat', when: '[data-kp-heat]', load: () => import('./heat.js'), attach: (m, root) => [m.attachHeats(root)] },
    { name: 'matrix', when: '[data-kp-matrix]', load: () => import('./heat.js'), attach: (m, root) => [m.attachMatrices(root)] },
    { name: 'barcell', when: '[data-kp-bar]', load: () => import('./barcell.js'), attach: (m, root) => [m.attachBarCells(root)] },
    // The week agenda and the run timeline [kpadopt-time]: items placed in the days of a week, and runs as bars on a live time axis.
    { name: 'week', when: '[data-kp-week]', load: () => import('./week.js'), attach: (m, root) => [m.attachWeeks(root)] },
    { name: 'gantt', when: '[data-kp-gantt]', load: () => import('./gantt.js'), attach: (m, root) => [m.attachGantts(root)] },
    // The drawing at the top of an empty state, in the theme's own hand [kpadopt4].
    { name: 'art', when: '[data-kp-art]', load: () => import('./art.js'), attach: (m, root) => [m.attachArt(root)] },
    // The pipeline [kpadopt4]: a read-only board, a lane per stage with its cards.
    { name: 'pipeline', when: '[data-kp-pipeline]', load: () => import('./pipeline.js'), attach: (m, root) => [m.attachPipelines(root)] },
    // The uptime strip [kpadopt4-ideas]: one cell per period, toned up, degraded, down or without data, in exact figures.
    { name: 'uptime', when: '[data-kp-uptime]', load: () => import('./uptime.js'), attach: (m, root) => [m.attachUptimes(root)] },
    // The command block [kpadopt4-ideas]: one command with its terminal, its admin or sudo badge and a copy that confirms.
    { name: 'command', when: '[data-kp-command]', load: () => import('./command.js'), attach: (m, root) => [m.attachCommands(root)] },
    // The two timers [kpadopt4-ideas]: a countdown in digits, and the time left as a shrinking disc.
    { name: 'countdown', when: '[data-kp-countdown], [data-kp-countdown-until]', load: () => import('./countdown.js'), attach: (m, root) => [m.attachCountdowns(root)] },
    { name: 'timer-disc', when: '[data-kp-timer-disc], [data-kp-timer-disc-until]', load: () => import('./timer-disc.js'), attach: (m, root) => [m.attachTimerDiscs(root)] },
    // The range picker [kpadopt4-ideas]: presets as the segmented control, and a custom from–to with the date picker.
    { name: 'range', when: '[data-kp-range]', load: () => import('./range.js'), attach: (m, root) => [m.attachRanges(root)] },
    // The compare slider [kpadopt4-ideas]: two versions stacked with a divider between them.
    { name: 'compare', when: '[data-kp-compare]', load: () => import('./compare.js'), attach: (m, root) => [m.attachCompares(root)] },
    // Calm mode's switch, the live shortcut sheet, the lede, the problem alerts, the flash button and the reason of a disabled control [kpadopt5].
    { name: 'calm', when: '[data-kp-calm-switch]', load: () => import('./calm.js'), attach: (m, root) => [m.attachCalm(root)] },
    {
        name: 'shortcuts',
        when: '[data-kp-shortcuts][data-kp-shortcuts-live]',
        load: () => import('./shortcuts.js'),
        attach: (m, root) => [m.attachShortcuts(root)],
    },
    { name: 'lede', when: '.kp-lede', load: () => import('./lede.js'), attach: (m, root) => [m.attachLedes(root)] },
    { name: 'problems', when: '[data-kp-problems]', load: () => import('./problems.js'), attach: (m, root) => [m.attachProblems(root)] },
    {
        name: 'flash',
        when: '[data-kp-flash-button], [data-kp-post]',
        load: () => import('./flash.js'),
        attach: (m, root) => [m.attachFlashButtons(root)],
    },
    // A list and its detail that folds on a phone [kpadopt5-ops].
    {
        name: 'master-detail',
        when: '[data-kp-master-detail]',
        load: () => import('./master-detail.js'),
        attach: (m, root) => [m.attachMasterDetails(root)],
    },
    // The automatic refresh chooser [kpadopt5-ops].
    { name: 'auto-refresh', when: '[data-kp-refresh]', load: () => import('./auto-refresh.js'), attach: (m, root) => [m.attachRefresh(root)] },
    // The offline and reconnecting banner [kpadopt5-ops].
    { name: 'connection', when: '[data-kp-connection]', load: () => import('./connection.js'), attach: (m, root) => [m.attachConnection(root)] },
    // A transfer with its speed and the time left [kpadopt5-ops].
    { name: 'transfer', when: '[data-kp-transfer]', load: () => import('./transfer.js'), attach: (m, root) => [m.attachTransfers(root)] },
    // The question card's region [kpadopt5-ops]; the cards are made with askQuestion().
    { name: 'question-card', when: '[data-kp-questions]', load: () => import('./question-card.js'), attach: (m, root) => [m.attachQuestions(root)] },
    // The notification centre [kpadopt5-ops].
    // The activity feed [gap-activity-feed-1019]: rows with a state mark, an actor chip and the ticking time, grouped by day.
    { name: 'feed', when: '[data-kp-feed]', load: () => import('./feed.js'), attach: (m, root) => [m.attachFeeds(root)] },
    { name: 'notices', when: '[data-kp-notices]', load: () => import('./notices.js'), attach: (m, root) => [m.attachNotices(root)] },
    // The time and sentence parts [kpadopt5-time]: the weekday picker, the next-runs list, the snooze picker, the dated option picker, the sentence form, the slider and the unsaved-changes bar.
    { name: 'rating', when: '[data-kp-rating]', load: () => import('./rating.js'), attach: (m, root) => [m.attachRatings(root)] },
    { name: 'quote', when: '[data-kp-quote], [data-kp-quote-list]', load: () => import('./quote.js'), attach: (m, root) => [m.attachQuotes(root)] },
    { name: 'usual-picker', when: '[data-kp-usual]', load: () => import('./usual-picker.js'), attach: (m, root) => [m.attachUsualPickers(root)] },
    { name: 'toggle', when: '[data-kp-toggle]', load: () => import('./toggle.js'), attach: (m, root) => [m.attachToggles(root)] },
    {
        name: 'version-delta',
        when: '[data-kp-version-to], [data-kp-version-from], .kp-badge--version[data-kp-state]',
        load: () => import('./version-delta.js'),
        attach: (m, root) => [m.attachVersionDeltas(root)],
    },
    { name: 'ack-gate', when: '[data-kp-ack]', load: () => import('./ack-gate.js'), attach: (m, root) => [m.attachAckGates(root)] },
    { name: 'deplist', when: '[data-kp-deplist]', load: () => import('./deplist.js'), attach: (m, root) => [m.attachDeplists(root)] },
    { name: 'path-trace', when: '[data-kp-trace]', load: () => import('./path-trace.js'), attach: (m, root) => [m.attachTraces(root)] },
    { name: 'entity-card', when: '[data-kp-entity-grid]', load: () => import('./entity-card.js'), attach: (m, root) => [m.attachEntityCards(root)] },
    { name: 'unsaved', when: '[data-kp-unsaved]', load: () => import('./unsaved.js'), attach: (m, root) => [m.attachUnsaved(root)] },
    // The media wave [kpadopt6-media]: the growing text box, the link anchors, the print words, the document preview, the gallery.
    { name: 'autosize', when: 'textarea[data-kp-autosize]', load: () => import('./autosize.js'), attach: (m, root) => [m.attachAutosize(root)] },
    { name: 'anchors', when: '[data-kp-anchors]', load: () => import('./anchors.js'), attach: (m, root) => [m.attachAnchors(root)] },
    {
        name: 'print',
        when: '[data-kp-print-action], [data-kp-checklist], [data-kp-print-sheet]',
        load: () => import('./print.js'),
        attach: (m, root) => [m.attachPrint(root)],
    },
    {
        name: 'docpreview',
        when: '[data-kp-preview], .kp-docglyph',
        load: () => import('./docpreview.js'),
        attach: (m, root) => [m.attachDocPreviews(root)],
    },
    { name: 'gallery', when: '[data-kp-gallery]', load: () => import('./gallery.js'), attach: (m, root) => [m.attachGalleries(root)] },
    { name: 'slider', when: '[data-kp-slider]', load: () => import('./slider.js'), attach: (m, root) => [m.attachSliders(root)] },
    { name: 'sentence', when: '[data-kp-sentence]', load: () => import('./sentence.js'), attach: (m, root) => [m.attachSentences(root)] },
    {
        name: 'dated-options',
        when: '[data-kp-dated]',
        load: () => import('./dated-options.js'),
        attach: (m, root) => [m.attachDatedOptions(root)],
    },
    { name: 'snooze', when: '[data-kp-snooze]', load: () => import('./snooze.js'), attach: (m, root) => [m.attachSnoozes(root)] },
    { name: 'runs', when: '[data-kp-runs]', load: () => import('./runs.js'), attach: (m, root) => [m.attachRuns(root)] },
    { name: 'weekdays', when: '[data-kp-weekdays]', load: () => import('./weekdays.js'), attach: (m, root) => [m.attachWeekdays(root)] },
    { name: 'graph', when: '[data-kp-graph]', load: () => import('./graph.js'), attach: (m, root) => [m.attachGraphs(root)] },
    {
        // A theme's loading picture made of pieces (`--kp-loading-pieces`,
        // pastel's caterpillar [scope-141]): every part that can wait, and the
        // components that make one wait later. A theme that names none gets
        // no piece.
        name: 'loading-pieces',
        when: '.kp-skeleton, .kp-progressbar, .kp-meter, .kp-kpi, .kp-card, .kp-spinner, [data-kp-datatable], [data-kp-calendar], [data-kp-menu-button]',
        load: () => import('./loading-pieces.js'),
        attach: (m, root) => [m.attachLoadingPieces(root)],
    },
    {
        // Every box that changes size after it is drawn, and every dialog's
        // close [scope-142]: the selector is the module's own.
        name: 'motion',
        when: 'dialog.kp-dialog, .kp-accordion__item, .kp-tabs, .kp-datatable, .kp-toasts, .kp-upload__list, .kp-combobox__list, .kp-tree, .kp-wizard, .kp-field, [data-kp-size-motion]',
        load: () => import('./motion.js'),
        attach: (m, root) => [m.attachMotion(root)],
    },
    { name: 'claim', when: '[data-kp-checklist-claim]', load: () => import('./claim.js'), attach: (m, root) => [m.attachClaims(root)] },
    {
        name: 'availability',
        when: '[data-kp-availability]',
        load: () => import('./availability.js'),
        attach: (m, root) => [m.attachAvailability(root)],
    },
    { name: 'qr', when: '[data-kp-qr]', load: () => import('./qr.js'), attach: (m, root) => [m.attachQr(root)] },
    { name: 'timefield', when: '[data-kp-time]', load: () => import('./timefield.js'), attach: (m, root) => [m.attachTimes(root)] },
    {
        // A data component keeps the height it had while a state shows in its place [t56-statefix-1018]: the matrix, the heat grid, the entity
        // grid, the checklist, the notices, the activity feed, the gallery, the availability grid, the request inspector, the pipeline, the diff view, the data table, the runs list, the run timeline, the week, the chart, the dependency list, the code view and the operations page. The selector is
        // `FOOTPRINT_HOSTS` of js/footprint.js.
        name: 'footprint',
        when: '[data-kp-matrix], [data-kp-heat], [data-kp-entity-grid], [data-kp-checklist], [data-kp-notices], [data-kp-feed], [data-kp-gallery], [data-kp-availability], [data-kp-requests], [data-kp-pipeline], [data-kp-diffview], [data-kp-datatable], [data-kp-runs], [data-kp-gantt], [data-kp-week], [data-kp-chart], [data-kp-deplist], [data-kp-code], .kp-ops',
        load: () => import('./footprint.js'),
        attach: (m, root) => [m.attachFootprints(root)],
    },
    { name: 'console', when: '[data-kp-console]', load: () => import('./console.js'), attach: (m, root) => [m.attachConsoles(root)] },
    { name: 'logviewer', when: '[data-kp-logviewer]', load: () => import('./logviewer.js'), attach: (m, root) => [m.attachLogViewers(root)] },
    { name: 'diff', when: '[data-kp-diffview]', load: () => import('./diff.js'), attach: (m, root) => [m.attachDiffs(root)] },
    {
        // The reason of a disabled control [kpadopt5], last and late: a dozen
        // modules mark the controls they draw or own disabled with a reason as
        // they attach (calm mode's switch when the system asks for less motion,
        // the document preview, the QR code, the gallery, …), so the page at
        // load can carry none and still need it. With every module attached in
        // one pass it was the order that made that work; fetched on demand,
        // the module is asked for once the others have attached, and attaches
        // after them whenever it arrived. Last here too, so an entry that
        // attaches in this order (tests/auto-lazy.spec.mjs) attaches it last.
        name: 'reason',
        when: '[data-kp-disabled-reason]',
        load: () => import('./reason.js'),
        attach: (m, root) => [m.attachDisabledReasons(root)],
        late: true,
    },
];

/** Set on <html> once the boot's `attachAll()` has attached everything the page needed: the names fetched, space-separated. */
export const READY_ATTRIBUTE = 'data-kp-auto-ready';

/** @param {ParentNode} root @param {string} selector */
const carries = (root, selector) => (root instanceof Element && root.matches(selector)) || root.querySelector(selector) !== null;

/** @param {ParentNode} root @returns {Element[]} `root` itself when it is an element, and everything under it */
const everyUnder = (root) => [...(root instanceof Element ? [root] : []), ...root.querySelectorAll('*')];

/**
 * Run `attach`, and add to `drawn` every element it put under `root` while it
 * ran. The records are taken before the observer could deliver them, so what
 * counts is exactly what the attach itself drew, never what a framework
 * rendered while the module was on its way.
 *
 * @template T
 * @param {ParentNode} root
 * @param {WeakSet<Element>} drawn
 * @param {() => T} attach
 * @returns {T}
 */
const drawing = (root, drawn, attach) => {
    if (typeof MutationObserver !== 'function') return attach();
    const watch = new MutationObserver(() => undefined);
    watch.observe(root, { childList: true, subtree: true });
    try {
        return attach();
    } finally {
        for (const record of watch.takeRecords()) {
            for (const node of record.addedNodes) if (node instanceof Element) for (const element of everyUnder(node)) drawn.add(element);
        }
        watch.disconnect();
    }
};

/**
 * Attach every behaviour under `root`, fetching only the modules it needs.
 * Returns one detach for all of it; `ready` resolves once every needed
 * module has attached, and `modules` names what was fetched.
 *
 * @param {ParentNode} [root]
 * @returns {(() => void) & { ready: Promise<void>, modules: string[] }}
 */
export function attachAll(root = document) {
    // Before every attach: what a reader chose last time goes back onto the
    // markup, and each module then reads the markup it always read
    // [js/remember.js]. A subtree rendered after the boot is restored here.
    restoreRemembered(root);
    /** @type {unknown[]} */
    const detaches = [
        attachRemembered(root),
        attachDialogs(root),
        attachDismissals(root),
        attachTooltips(root),
        attachScrollbars(root),
        attachTabs(root),
        attachThemePickers(root),
    ];
    // The effects handle is an object rather than a function [AR34]; its
    // detach is called with the others.
    const effects = attachEffects(/** @type {Document | Element} */ (root));
    // Taken after the attaches above, so an element one of them added counts
    // as there, as it did when every module attached in one pass.
    const present = presentUnder(root);
    let detached = false;
    /** @type {string[]} */
    const modules = [];
    /** What the fetched modules drew while they attached. @type {WeakSet<Element>} */
    const drawn = new WeakSet();
    /** @param {Need} need @param {Promise<any>} loading @param {WeakSet<Element>} asked the elements it attaches against */
    const attachOnce = (need, loading, asked) =>
        loading.then((module) => {
            // Detached before the module arrived: attach nothing.
            if (detached) return;
            detaches.push(...drawing(root, drawn, () => asOf(root, asked, () => need.attach(module, root))));
        });
    /** @type {Map<Need, Promise<any>>} a late module the page carries at load is fetched at once and attached later */
    const prefetched = new Map();
    /** @type {Promise<void>[]} */
    const pending = [];
    for (const need of NEEDS) {
        if (!carries(root, need.when)) continue;
        modules.push(need.name);
        if (need.late) prefetched.set(need, need.load());
        else pending.push(attachOnce(need, need.load(), present));
    }
    // The late modules, once the others have attached: asked for against what
    // was there at the start and what those modules drew or marked, and never
    // what a framework rendered since (js/as-of.js).
    const ready = Promise.all(pending).then(() => {
        const late = NEEDS.filter((need) => need.late && (prefetched.has(need) || carries(root, need.when)));
        if (detached || !late.length) return undefined;
        const asked = new WeakSet(everyUnder(root).filter((element) => present.has(element) || drawn.has(element)));
        /** @param {string} selector */
        const askedFor = (selector) =>
            [...(root instanceof Element && root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)].some((element) =>
                asked.has(element),
            );
        return Promise.all(
            late.map((need) => {
                const loading = prefetched.get(need);
                if (loading) return attachOnce(need, loading, asked);
                if (!askedFor(need.when)) return undefined;
                modules.push(need.name);
                return attachOnce(need, need.load(), asked);
            }),
        ).then(() => undefined);
    });
    // What the modules draw now is the page's first render, not news: the
    // root settles until they have all attached and two frames are painted,
    // and js/motion.js lets nothing arrive or glide under it meanwhile
    // [fix-100]. A module fetched later than motion (the data table, three
    // thousand lines) drew its whole chrome into an eased box, and 263
    // elements arrived on the catalogue's first frame.
    const mark = root instanceof Document ? root.documentElement : root instanceof Element ? root : null;
    const settled = mark ? settleAfter(mark, ready) : () => undefined;
    const detach = () => {
        detached = true;
        settled();
        for (const one of detaches) if (typeof one === 'function') one();
        effects.detach();
    };
    return Object.assign(detach, { ready, modules });
}

if (typeof document !== 'undefined') {
    applyStoredTheme();
    // Calm mode is kept per device and goes back on the root before the first frame [kpadopt5].
    applyStoredCalm();
    // The same moment, for the same reason: this module is deferred, so it
    // runs after the parse and before the first frame. A state restored at
    // DOMContentLoaded instead would be a state the reader saw flip.
    restoreRemembered();
    // `?theme=<name>` picks a theme for this load without storing it
    // [AR42], on a page that opts in with `data-kp-theme-from-query` on
    // <html>: the concept demo is one page rendered under every theme, and
    // its index links `concept.html?theme=<name>` for all twenty-four so
    // Kenny opens a URL rather than a picker. Opt-in, because a consumer's
    // dashboard honouring a query parameter it never asked for is scope
    // creep (the critic's objection). An unknown name is ignored; the
    // stored theme stands.
    if (document.documentElement.hasAttribute('data-kp-theme-from-query')) {
        try {
            const wanted = new URLSearchParams(location.search).get('theme');
            if (wanted !== null && THEMES.some((theme) => theme.name === wanted)) applyTheme(wanted);
        } catch {
            // No location (a non-browser document): nothing to read.
        }
    }
    const start = () => {
        const attached = attachAll();
        attached.ready.then(() => document.documentElement.setAttribute(READY_ATTRIBUTE, attached.modules.join(' ')));
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
}
