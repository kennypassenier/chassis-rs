// One focus-steps view: its buttons, keys, swipe, shortcuts, timers, live options and the screen kept on until destroy.
import { getStrings } from '../strings.js';
import { registerShortcuts } from '../shortcuts.js';
import { watchOptions } from '../live-options.js';
import {
    FOCUS_STEPS_DONE_EVENT,
    FOCUS_STEPS_EMPTY_ACTION_EVENT,
    FOCUS_STEPS_RETRY_EVENT,
    FOCUS_STEPS_SAVE_RETRY_EVENT,
    WIRED,
} from './constants.js';
import { build } from './dom.js';
import { paint } from './paint.js';
import { applyWake, holdScreen, letScreenGo, paintWake } from './wake.js';
import { answering } from './resume.js';
import { pressAnswer } from './flow.js';
import { layTracks, timerIdOf, tracksOn } from './tracks.js';
import { recompute, stepTrack, switchTrack, timerEnded } from './track-nav.js';
import { clearAlert, renderBand } from './band.js';
import { applyProgress, memoryOf } from './memory.js';
import { layoutLanes } from './lanes.js';
import { FocusStepsInput } from './input.js';

/** How often the lanes' clocks are read again, in ms. */
const LANE_TICK_MS = 1000;
/** The timer events the lanes follow. */
const TIMER_EVENTS = ['kp-timer-start', 'kp-timer-change', 'kp-timer-done', 'kp-timer-stop'];
/** The options drawn again at once when they change at run time [live-options-1019]. */
const LIVE_OPTIONS = [
    'data-kp-progress',
    'data-kp-back',
    'data-kp-same',
    'data-kp-skip',
    'data-kp-choice-layout',
    'data-kp-summary',
    'data-kp-pinned-first',
    'data-kp-speak',
    'data-kp-focus-mode',
    'data-kp-wake',
    'data-kp-focus-steps-wake',
    'data-kp-tracks',
    'data-kp-lanes',
    'data-kp-lane-detail',
    'data-kp-track-follow',
    'data-kp-track-attention',
    'data-kp-track-shared',
];

/** One focus-steps view; its state stays in the per-view registry (stateOf) the setters read before and after attach. */
export class FocusStepsControl extends FocusStepsInput {
    connect() {
        const root = this.host;
        WIRED.add(root);
        // Registered first, so it runs last: the speech, the screen hold and the wake mark go after every listener.
        this.own(() => this.release());
        build(root);
        paint(root, false);
        void holdScreen(root);
        this.listen(root, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(root, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(root, 'pointerdown', (event) => this.onDown(/** @type {PointerEvent} */ (event)));
        this.listen(root, 'pointerup', (event) => this.onUp(/** @type {PointerEvent} */ (event)));
        this.listen(root, 'pointercancel', () => (this.touch = null));
        this.listen(document, 'visibilitychange', () => {
            if (document.visibilityState === 'visible') void holdScreen(root);
        });
        this.registerKeys();
        this.own(watchOptions(root, LIVE_OPTIONS, (names) => this.onOptions(names)));
        this.watchTimers();
        // The empty plate's words and action are read again when the attributes change.
        this.own(watchOptions(root, ['data-kp-focus-steps-empty', 'data-kp-focus-steps-empty-action'], () => paint(root, false)));
    }

    /** The view lets go of the speech, the screen and its marks. */
    release() {
        const root = this.host;
        window.clearTimeout(this.state.timer);
        WIRED.delete(root);
        if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
        letScreenGo(root);
        paintWake(root, 'off');
    }

    /** s, u and n take the same as yesterday, the usual answer and Not today; T and Shift T walk the tracks. */
    registerKeys() {
        const root = this.host;
        const tap = (/** @type {string} */ selector) => () => {
            const button = /** @type {HTMLElement | null} */ (root.querySelector(selector));
            if (button && button.getAttribute('aria-disabled') !== 'true') pressAnswer(root, button);
        };
        const inView = () => answering(root) && root.contains(document.activeElement) && this.state.steps[this.state.index]?.answer !== undefined;
        /** @param {string} keys @param {string} what @param {string} selector */
        const answerKey = (keys, what, selector) => ({ keys, what, group: 'Question', when: () => inView() && root.querySelector(selector) !== null, run: tap(selector) });
        const strings = getStrings();
        this.own(
            registerShortcuts(root, [
                answerKey('s', strings.focusSameYesterday('…'), '[data-kp-same="yesterday"]'),
                answerKey('u', strings.focusSameUsual('…'), '[data-kp-same="usual"]'),
                answerKey('n', strings.focusSkip, '.kp-focus-steps__skip'),
            ]),
        );
        // While the focus is in the view (or on no control at all).
        const tracking = () => tracksOn(root) && (root.contains(document.activeElement) || document.activeElement === document.body);
        this.own(
            registerShortcuts(root, [
                { keys: 't', what: strings.focusTrackKeyNext, group: 'Tracks', when: tracking, run: () => stepTrack(root, 1) },
                { keys: 'Shift T', what: strings.focusTrackKeyPrevious, group: 'Tracks', when: tracking, run: () => stepTrack(root, -1) },
            ]),
        );
    }

    /** An option changed at run time: draw what it touches. @param {string[]} names */
    onOptions(names) {
        const root = this.host;
        if (names.some((n) => n === 'data-kp-wake' || n === 'data-kp-focus-steps-wake')) applyWake(root);
        if (names.includes('data-kp-track-shared')) layTracks(root);
        paint(root, false);
        if (names.includes('data-kp-track-attention') || names.includes('data-kp-tracks')) renderBand(root);
        recompute(root);
    }

    /** The timers of the steps: the lanes read them by their ids, an end asks for the person, and the lanes follow the clock. */
    watchTimers() {
        const root = this.host;
        const state = this.state;
        for (const type of TIMER_EVENTS) this.listen(document, type, (event) => this.onTimer(event));
        state.ticker = window.setInterval(() => {
            if (!document.hidden) recompute(root);
        }, LANE_TICK_MS);
        this.own(() => {
            window.clearInterval(state.ticker);
            state.ticker = 0;
        });
        if (typeof ResizeObserver === 'function') this.observe(new ResizeObserver(() => tracksOn(root) && layoutLanes(root))).observe(root);
    }

    /** @param {Event} event */
    onTimer(event) {
        const root = this.host;
        const state = this.state;
        const timer = /** @type {CustomEvent} */ (event).detail?.timer;
        if (!timer || !tracksOn(root)) return;
        const at = state.steps.findIndex((_, i) => timerIdOf(state, i) === timer.id);
        if (at < 0) return;
        if (event.type === 'kp-timer-done') timerEnded(root, at, timer);
        else if (event.type === 'kp-timer-stop') for (const [key, alert] of state.alerts) if (alert.timerId === timer.id) clearAlert(root, key);
        recompute(root);
    }

    /** @param {MouseEvent} event */
    onClick(event) {
        const root = this.host;
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (!button || !root.contains(button) || button.getAttribute('aria-disabled') === 'true') return;
        if (pressAnswer(root, button) || this.trackButton(button)) return;
        this.flowButton(button);
    }

    /**
     * Parallel tracks: a lane, the button that goes to a track, and "Got it" on the band.
     * @param {HTMLButtonElement} button
     * @returns {boolean} whether the press was a track's
     */
    trackButton(button) {
        const root = this.host;
        const state = this.state;
        const go = button.getAttribute('data-kp-focus-go');
        if (button.classList.contains('kp-focus-steps__lane')) {
            switchTrack(root, button.getAttribute('data-kp-track-key') ?? '', 'tap');
            return true;
        }
        if (go !== null) {
            const to = state.tracks[Number(go)];
            if (to) switchTrack(root, to.key, button.closest('.kp-focus-steps__band') ? 'attention' : 'tap');
            return true;
        }
        const dismiss = button.getAttribute('data-kp-focus-dismiss');
        if (dismiss === null) return false;
        const gone = state.tracks[Number(dismiss)];
        if (gone) clearAlert(root, gone.key);
        return true;
    }

    /** The plates' Retry and actions, the resume offer, Next, Back and Read aloud. @param {HTMLButtonElement} button */
    flowButton(button) {
        const root = this.host;
        const state = this.state;
        // Each event is dispatched where it is named: the site's extractor finds an event by its `new CustomEvent(NAME`.
        if (button.hasAttribute('data-kp-focus-retry')) root.dispatchEvent(new CustomEvent(FOCUS_STEPS_RETRY_EVENT, { bubbles: true }));
        else if (button.hasAttribute('data-kp-focus-empty-action'))
            root.dispatchEvent(new CustomEvent(FOCUS_STEPS_EMPTY_ACTION_EVENT, { bubbles: true }));
        else if (button.hasAttribute('data-kp-focus-save-retry')) {
            root.dispatchEvent(new CustomEvent(FOCUS_STEPS_SAVE_RETRY_EVENT, { bubbles: true }));
            if (state.finished) root.dispatchEvent(new CustomEvent(FOCUS_STEPS_DONE_EVENT, { bubbles: true, detail: { ...state.finished } }));
        } else if (button.classList.contains('kp-focus-steps__resume-go') && state.pendingResume) applyProgress(root, state.pendingResume);
        else if (button.classList.contains('kp-focus-steps__resume-restart')) {
            memoryOf(root)?.forget('progress');
            state.pendingResume = null;
            paint(root, false);
        } else if (button.classList.contains('kp-focus-steps__next')) this.next();
        else if (button.classList.contains('kp-focus-steps__prev')) this.prev();
        else if (button.classList.contains('kp-focus-steps__speak')) this.speak(button);
    }
}
