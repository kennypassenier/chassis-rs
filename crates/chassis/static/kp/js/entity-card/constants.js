// The selectors and event names of the entity card and its grid.

/** The grids this module looks after. */
export const ENTITY_GRID = '[data-kp-entity-grid]';
/** A card this module looks after. */
export const ENTITY_CARD = '[data-kp-entity]';
/** Fired on the card when an action is pressed: `{ key, id }`. */
export const ENTITY_ACTION_EVENT = 'kp-entity-action';
/** Fired on the card when a flag is picked in the "+N" menu: `{ key, flag }`. */
export const ENTITY_FLAG_EVENT = 'kp-entity-flag';
/** Fired on the card when its tick changes: `{ key, ticked }`. */
export const ENTITY_TICK_EVENT = 'kp-entity-tick';
/** Fired on the card when its star is pressed: `{ key, starred }`. */
export const ENTITY_STAR_EVENT = 'kp-entity-star';
/** Fired on the card when its Retry is pressed: `{ key }`. */
export const ENTITY_RETRY_EVENT = 'kp-entity-retry';
/** Fired on the grid when its action is pressed. */
export const ENTITY_NEW_EVENT = 'kp-entity-new';
/** Fired on the grid when its Retry is pressed. */
export const ENTITY_GRID_RETRY_EVENT = 'kp-entity-grid-retry';

/** On a card or its grid: the key that stars the card while the focus is inside it (a key spec, js/key-spec.js, or a plain key; `none` or `off` for no key). */
export const ENTITY_STAR_KEY_ATTRIBUTE = 'data-kp-entity-star-key';
/** The key that stars a card when it and its grid name none. */
export const ENTITY_STAR_KEY = 's';
/** The key that stars a card under a board whose tiles jump by their first letter, so the star never takes a letter away from the search. */
export const ENTITY_STAR_LETTERS_KEY = '.';
