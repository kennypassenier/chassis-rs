// The loader's table, part: The dashboard components, tiles, charts, navigation, status rows and the data lists.
// Each entry is one module the loader fetches when its selector matches (see `Need` in js/auto.js); the order is the attach order.

/** @type {import('../auto.js').Need[]} */
export const DASHBOARD_NEEDS = [
    // The live step list of a run [scope-143].
    { name: 'steplist', when: '.kp-steplist', load: () => import('../steplist.js'), attach: (m, root) => [m.attachSteplists(root)] },
    // The dashboard components [scope-143]: row buttons on shared columns,
    // the KPI tile's sparkline and filter toggle, the attention band and
    // the time chart.
    { name: 'actions', when: '.kp-row-actions', load: () => import('../actions.js'), attach: (m, root) => [m.attachActionColumns(root)] },
    // Rows the keyboard walks, j / k [kpadopt4-rows].
    { name: 'row-keys', when: '[data-kp-row-keys]', load: () => import('../actions.js'), attach: (m, root) => [m.attachRowKeys(root)] },
    {
        name: 'kpi',
        when: 'svg[data-kp-spark], button.kp-kpi--toggle, .kp-kpis[data-kp-kpis-columns]',
        load: () => import('../kpi.js'),
        attach: (m, root) => [m.attachSparklines(root), m.attachKpiToggles(root), m.attachKpiStrips(root)],
    },
    // The page's one hover card, filled when it opens [kpadopt-9]. Anchors may
    // appear later: a page that builds them after the boot attaches it itself.
    { name: 'hovercard', when: '[data-kp-hovercard]', load: () => import('../hovercard.js'), attach: (m, root) => [m.attachHoverCards(root)] },
    { name: 'attention', when: '.kp-attention', load: () => import('../attention.js'), attach: (m, root) => [m.attachAttention(root)] },
    // Tiles of one height across a board, and the ticking freshness line
    // (port spec H and I.4).
    { name: 'tiles', when: '[data-kp-tiles-set]', load: () => import('../tiles.js'), attach: (m, root) => [m.attachTileSets(root)] },
    // The arrow keys over a board of tiles, one place in the tab order [gap-tab-count].
    { name: 'tile-keys', when: '[data-kp-tiles-keys]', load: () => import('../tiles.js'), attach: (m, root) => [m.attachTileKeys(root)] },
    { name: 'freshness', when: '[data-kp-ago]', load: () => import('../freshness.js'), attach: (m, root) => [m.attachAgo(root)] },
    { name: 'chart', when: '[data-kp-chart]', load: () => import('../chart.js'), attach: (m, root) => [m.attachCharts(root)] },
    // A bar that folds what does not fit behind a More menu, and the phone's
    // bottom tab bar [kpadopt-nav]. The fold builds its menu on the menu
    // button's module, which it imports itself.
    { name: 'nav-fold', when: '[data-kp-nav-fold]', load: () => import('../nav-fold.js'), attach: (m, root) => [m.attachNavFolds(root)] },
    { name: 'tabbar', when: '.kp-tabbar', load: () => import('../tabbar.js'), attach: (m, root) => [m.attachTabbars(root)] },
    // The count on a tab of the underline row, drawn from its attributes [gap-tab-count].
    {
        name: 'tab-count',
        when: '.kp-tab[data-kp-tab-count], .kp-tab[data-kp-tab-count-state]',
        load: () => import('../tabbar.js'),
        attach: (m, root) => [m.attachTabCounts(root)],
    },
    // The menu button with its rich menu [scope-143]: every other action, grouped.
    { name: 'menu-button', when: '[data-kp-menu-button]', load: () => import('../menu-button.js'), attach: (m, root) => [m.attachMenuButtons(root)] },
    // The segmented control, the list toolbar and the inline key line [kpadopt-controls].
    { name: 'segmented', when: '[data-kp-segmented]', load: () => import('../segmented.js'), attach: (m, root) => [m.attachSegmented(root)] },
    // Action tiles, status rows and the facet list [kpadopt2-tiles].
    { name: 'action-tiles', when: '.kp-action', load: () => import('../action-tiles.js'), attach: (m, root) => [m.attachActionTiles(root)] },
    { name: 'statusrow', when: '.kp-statuslist', load: () => import('../statusrow.js'), attach: (m, root) => [m.attachStatusLists(root)] },
    // A card in four data states [kpadopt4-rows].
    { name: 'card-state', when: '.kp-card[data-kp-state]', load: () => import('../card-state.js'), attach: (m, root) => [m.attachCardStates(root)] },
    { name: 'facets', when: '[data-kp-facets]', load: () => import('../facets.js'), attach: (m, root) => [m.attachFacets(root)] },
    // The identity mark, the share bar, the bullet list, the code block and the live tick [kpadopt4-data].
    { name: 'idmark', when: '[data-kp-idmark]', load: () => import('../idmark.js'), attach: (m, root) => [m.attachIdmarks(root)] },
    { name: 'passkeys', when: '[data-kp-passkeys]', load: () => import('../passkeys.js'), attach: (m, root) => [m.attachPasskeys(root)] },
    { name: 'thread', when: '[data-kp-thread]', load: () => import('../thread.js'), attach: (m, root) => [m.attachThreads(root)] },
    { name: 'stackbar', when: '[data-kp-stackbar]', load: () => import('../stackbar.js'), attach: (m, root) => [m.attachStackbars(root)] },
    { name: 'bullets', when: '[data-kp-bullets]', load: () => import('../bullets.js'), attach: (m, root) => [m.attachBullets(root)] },
    { name: 'code', when: '[data-kp-code]', load: () => import('../code.js'), attach: (m, root) => [m.attachCodes(root)] },
    // The rows group [kpadopt5]: ticking rows with the keyboard, the selection bar, the "N new lines" pill, the JSON box and the request inspector.
    {
        name: 'row-select',
        when: '[data-kp-select-keys], [data-kp-datatable]:has([data-kp-select-row])',
        load: () => import('../row-select.js'),
        attach: (m, root) => [m.attachRowSelect(root)],
    },
    {
        name: 'selection-bar',
        when: '[data-kp-selection]',
        load: () => import('../selection-bar.js'),
        attach: (m, root) => [m.attachSelectionBars(root)],
    },
    { name: 'newpill', when: '[data-kp-follow]', load: () => import('../newpill.js'), attach: (m, root) => [m.attachNewPills(root)] },
    { name: 'json-field', when: 'textarea[data-kp-json]', load: () => import('../json-field.js'), attach: (m, root) => [m.attachJsonFields(root)] },
    {
        name: 'request-inspector',
        when: '[data-kp-requests]',
        load: () => import('../request-inspector.js'),
        attach: (m, root) => [m.attachRequestInspectors(root)],
    },
    { name: 'tick', when: '[data-kp-tick]', load: () => import('../tick.js'), attach: (m, root) => [m.attachTicks(root)] },
    { name: 'wheel', when: '[data-kp-wheel]', load: () => import('../wheel.js'), attach: (m, root) => [m.attachWheels(root)] },
    { name: 'focus-steps', when: '[data-kp-focus-steps]', load: () => import('../focus-steps.js'), attach: (m, root) => [m.attachFocusSteps(root)] },
    { name: 'timer', when: '[data-kp-timers], [data-kp-timer-start]', load: () => import('../timer.js'), attach: (m, root) => [m.attachTimers(root)] },
    { name: 'checklist', when: '[data-kp-checklist]', load: () => import('../checklist.js'), attach: (m, root) => [m.attachChecklists(root)] },
    // A quantity with minus and plus, the kitchen timers, the checklist, one step at a time and the wheel [kpadopt4].
    { name: 'quantity', when: '[data-kp-quantity]', load: () => import('../quantity.js'), attach: (m, root) => [m.attachQuantities(root)] },
    // A button whose words follow a quantity in its dialog: "Add 3 boxes" [mc-r2].
    { name: 'accept-follows', when: '[data-kp-accept-follows]', load: () => import('../accept-follows.js'), attach: (m, root) => [m.attachAcceptFollows(root)] },
    { name: 'toolbar', when: '[data-kp-toolbar]', load: () => import('../toolbar.js'), attach: (m, root) => [m.attachToolbars(root)] },
    { name: 'keys', when: '.kp-kbd[data-kp-key]', load: () => import('../keys.js'), attach: (m, root) => [m.attachKeys(root)] },
];
