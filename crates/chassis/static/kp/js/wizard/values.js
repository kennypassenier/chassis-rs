// The selector and the three events of a step wizard.

/** The wizards this module looks after. */
export const WIZARD = '[data-kp-wizard]';

/** Fired when the step changed: `{ step, of, previous, direction }`. A contract value [TH26]. */
export const STEP_EVENT = 'kp-wizard-step';
/** Fired before a step change, cancelable: `{ from, to, direction }`. preventDefault() holds the wizard where it is. */
export const BEFORE_STEP_EVENT = 'kp-wizard-before-step';
/** Fired when Next is pressed on the last step: `{ of }`. */
export const FINISH_EVENT = 'kp-wizard-finish';
