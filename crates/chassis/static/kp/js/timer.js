// Kitchen timers: named countdowns that keep running [kpadopt4; the AuDHD recipe app].
//
// One or more countdowns, each with a name ("Rice", "Sauce"), side by side.
// The alarm (js/alarm.js) is a notice that counts down until it closes; a
// timer is a clock a person starts and that goes on until it is done.
//
//   <div class="kp-timers" data-kp-timers aria-label="Kitchen timers"></div>
//   <button class="kp-button" data-kp-timer-start="10m" data-kp-timer-name="Simmer the sauce">Simmer 10 min</button>
//
//   startTimer(list, { name: 'Rice', seconds: 12 * 60 });
//   list.addEventListener('kp-timer-done', (e) => …);
//
// A starter (`data-kp-timer-start`, a duration: "10m", "1h30m", "90s",
// "10:00" or seconds; `data-kp-timer-name`; `data-kp-timer-for` names the
// list, else the page's first) may stand anywhere in the page, in the text of
// a recipe step. Pressed again while its timer runs, it does not start a
// second one: the focus goes to the one that runs.
//
// What it does:
//   - Each timer is a card (`.kp-timer`): its name, a state word, the time
//     left large and in figures of one width, the theme's progress bar, and
//     Pause or Resume, +1 min and Remove. Nothing in a card changes size as
//     the clock runs or the state changes.
//   - It counts from the moment it ends, never by ticks: a page in the
//     background, a phone that locked, a laptop that slept all show the right
//     time again the moment they are back.
//   - When one ends: its card turns to the done plate with the name large
//     ("Rice is done") and one big Stop button; a soft two-note chime plays
//     every few seconds (`data-kp-timers-ring` seconds, 60; 0 is once;
//     `data-kp-timers-sound="off"` none), the phone buzzes where it can, and
//     the system shows a notification when the page has the permission
//     (askTimerNotifications() asks, from a press). +1 min on a done timer
//     starts it again for a minute.
//   - The sound is a choice: `data-kp-timers-sound="chime"` (default, the soft
//     two-note chime), `"bell"` (a wind-up kitchen timer's hammer on two
//     bells) or `"buzzer"` (a harsher electronic beep, four at a time), or
//     `"off"`. All are made with Web Audio, no file. playTimerSound() plays
//     one, for a picker's preview (call it from a press).
//   - It can also say it: `data-kp-timers-speak="on"` (default off) speaks the
//     timer's message with speechSynthesis once the sound has played, again at
//     every ring. The message is `data-kp-timer-say` on a starter or `say` in
//     startTimer, else "<name> is done" from the dictionary. Where
//     speechSynthesis is missing nothing is said and nothing fails: the card,
//     the sound and the alert still tell it.
//   - A screen reader hears a start, the last minute and the end (the end
//     at once, the rest politely), never every second.
//
// Nothing is stored: getTimers() gives the state (with each end time) for
// the page to keep, restoreTimers() puts it back after a reload.
//
// Events (bubbling, on the list):
//   kp-timer-start   { timer }
//   kp-timer-change  { timer, action: 'pause' | 'resume' | 'add' | 'stop-ring' }
//   kp-timer-done    { timer }
//   kp-timer-stop    { timer }            removed
//   kp-timers-retry  {}                   the Retry of the failed state (setTimersState(list, 'error'))
//
// States: `setTimersState(list, 'loading' | 'error' | 'ready', message)`: loading lays the data table's busy card over the
// box the timers fill, error says the message on the failed plate with a Retry, and a list without timers says
// `data-kp-timers-empty` (or the dictionary's sentence) on the empty plate; all three fill the box a row of timer cards fills
// (js/state-plate.js, js/footprint.js).
//
// Every word it adds is in js/strings.js. Nothing runs on import.

export {
    TIMERS,
    TIMER_START,
    TIMER_START_EVENT,
    TIMER_CHANGE_EVENT,
    TIMER_DONE_EVENT,
    TIMER_STOP_EVENT,
    TIMERS_RETRY_EVENT,
    TIMER_TICK_MS,
} from './timer/constants.js';
export { getTimers } from './timer/model.js';
export { setTimersState } from './timer/sync.js';
export { TIMER_SOUNDS, playTimerSound, speakTimerMessage } from './timer/sound.js';
export { askTimerNotifications, startTimer, pauseTimer, resumeTimer, addTimerTime, stopTimerRing, stopTimer, restoreTimers } from './timer/run.js';
export { attachTimers } from './timer/attach.js';

// One duration reader and one clock face for the package: the countdown's [kpadopt4]. The kitchen timer re-exports
// the reader for its own subpath; a timer that holds an hour or more shows its hours from the start, so its digits never jump.
export { parseDuration } from './countdown.js';

/** @typedef {import('./timer/types.js').TimerState} TimerState */
/** @typedef {import('./timer/types.js').Timer} Timer */
