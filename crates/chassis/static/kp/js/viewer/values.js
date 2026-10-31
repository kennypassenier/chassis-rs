// The selector, the event and the states of the viewer shell.

/** The shell. */
export const VIEWER = '.kp-viewer';
/** Fired on the document, bubbling, when a viewer closed: `{ dialog }`. */
export const VIEWER_CLOSE_EVENT = 'kp-viewer-close';
/** The states a stage can be in. */
export const VIEWER_STATES = /** @type {const} */ (['ready', 'loading', 'error', 'unsupported']);
