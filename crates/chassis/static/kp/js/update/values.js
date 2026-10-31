// The names an update marks an element with, and the inline properties it sets while it plays.

/** The attribute written on an element while its update plays. */
export const UPDATING_ATTRIBUTE = 'data-kp-updating';

/** The custom property a register names its update idea in. */
export const UPDATE_PROPERTY = '--kp-update';

/** The inline properties update() sets while it plays, and takes off after. */
export const UPDATE_STYLE = /** @type {readonly string[]} */ (Object.freeze(['display', '--kp-update-duration', '--kp-update-ease']));

/** The SVG namespace: a spark is an svg, whose parent carries the mark. */
export const SVG_NS = 'http://www.w3.org/2000/svg';

/** Update time as a multiple of the longer of the box's resize time and the dialog's close time. */
export const UPDATE_STRETCH = 1.25;
