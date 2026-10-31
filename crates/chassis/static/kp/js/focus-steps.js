// One step at a time, large, with the screen kept on [kpadopt4; the AuDHD recipe app's cook mode].
//
// A recipe on a phone or a tablet on the counter: one step on the screen, in
// large type, with what that step needs, and two big buttons to go back and
// on. It is for reading and following, where the wizard is a form filled in
// page by page and the step list shows a whole run at once.
//
//   <div class="kp-focus-steps" data-kp-focus-steps aria-label="Chicken curry"></div>
//
//   setFocusSteps(el, [{ text: 'Rinse the rice…', ingredients: [{ amount: '300 g', name: 'basmati rice' }],
//                        timer: { seconds: 600, name: 'Rice' }, note: 'Do not walk away: it catches fast.' }, …], { start: 2 });
//   el.addEventListener('kp-focus-steps-change', (e) => remember(e.detail.index));
//
// Parts, made by the module: a head (`__head`) with "Step 3 of 8"
// (`__count`), the theme's progress bar (`__bar`), Read aloud (`__speak`,
// when the browser can) and the screen line (`__wake`); a body (`__body`)
// holding the step (`__step`: `__text`, the ingredients for this step
// `__needs`, a timer button `__timer`, a note `__note`); the two buttons
// (`__nav`: `__prev`, `__next`, which says Done on the last step).
//
// What it does:
//   - The screen stays on while it is attached and the page is shown (the
//     Wake Lock API, where the browser has it), asked again when the page
//     comes back, let go on detach; the head says which it is ("Screen stays
//     on" / "Screen may dim"), `data-kp-focus-steps-screen="on|off|unsupported"`.
//     `data-kp-focus-steps-wake="false"` does not ask.
//   - ArrowRight, PageDown and Space go on; ArrowLeft and PageUp go back;
//     Home and End go to the first and last step. A swipe across the step
//     does the same on a touch screen.
//   - The step arrives the theme's way (js/motion.js, at once under reduced
//     motion); the buttons stand where they stand, whatever the step's
//     length; a long step scrolls inside the body.
//   - A screen reader hears "Step 3 of 8" and the step on every change.
//   - A step's timer button is a starter of js/timer.js
//     (`data-kp-focus-steps-timers` names the timer list).
//
// States: setFocusStepsState(el, 'loading' | 'error' | 'ready', message):
// loading lays the busy card over the body, error says the message there;
// no steps says `data-kp-focus-steps-empty` (or the dictionary's sentence). The empty plate takes an action like the failed
// one [gaps-time-1019]: `data-kp-focus-steps-empty-action="Add a recipe"` puts a normal-size button on it that fires
// `kp-focus-steps-empty-action` on the root. Both attributes are read again when they change (js/live-options.js).
//
// Resume [gaps-time-1019]: with `data-kp-remember="<name>"` the place is kept after every move, in cook mode as well as in
// answer mode, and put back after a reload (`data-kp-resume` auto, ask or off; `data-kp-resume-until`): the active step, the
// place on every track, the active track and the steps passed, so a recipe with two tracks comes back as it was left, not on one
// step with everything else undone. A stored place is used only for the same steps (a key made of their ids or titles); a
// changed recipe starts at the top. A timer is not part of it. It is forgotten when the flow is done.
//
// Events (bubbling, on the root):
//   kp-focus-steps-change  { index, from, total, step }
//   kp-focus-steps-done    { total }             Done pressed on the last step
//   kp-focus-steps-wake    { state }             the screen line changed
//
// Answer mode [kpadopt6; Life's daily check-in, "dezelfde weergave om te antwoorden"]: a step that carries `answer` is a question,
// one per screen, with big answer buttons (and a root with `data-kp-focus-mode="answer"` has its empty, failed and save-failed
// states drawn as centred plates). A step without `answer` stays a reading step, so one flow can mix them.
//
//   setFocusSteps(el, [{ text: 'How was your energy?',
//                        answer: { id: 'energy', kind: 'choice', previous: 'ok', usual: 'good',
//                                  choices: [{ value: 'low', label: 'Low' }, { value: 'ok', label: 'Matig' }, { value: 'good', label: 'Good' }] } }, …]);
//   el.addEventListener('kp-focus-steps-answer', (e) => save(e.detail));      // { index, id, value, source, same?, previous }
//   el.addEventListener('kp-focus-steps-done', (e) => post(e.detail.answers)); // { total, answers, startedAt, finishedAt }
//
// `kind` is `choice` (one tap picks and the flow moves on after `data-kp-advance-ms`, 350, the read-back of what you hit), `multi`
// (several taps, then Next) or `text` (a box; Next saves; Not today passes). A step may offer "Same as yesterday: Matig"
// (`answer.previous`) and "Same as usual: Good" (`answer.usual`), each with its value in the label, and "Not today" (a skip is
// an answer: `source: 'skip'`, never blocks, never nags). Options (markup attribute, default):
//   data-kp-focus-mode      read | answer                       read (a step with `answer` is a question by itself)
//   data-kp-advance         auto | button                       auto for `choice`, button for `multi` and `text`
//   data-kp-advance-ms      350
//   data-kp-same            both | yesterday | usual | off      both (Kenny, 2026-10-17: two buttons)
//   data-kp-skip            present | off                       present
//   data-kp-pinned-first    JSON [{ value, label }]             none ("Nothing to log", "Not sure" stand first)
//   data-kp-back            present | off                       present; going back keeps every answer
//   data-kp-choice-layout   auto | stack | row                  auto (a row for up to three short labels; always stacked on a phone)
//   data-kp-choice-height   md | lg                             lg (56 px at least)
//   data-kp-progress        count | off                         count ("Question 3 of 7" and the bar)
//   data-kp-resume          auto | ask | off                    auto, with data-kp-remember="<name>"
//   data-kp-resume-until    midnight | hours:N | never          midnight (Europe/Brussels)
//   data-kp-summary         on | off                            off (a summary costs one of the seven screens)
//   data-kp-wake, data-kp-speak   true | false                  false in answer mode (cook mode keeps true)
//   data-kp-text-optional   true | false                        true
// Events: `kp-focus-steps-before-answer` (cancelable, `{ index, id, value, source }`), `kp-focus-steps-answer`,
// `kp-focus-steps-resume` (`{ index, answers }`), `kp-focus-steps-retry` and `kp-focus-steps-save-retry` (the plates' buttons).
// Keys while the focus is in the view: ArrowUp and ArrowDown between answers, Enter picks, `s` takes the same as yesterday,
// `u` the usual, `n` skips: all on the `?` sheet, none a digit or an AltGr key. States: `setFocusStepsState(el, 'save-error')`
// keeps the answers and says "Could not save your answers" with Try again.
//
// Parallel tracks [focus-tracks-1019; Kenny's AuDHD recipes: "de pasta koken terwijl we met de saus bezig zijn"]: a step may carry a
// `track` ("Pasta", "Saus"). Cook mode then shows the active track's step large and every track as a lane beside it (above it on a
// phone) with its progress and live timer; one tap on a lane, or the T key, switches track. Back and Next walk the active track
// only; each track keeps its own place. The composition is a grid of two columns (the step 2fr, the lanes 1fr; one column on a
// narrow root, the lanes as short rows above the step).
//
//   setFocusSteps(el, [{ id: 'water', track: 'Pasta', title: 'Boil the water', text: 'Put the pot on…', timer: { seconds: 600, name: 'Water' } },
//                      { id: 'onion', track: 'Sauce', title: 'Soften the onion', text: 'Chop the onion…' },
//                      { track: 'Pasta', title: 'Add the spaghetti', text: 'When the water boils…', waitFor: 'water' },
//                      { track: 'Together', text: 'Toss…', waitFor: ['Pasta', 'Sauce'] }, …]);
//   el.addEventListener('kp-focus-steps-track', (e) => remember(e.detail.track));
//
//   - A step without `track` belongs to the shared lane (`data-kp-track-shared`, "Together"). One track only is a plain sequence.
//   - `waitFor` (alias `after`) names step ids, or a whole track by its name: the step cannot be started until each of them is
//     done. A step is done when it was passed with Next AND its timer, if one was started, has ended. A step that waits shows what
//     it waits for, with the time left, and a button to the track that can go on.
//   - A step timer has an id of its own (`timer.id`, else the step's `id`) and runs in the timer list (`data-kp-focus-steps-timers`),
//     so the lanes read it by that id. When it ends, or a track that waited can go on, js/attention.js puts the track on the band
//     above the step, with a button that goes there.
//   - Keys: T goes to the next track, Shift T to the previous one; the lanes are tabs (role tablist, aria-selected, one tab stop): ArrowUp, ArrowDown, Home and End move the focus between them while one has it.
//
//   Options (attribute, default):
//     data-kp-tracks         auto | off            auto (off reads every step as one sequence)
//     data-kp-lanes          auto | side | top     auto (side when the root is 44rem wide or more)
//     data-kp-lane-detail    full | compact        full (compact leaves out "Step 2 of 4" in the lane)
//     data-kp-track-follow   suggest | auto        suggest (auto switches to the track that needs you when this one waits or ends)
//     data-kp-track-attention on | off             on (the band above the step)
//     data-kp-track-shared   text                  the dictionary's "Together"
//   Events: `kp-focus-steps-track` { track, key, from, index, step, reason: 'tap' | 'key' | 'script' | 'attention' | 'auto' } on a switch,
//   `kp-focus-steps-track-attention` { track, key, reason: 'timer' | 'ready', index } when a track asks for you, and
//   `kp-focus-steps-change` also carries `track`. `kp-focus-steps-done` fires when every track is finished.
//
// Every word it adds is in js/strings.js. Nothing runs on import.

export {
    FOCUS_STEPS,
    FOCUS_STEPS_EVENT,
    FOCUS_STEPS_DONE_EVENT,
    FOCUS_STEPS_WAKE_EVENT,
    FOCUS_STEPS_BEFORE_ANSWER_EVENT,
    FOCUS_STEPS_ANSWER_EVENT,
    FOCUS_STEPS_RESUME_EVENT,
    FOCUS_STEPS_RETRY_EVENT,
    FOCUS_STEPS_EMPTY_ACTION_EVENT,
    FOCUS_STEPS_SAVE_RETRY_EVENT,
    FOCUS_STEPS_TRACK_EVENT,
    FOCUS_STEPS_TRACK_ATTENTION_EVENT,
    SWIPE_DISTANCE,
} from './focus-steps/constants.js';
export { goToStep, getStepIndex, getStepsPassed, getSteps, setFocusSteps, setFocusStepsState } from './focus-steps/api.js';
export { attachFocusSteps } from './focus-steps/attach.js';

/** @typedef {import('./focus-steps/constants.js').FocusIngredient} FocusIngredient */
/** @typedef {import('./focus-steps/constants.js').FocusChoice} FocusChoice */
/** @typedef {import('./focus-steps/constants.js').FocusAnswer} FocusAnswer */
/** @typedef {import('./focus-steps/constants.js').FocusStep} FocusStep */
/** @typedef {import('./focus-steps/constants.js').FocusState} FocusState */
/** @typedef {import('./focus-steps/constants.js').Progress} Progress */
/** @typedef {import('./focus-steps/constants.js').Track} Track */
/** @typedef {import('./focus-steps/constants.js').TrackAlert} TrackAlert */
/** @typedef {import('./focus-steps/blockers.js').Lane} Lane */
/** @typedef {import('./focus-steps/api.js').StepsPassed} StepsPassed */
