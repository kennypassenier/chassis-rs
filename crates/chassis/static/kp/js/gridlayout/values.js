// The selectors, the events and the defaults of the movable grid.

export const GRID = '[data-kp-grid]';
export const TILE = '[data-kp-tile]';

/** Fired on every move or resize. A contract value [TH26]: the detail is the whole layout. */
export const LAYOUT_EVENT = 'kp-grid-layout';
/** Fired once a burst of changes settles (the debounce is `data-kp-commit-ms`). Same detail. */
export const LAYOUT_COMMIT_EVENT = 'kp-grid-commit';

/** Columns when the grid does not say. An operational knob. */
export const COLUMNS = 6;
/** How long after the last change the commit event fires. */
export const COMMIT_MS = 400;
/** The cells a key moves or resizes a tile by when the page names none. */
export const DEFAULT_STEP = 1;
/** The custom properties the placement is written as. */
export const PLACEMENT_PROPERTIES = ['--kp-tile-x', '--kp-tile-y', '--kp-tile-w', '--kp-tile-h'];
