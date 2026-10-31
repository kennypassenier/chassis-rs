// The selector, the events and the parts of a list toolbar.

/** A list toolbar. */
export const TOOLBAR = '[data-kp-toolbar]';

/** Fired on the toolbar when a tag's cross is pressed; `{ id, label }`. */
export const TOOLBAR_REMOVE_EVENT = 'kp-toolbar-remove';

/** Fired on the toolbar when Clear all is pressed. */
export const TOOLBAR_CLEAR_EVENT = 'kp-toolbar-clear';

export const SEARCH = '.kp-toolbar__input';
export const ACTIVE = '.kp-toolbar__active';
export const LIST = '.kp-toolbar__active-list';
export const CLEAR = '[data-kp-toolbar-clear]';
export const REMOVE = '.kp-toolbar__active .kp-tag__remove';
