// The loader's table, part: The page furniture, forms and input widgets: what almost every page carries.
// Each entry is one module the loader fetches when its selector matches (see `Need` in js/auto.js); the order is the attach order.

/** @type {import('../auto.js').Need[]} */
export const PAGE_NEEDS = [
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
        load: () => import('../components.js'),
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
    { name: 'sidenav', when: '.kp-sidenav', load: () => import('../sidenav.js'), attach: (m, root) => [m.attachSidenavs(root)] },
    { name: 'alarm', when: '[data-kp-alarm]', load: () => import('../alarm.js'), attach: (m, root) => [m.attachAlarms(root)] },
    {
        name: 'combobox',
        when: '[data-kp-combobox], select',
        load: () => import('../combobox.js'),
        attach: (m, root) => [m.attachComboboxes(root), m.attachSelects(root)],
    },
    {
        name: 'palette',
        when: '[data-kp-palette], [data-kp-shortcuts]',
        load: () => import('../palette.js'),
        attach: (m, root) => [m.attachPalettes(root)],
    },
    {
        name: 'datatable',
        when: '[data-kp-datatable], [data-kp-cards-at], th[data-kp-col="actions"]',
        load: () => import('../datatable.js'),
        attach: (m, root) => [m.attachDataTables(root), m.attachCardsAt(root), m.attachTableActionColumns(root)],
    },
    { name: 'tables', when: '.kp-table-wrap', load: () => import('../tables.js'), attach: (m, root) => [m.attachTableRegions(root)] },
    {
        name: 'forms',
        when: '[data-kp-form], [data-kp-submit], .kp-switch, [data-kp-formgrid-stage]',
        load: () => import('../forms.js'),
        attach: (m, root) => [m.attachForms(root), m.attachSwitches(root), m.attachFormgridStages(root), m.attachFormgridColumns(root)],
    },
    {
        name: 'patterns',
        when: '[data-kp-copy], [data-kp-undo-action], [data-kp-secret]',
        load: () => import('../patterns.js'),
        attach: (m, root) => [m.attachPatterns(root)],
    },
    {
        name: 'structure',
        when: '[data-kp-tree], [data-kp-reorder], [data-kp-split]',
        load: () => import('../structure.js'),
        attach: (m, root) => [m.attachStructure(root)],
    },
    { name: 'datepicker', when: '[data-kp-datepicker]', load: () => import('../datepicker.js'), attach: (m, root) => [m.attachDatePickers(root)] },
    { name: 'upload', when: '[data-kp-upload]', load: () => import('../upload.js'), attach: (m, root) => [m.attachUploads(root)] },
    { name: 'wizard', when: '[data-kp-wizard]', load: () => import('../wizard.js'), attach: (m, root) => [m.attachWizards(root)] },
    { name: 'colorpicker', when: '[data-kp-colorpicker]', load: () => import('../colorpicker.js'), attach: (m, root) => [m.attachColorPickers(root)] },
    { name: 'gridlayout', when: '[data-kp-grid]', load: () => import('../gridlayout.js'), attach: (m, root) => [m.attachGrids(root)] },
    { name: 'log', when: '[data-kp-source]', load: () => import('../log.js'), attach: (m, root) => [m.attachLogs(root)] },
    { name: 'progressbar', when: '.kp-progressbar', load: () => import('../progressbar.js'), attach: (m, root) => [m.attachProgressbars(root)] },
];
