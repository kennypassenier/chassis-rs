// The attribute, event names and state table of the focus steps.

export const FOCUS_STEPS = '[data-kp-focus-steps]';
export const FOCUS_STEPS_EVENT = 'kp-focus-steps-change';
export const FOCUS_STEPS_DONE_EVENT = 'kp-focus-steps-done';
export const FOCUS_STEPS_WAKE_EVENT = 'kp-focus-steps-wake';
/** Fired on the root, cancelable, before an answer is taken: `{ index, id, value, source }`. */
export const FOCUS_STEPS_BEFORE_ANSWER_EVENT = 'kp-focus-steps-before-answer';
/** Fired on the root when a question was answered: `{ index, id, value, source: 'tap' | 'same' | 'skip', same?, previous }`. */
export const FOCUS_STEPS_ANSWER_EVENT = 'kp-focus-steps-answer';
/** Fired on the root when answers were put back after a break: `{ index, answers }`. */
export const FOCUS_STEPS_RESUME_EVENT = 'kp-focus-steps-resume';
/** Fired on the root when Retry is pressed on the plate of questions that could not be read. */
export const FOCUS_STEPS_RETRY_EVENT = 'kp-focus-steps-retry';
/** Fired on the root when the action of the empty plate (`data-kp-focus-steps-empty-action`) is pressed [gaps-time-1019]. */
export const FOCUS_STEPS_EMPTY_ACTION_EVENT = 'kp-focus-steps-empty-action';
/** Fired on the root when Try again is pressed on the plate of answers that could not be saved. */
export const FOCUS_STEPS_SAVE_RETRY_EVENT = 'kp-focus-steps-save-retry';
/** Fired on the root when the active track changed: `{ track, key, from, index, step, reason }`. */
export const FOCUS_STEPS_TRACK_EVENT = 'kp-focus-steps-track';
/** Fired on the root when a track asks for the person: `{ track, key, reason: 'timer' | 'ready', index }`. */
export const FOCUS_STEPS_TRACK_ATTENTION_EVENT = 'kp-focus-steps-track-attention';
/** How far a finger has to travel across the step to turn it [px]. */
export const SWIPE_DISTANCE = 56;
/**
 * @typedef {object} FocusIngredient
 * @property {string} name
 * @property {string} [amount]
 */

/**
 * @typedef {object} FocusChoice
 * @property {string} value
 * @property {string} label
 * @property {boolean} [disabled]
 * @property {string} [reason] why it cannot be picked, shown under its label
 */

/**
 * @typedef {object} FocusAnswer
 * @property {string} id names the answer in the events and the done payload
 * @property {'choice' | 'multi' | 'text'} kind
 * @property {FocusChoice[]} [choices]
 * @property {string | string[]} [previous] yesterday's answer: offered as "Same as yesterday"
 * @property {string | string[]} [usual] the usual answer: offered as "Same as usual"
 * @property {string} [placeholder] a text box's hint
 */

/**
 * @typedef {object} FocusStep
 * @property {string} text
 * @property {FocusAnswer} [answer] makes the step a question
 * @property {(FocusIngredient | string)[]} [ingredients]
 * @property {{ seconds: number, name?: string, id?: string }} [timer] `id` names the timer in the timer list (default: the step's `id`)
 * @property {string} [id] names the step for `waitFor` and for its timer (default `step-<n>`)
 * @property {string} [track] the line of work it belongs to ("Pasta"); steps with none belong to the shared lane
 * @property {string} [title] a short name for the step, used in the lanes and where another step waits for it
 * @property {string | string[]} [waitFor] step ids, or track names, that must be done before this step can start
 * @property {string | string[]} [after] the same as `waitFor`
 * @property {string} [note]
 * @property {'info' | 'warning'} [noteTone]
 */

/**
 * @typedef {object} FocusState
 * @property {FocusStep[]} steps
 * @property {number} index
 * @property {WakeLockSentinel | null} wake
 * @property {string} wakeState
 * @property {import('../busy-card.js').BusyCard | null} busy
 * @property {Record<string, { value: string | string[] | null, source: string }>} answers
 * @property {Record<string, string | string[]>} draft the taps of a multi step and the words of a text step, before Next
 * @property {number} timer the pending advance after a tap
 * @property {number} startedAt
 * @property {Track[]} tracks the lines of work, in the order the steps name them (one only: no lanes)
 * @property {string} track the key of the active track
 * @property {Set<number>} done the steps passed with Next
 * @property {Map<string, TrackAlert>} alerts the tracks asking for the person, by track key
 * @property {Set<string>} waiting the tracks that waited when the lanes were last read
 * @property {string} lockKey the steps the shown step waits for, as a key
 * @property {number} ticker the interval that keeps the lanes' clocks, 0 when none
 * @property {Progress | null} pendingResume
 * @property {{ total: number, answers: FocusState['answers'], startedAt: number, finishedAt: number } | null} finished
 */

/**
 * @typedef {object} Progress where a person stopped
 * @property {number} index
 * @property {FocusState['answers']} answers
 * @property {number} startedAt
 * @property {string} [track] the key of the active track
 * @property {Record<string, number>} [positions] the place on every track, by track key
 * @property {number[]} [done] the steps passed
 */

/**
 * @typedef {object} Track
 * @property {string} key the name the steps give it ('' for the shared lane)
 * @property {string} name
 * @property {number[]} order the step indexes, in recipe order
 * @property {number} pos where on the track the person is
 */

/**
 * @typedef {object} TrackAlert
 * @property {'timer' | 'ready'} reason
 * @property {string} title
 * @property {string} text
 * @property {number} index the step the track is on
 * @property {string} [timerId]
 */

/** @type {WeakMap<Element, FocusState>} */
export const STATES = new WeakMap();
/** @type {WeakSet<Element>} */
export const WIRED = new WeakSet();
