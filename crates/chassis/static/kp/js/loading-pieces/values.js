// The names a loading part is marked with, the parts that wait by the shape their pieces take, and the measures of the caterpillar.

/** The custom property a register names its pieces in. */
export const PIECES_PROPERTY = '--kp-loading-pieces';

/** The attribute a part carries while its pieces are there. */
export const PIECES_ATTRIBUTE = 'data-kp-pieces';

/** The parts that wait, by the shape the pieces take on them. */
export const PIECE_CARRIERS = /** @type {const} */ ({
    row: '.kp-skeleton:not(.kp-skeleton--circle, .kp-skeleton--block), .kp-progressbar[data-kp-indeterminate] > .kp-progressbar__track, :is(.kp-meter, .kp-kpi__meter)[data-kp-loading], .kp-heat__cells:has(> .kp-heat__cell.kp-skeleton)',
    day: ':is(.kp-calendar--busy-days, .kp-calendar--busy-whole) .kp-calendar__day[data-kp-tone="loading"], .kp-skeleton--circle',
    plate: '.kp-skeleton--block:not(.kp-heat__cell, .kp-matrix__cell), .kp-datatable__busy-panel, .kp-calendar--busy-whole:has(> .kp-calendar__grid[aria-busy="true"]) > .kp-calendar__busy, .kp-menu-button > .kp-menu[aria-busy="true"], .kp-kpi[aria-busy="true"], .kp-card[aria-busy="true"]',
    spinner: '.kp-spinner',
});

/** Every selector of a part that may wait. */
export const ALL = Object.values(PIECE_CARRIERS).join(', ');
/** The attributes whose change can start or stop a part waiting. */
export const WATCHED = ['class', 'aria-busy', 'data-kp-indeterminate', 'data-kp-loading', 'data-kp-tone', 'data-theme', 'hidden'];

/** The measures of the caterpillar, in the unit the shape names (px, a fraction of the row's height, or em). */
export const SHAPE = Object.freeze({
    /** The unit of a day's or plate's legs and heads, in px. */
    unit: 9,
    /** The gap between a spinner's pom-poms and its head, in em, from the nearest to the farthest. */
    spinnerLags: [0.39, 0.26, 0.13],
    /** How far a busy bar's track keeps the pom-poms from its edge, in px. */
    trackInset: 3,
    /** A row's pom-pom spacing, as a share of the row's height. */
    rowStep: 0.78,
    /** What a heat grid's row keeps free at its end, as a share of the row's height. */
    gridReserve: 0.6,
    /** What a row's head takes at its end when the pom-poms are counted, as a share of the row's height. */
    rowHeadRoom: 1.1,
    /** A row's head, as a share of the row's height, and the share of its width that sits beyond its box. */
    rowHead: 1.16,
    rowHeadSpan: 1.18,
    rowHeadBack: 0.05,
    rowHeadRaise: 0.08,
    /** The fewest pom-poms of a row, and the fewest legs of a plate. */
    minCount: 3,
    /** A day's legs sit this far from its middle, in units; its head sits this far beyond its edge and spans this wide. */
    dayLegSpread: 0.9,
    dayHeadOut: 0.7,
    dayHeadSpan: 4.4,
    /** The width one leg of a plate takes, in units. */
    plateLegSpan: 3.4,
    /** A plate's head sits this share of the corner radius in from its corner. */
    plateHeadInset: 0.29,
    /** The days start one after another, a week at a time, this far apart. */
    dayStagger: 160,
});
