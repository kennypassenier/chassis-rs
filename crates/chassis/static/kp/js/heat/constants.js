// The selectors, event names, tone list and cell selectors of the heat grid and the matrix.

/** A heat grid. */
export const HEAT = '[data-kp-heat]';
/** A matrix. */
export const MATRIX = '[data-kp-matrix]';
/** Fired on a heat grid when a column is picked or dropped. */
export const HEAT_PICK_EVENT = 'kp-heat-pick';
/** Fired on a heat grid when a row label is pressed. */
export const HEAT_ROW_EVENT = 'kp-heat-row';
/** Fired on a heat grid on Page Up and Page Down. */
export const HEAT_PAGE_EVENT = 'kp-heat-page';
/** Fired on a matrix when a cell is pinned. */
export const MATRIX_PICK_EVENT = 'kp-matrix-pick';
/** Fired on a heat grid, bubbling, when the Retry of its failed state is pressed [state-plates-1019]. */
export const HEAT_RETRY_EVENT = 'kp-heat-retry';
/** Fired on a matrix (either view), bubbling, when the Retry of its failed state is pressed [state-plates-1019]. */
export const MATRIX_RETRY_EVENT = 'kp-matrix-retry';
/** Fired on a matrix when the lit headers change. */
export const MATRIX_LIGHT_EVENT = 'kp-matrix-light';

/** The tones a cell may carry. */
export const TONES = ['ok', 'warn', 'bad', 'muted', 'future', 'before', 'none', 'level', 'loading', 'self', 'logged', 'quiet', 'paused'];

/* ------------------------------------------------------------- the heat grid */

export const HEAT_CELL = '.kp-heat__cell[data-c]:not(.kp-skeleton)';

/* ---------------------------------------------------------------- the matrix */

export const MATRIX_CELL = '.kp-matrix__cell[data-c]:not([data-kp-inert])';
export const GLYPHS = Object.freeze({ ok: '✓', warn: '!', bad: '×', muted: '–', none: '–' });
