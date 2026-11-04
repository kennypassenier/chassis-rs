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
 * @property {Node | string} [body] the longer detail under the text: a Node (copied on every draw) or Markdown drawn with `markdownFragment`
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

// The keys of the view are options with a default [keys3-1104]: each is a key spec (js/key-spec.js) read from the root's attribute or
// the JS option of the same name, `none` switches it off. A key a person types in a field never reaches them.
/** On the root: the keys that go on to the next step (a key spec; `none` for no key). */
export const FOCUS_STEPS_NEXT_KEY_ATTRIBUTE = 'data-kp-focus-steps-next-key';
/** The keys that go on when the root names none: ArrowRight (ArrowLeft right to left), PageDown and Space (not while a control has the focus). */
export const FOCUS_STEPS_NEXT_KEY = 'ArrowRight or PageDown or Space';
/** On the root: the keys that go back one step (a key spec; `none` for no key). */
export const FOCUS_STEPS_PREVIOUS_KEY_ATTRIBUTE = 'data-kp-focus-steps-previous-key';
/** The keys that go back when the root names none: ArrowLeft (ArrowRight right to left) and PageUp. */
export const FOCUS_STEPS_PREVIOUS_KEY = 'ArrowLeft or PageUp';
/** On the root, on a question with a same-as-yesterday answer: the key that takes it (a key spec; `none` for no key). */
export const FOCUS_STEPS_SAME_YESTERDAY_KEY_ATTRIBUTE = 'data-kp-focus-steps-same-yesterday-key';
/** The key that takes the same as yesterday when the root names none. */
export const FOCUS_STEPS_SAME_YESTERDAY_KEY = 's';
/** On the root, on a question with a usual answer: the key that takes it (a key spec; `none` for no key). */
export const FOCUS_STEPS_SAME_USUAL_KEY_ATTRIBUTE = 'data-kp-focus-steps-same-usual-key';
/** The key that takes the usual answer when the root names none. */
export const FOCUS_STEPS_SAME_USUAL_KEY = 'u';
/** On the root, on a question that can be skipped: the key that says Not today (a key spec; `none` for no key). */
export const FOCUS_STEPS_SKIP_KEY_ATTRIBUTE = 'data-kp-focus-steps-skip-key';
/** The key that says Not today when the root names none. */
export const FOCUS_STEPS_SKIP_KEY = 'n';
/** On the root, with tracks: the key that goes to the next track (a key spec; `none` for no key). */
export const FOCUS_STEPS_TRACK_NEXT_KEY_ATTRIBUTE = 'data-kp-focus-steps-track-next-key';
/** The key that goes to the next track when the root names none. */
export const FOCUS_STEPS_TRACK_NEXT_KEY = 't';
/** On the root, with tracks: the key that goes to the previous track (a key spec; `none` for no key). */
export const FOCUS_STEPS_TRACK_PREVIOUS_KEY_ATTRIBUTE = 'data-kp-focus-steps-track-previous-key';
/** The key that goes to the previous track when the root names none (the engine's own spelling, as the shortcut sheet prints it; `Shift+T` reads the same). */
export const FOCUS_STEPS_TRACK_PREVIOUS_KEY = 'Shift T';
