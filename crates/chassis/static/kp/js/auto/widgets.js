// The loader's table, part: The calendars, grids, timers, ranges, shortcuts and the last widgets, ending with the late `reason` module.
// Each entry is one module the loader fetches when its selector matches (see `Need` in js/auto.js); the order is the attach order.

/** @type {import('../auto.js').Need[]} */
export const WIDGET_NEEDS = [
    // The month heatmap [scope-143]: a month of days, each a plate in the
    // colour of its state; the page gives the days with setCalendarDays().
    { name: 'calendar', when: '[data-kp-calendar]', load: () => import('../calendar.js'), attach: (m, root) => [m.attachCalendars(root)] },
    // The heat grid, the matrix and the value with a bar in a table cell [kpadopt2-grids].
    { name: 'heat', when: '[data-kp-heat]', load: () => import('../heat.js'), attach: (m, root) => [m.attachHeats(root)] },
    { name: 'matrix', when: '[data-kp-matrix]', load: () => import('../heat.js'), attach: (m, root) => [m.attachMatrices(root)] },
    { name: 'barcell', when: '[data-kp-bar]', load: () => import('../barcell.js'), attach: (m, root) => [m.attachBarCells(root)] },
    // The week agenda and the run timeline [kpadopt-time]: items placed in the days of a week, and runs as bars on a live time axis.
    { name: 'week', when: '[data-kp-week]', load: () => import('../week.js'), attach: (m, root) => [m.attachWeeks(root)] },
    // The editable timeline [timeline-1029]: bars in lanes that are moved, resized and linked.
    { name: 'sequencer', when: '[data-kp-sequencer]', load: () => import('../sequencer.js'), attach: (m, root) => [m.attachSequencers(root)] },
    { name: 'gantt', when: '[data-kp-gantt]', load: () => import('../gantt.js'), attach: (m, root) => [m.attachGantts(root)] },
    // The drawing at the top of an empty state, in the theme's own hand [kpadopt4].
    { name: 'art', when: '[data-kp-art]', load: () => import('../art.js'), attach: (m, root) => [m.attachArt(root)] },
    // The pipeline [kpadopt4]: a read-only board, a lane per stage with its cards.
    { name: 'pipeline', when: '[data-kp-pipeline]', load: () => import('../pipeline.js'), attach: (m, root) => [m.attachPipelines(root)] },
    // The uptime strip [kpadopt4-ideas]: one cell per period, toned up, degraded, down or without data, in exact figures.
    { name: 'uptime', when: '[data-kp-uptime]', load: () => import('../uptime.js'), attach: (m, root) => [m.attachUptimes(root)] },
    // The command block [kpadopt4-ideas]: one command with its terminal, its admin or sudo badge and a copy that confirms.
    { name: 'command', when: '[data-kp-command]', load: () => import('../command.js'), attach: (m, root) => [m.attachCommands(root)] },
    // The two timers [kpadopt4-ideas]: a countdown in digits, and the time left as a shrinking disc.
    { name: 'countdown', when: '[data-kp-countdown], [data-kp-countdown-until]', load: () => import('../countdown.js'), attach: (m, root) => [m.attachCountdowns(root)] },
    { name: 'timer-disc', when: '[data-kp-timer-disc], [data-kp-timer-disc-until]', load: () => import('../timer-disc.js'), attach: (m, root) => [m.attachTimerDiscs(root)] },
    // The range picker [kpadopt4-ideas]: presets as the segmented control, and a custom from–to with the date picker.
    { name: 'range', when: '[data-kp-range]', load: () => import('../range.js'), attach: (m, root) => [m.attachRanges(root)] },
    // The compare slider [kpadopt4-ideas]: two versions stacked with a divider between them.
    { name: 'compare', when: '[data-kp-compare]', load: () => import('../compare.js'), attach: (m, root) => [m.attachCompares(root)] },
    // Calm mode's switch, the live shortcut sheet, the lede, the problem alerts, the flash button and the reason of a disabled control [kpadopt5].
    { name: 'calm', when: '[data-kp-calm-switch]', load: () => import('../calm.js'), attach: (m, root) => [m.attachCalm(root)] },
    {
        name: 'shortcuts',
        when: '[data-kp-shortcuts][data-kp-shortcuts-live]',
        load: () => import('../shortcuts.js'),
        attach: (m, root) => [m.attachShortcuts(root)],
    },
    { name: 'lede', when: '.kp-lede', load: () => import('../lede.js'), attach: (m, root) => [m.attachLedes(root)] },
    { name: 'problems', when: '[data-kp-problems]', load: () => import('../problems.js'), attach: (m, root) => [m.attachProblems(root)] },
    {
        name: 'flash',
        when: '[data-kp-flash-button], [data-kp-post]',
        load: () => import('../flash.js'),
        attach: (m, root) => [m.attachFlashButtons(root)],
    },
    // A list and its detail that folds on a phone [kpadopt5-ops].
    {
        name: 'master-detail',
        when: '[data-kp-master-detail]',
        load: () => import('../master-detail.js'),
        attach: (m, root) => [m.attachMasterDetails(root)],
    },
    // The automatic refresh chooser [kpadopt5-ops].
    { name: 'auto-refresh', when: '[data-kp-refresh]', load: () => import('../auto-refresh.js'), attach: (m, root) => [m.attachRefresh(root)] },
    // The offline and reconnecting banner [kpadopt5-ops].
    { name: 'connection', when: '[data-kp-connection]', load: () => import('../connection.js'), attach: (m, root) => [m.attachConnection(root)] },
    // One sentence for a job with steps and bytes [wish-1120, homelab 98].
    { name: 'job-line', when: '[data-kp-jobline]', load: () => import('../job-line.js'), attach: (m, root) => [m.attachJobLines(root)] },
    // A text box that knows its place in a config file [wish-1120, homelab 94].
    { name: 'code-field', when: 'textarea[data-kp-code-field]', load: () => import('../code-field.js'), attach: (m, root) => [m.attachCodeFields(root)] },
    // An on-this-page list with scroll-spy [wish-1120, homelab 95].
    { name: 'page-contents', when: '[data-kp-contents]', load: () => import('../page-contents.js'), attach: (m, root) => [m.attachContents(root)] },
    // Quiet hours: from, to, days and the severities that break through [wish-1120, homelab 96].
    { name: 'quiet-hours', when: '[data-kp-quiet]', load: () => import('../quiet-hours.js'), attach: (m, root) => [m.attachQuietHours(root)] },
    // A transfer with its speed and the time left [kpadopt5-ops].
    { name: 'transfer', when: '[data-kp-transfer]', load: () => import('../transfer.js'), attach: (m, root) => [m.attachTransfers(root)] },
    // The question card's region [kpadopt5-ops]; the cards are made with askQuestion().
    { name: 'question-card', when: '[data-kp-questions]', load: () => import('../question-card.js'), attach: (m, root) => [m.attachQuestions(root)] },
    // The notification centre [kpadopt5-ops].
    // The activity feed [gap-activity-feed-1019]: rows with a state mark, an actor chip and the ticking time, grouped by day.
    { name: 'feed', when: '[data-kp-feed]', load: () => import('../feed.js'), attach: (m, root) => [m.attachFeeds(root)] },
    { name: 'notices', when: '[data-kp-notices]', load: () => import('../notices.js'), attach: (m, root) => [m.attachNotices(root)] },
    // The time and sentence parts [kpadopt5-time]: the weekday picker, the next-runs list, the snooze picker, the dated option picker, the sentence form, the slider and the unsaved-changes bar.
    { name: 'rating', when: '[data-kp-rating]', load: () => import('../rating.js'), attach: (m, root) => [m.attachRatings(root)] },
    { name: 'quote', when: '[data-kp-quote], [data-kp-quote-list]', load: () => import('../quote.js'), attach: (m, root) => [m.attachQuotes(root)] },
    { name: 'usual-picker', when: '[data-kp-usual]', load: () => import('../usual-picker.js'), attach: (m, root) => [m.attachUsualPickers(root)] },
    { name: 'toggle', when: '[data-kp-toggle]', load: () => import('../toggle.js'), attach: (m, root) => [m.attachToggles(root)] },
    {
        name: 'version-delta',
        when: '[data-kp-version-to], [data-kp-version-from], .kp-badge--version[data-kp-state]',
        load: () => import('../version-delta.js'),
        attach: (m, root) => [m.attachVersionDeltas(root)],
    },
    { name: 'ack-gate', when: '[data-kp-ack]', load: () => import('../ack-gate.js'), attach: (m, root) => [m.attachAckGates(root)] },
    { name: 'deplist', when: '[data-kp-deplist]', load: () => import('../deplist.js'), attach: (m, root) => [m.attachDeplists(root)] },
    { name: 'path-trace', when: '[data-kp-trace]', load: () => import('../path-trace.js'), attach: (m, root) => [m.attachTraces(root)] },
    { name: 'entity-card', when: '[data-kp-entity-grid]', load: () => import('../entity-card.js'), attach: (m, root) => [m.attachEntityCards(root)] },
    { name: 'unsaved', when: '[data-kp-unsaved]', load: () => import('../unsaved.js'), attach: (m, root) => [m.attachUnsaved(root)] },
    // The media wave [kpadopt6-media]: the growing text box, the link anchors, the print words, the document preview, the gallery.
    { name: 'autosize', when: 'textarea[data-kp-autosize]', load: () => import('../autosize.js'), attach: (m, root) => [m.attachAutosize(root)] },
    { name: 'anchors', when: '[data-kp-anchors]', load: () => import('../anchors.js'), attach: (m, root) => [m.attachAnchors(root)] },
    {
        name: 'print',
        when: '[data-kp-print-action], [data-kp-checklist], [data-kp-print-sheet]',
        load: () => import('../print.js'),
        attach: (m, root) => [m.attachPrint(root)],
    },
    {
        name: 'docpreview',
        when: '[data-kp-preview], .kp-docglyph',
        load: () => import('../docpreview.js'),
        attach: (m, root) => [m.attachDocPreviews(root)],
    },
    { name: 'gallery', when: '[data-kp-gallery]', load: () => import('../gallery.js'), attach: (m, root) => [m.attachGalleries(root)] },
    { name: 'slider', when: '[data-kp-slider]', load: () => import('../slider.js'), attach: (m, root) => [m.attachSliders(root)] },
    { name: 'sentence', when: '[data-kp-sentence]', load: () => import('../sentence.js'), attach: (m, root) => [m.attachSentences(root)] },
    {
        name: 'dated-options',
        when: '[data-kp-dated]',
        load: () => import('../dated-options.js'),
        attach: (m, root) => [m.attachDatedOptions(root)],
    },
    { name: 'snooze', when: '[data-kp-snooze]', load: () => import('../snooze.js'), attach: (m, root) => [m.attachSnoozes(root)] },
    { name: 'runs', when: '[data-kp-runs]', load: () => import('../runs.js'), attach: (m, root) => [m.attachRuns(root)] },
    { name: 'row-editor', when: '[data-kp-rows]', load: () => import('../row-editor.js'), attach: (m, root) => [m.attachRowEditors(root)] },
    { name: 'weekdays', when: '[data-kp-weekdays]', load: () => import('../weekdays.js'), attach: (m, root) => [m.attachWeekdays(root)] },
    { name: 'graph', when: '[data-kp-graph]', load: () => import('../graph.js'), attach: (m, root) => [m.attachGraphs(root)] },
    {
        // A theme's loading picture made of pieces (`--kp-loading-pieces`,
        // pastel's caterpillar [scope-141]): every part that can wait, and the
        // components that make one wait later. A theme that names none gets
        // no piece.
        name: 'loading-pieces',
        when: '.kp-skeleton, .kp-progressbar, .kp-meter, .kp-kpi, .kp-card, .kp-spinner, [data-kp-datatable], [data-kp-calendar], [data-kp-menu-button]',
        load: () => import('../loading-pieces.js'),
        attach: (m, root) => [m.attachLoadingPieces(root)],
    },
    {
        // Every box that changes size after it is drawn, and every dialog's
        // close [scope-142]: the selector is the module's own.
        name: 'motion',
        when: 'dialog.kp-dialog, .kp-accordion__item, .kp-tabs, .kp-datatable, .kp-toasts, .kp-upload__list, .kp-combobox__list, .kp-tree, .kp-wizard, .kp-field, [data-kp-size-motion]',
        load: () => import('../motion.js'),
        attach: (m, root) => [m.attachMotion(root)],
    },
    { name: 'claim', when: '[data-kp-checklist-claim]', load: () => import('../claim.js'), attach: (m, root) => [m.attachClaims(root)] },
    {
        name: 'availability',
        when: '[data-kp-availability]',
        load: () => import('../availability.js'),
        attach: (m, root) => [m.attachAvailability(root)],
    },
    { name: 'qr', when: '[data-kp-qr]', load: () => import('../qr.js'), attach: (m, root) => [m.attachQr(root)] },
    { name: 'timefield', when: '[data-kp-time]', load: () => import('../timefield.js'), attach: (m, root) => [m.attachTimes(root)] },
    {
        // A data component keeps the height it had while a state shows in its place [t56-statefix-1018]: the matrix, the heat grid, the entity
        // grid, the checklist, the notices, the activity feed, the gallery, the availability grid, the request inspector, the pipeline, the diff view, the data table, the runs list, the run timeline, the week, the chart, the dependency list, the code view and the operations page. The selector is
        // `FOOTPRINT_HOSTS` of js/footprint.js.
        name: 'footprint',
        when: '[data-kp-matrix], [data-kp-heat], [data-kp-entity-grid], [data-kp-checklist], [data-kp-notices], [data-kp-feed], [data-kp-gallery], [data-kp-availability], [data-kp-requests], [data-kp-pipeline], [data-kp-diffview], [data-kp-datatable], [data-kp-runs], [data-kp-gantt], [data-kp-sequencer], [data-kp-graph], [data-kp-week], [data-kp-chart], [data-kp-deplist], [data-kp-code], .kp-ops',
        load: () => import('../footprint.js'),
        attach: (m, root) => [m.attachFootprints(root)],
    },
    { name: 'console', when: '[data-kp-console]', load: () => import('../console.js'), attach: (m, root) => [m.attachConsoles(root)] },
    { name: 'logviewer', when: '[data-kp-logviewer]', load: () => import('../logviewer.js'), attach: (m, root) => [m.attachLogViewers(root)] },
    { name: 'diff', when: '[data-kp-diffview]', load: () => import('../diff.js'), attach: (m, root) => [m.attachDiffs(root)] },
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
        load: () => import('../reason.js'),
        attach: (m, root) => [m.attachDisabledReasons(root)],
        late: true,
    },
];
