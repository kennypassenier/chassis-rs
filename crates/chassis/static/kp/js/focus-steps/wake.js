// Keeps the screen awake while a step runs.
import { getStrings } from '../strings.js';
import { part, stateOf } from './dom.js';
import { FOCUS_STEPS_WAKE_EVENT, WIRED } from './constants.js';
import { answering } from './resume.js';

/** The screen line. @param {HTMLElement} root @param {string} wakeState */
export function paintWake(root, wakeState) {
    const state = stateOf(root);
    const changed = state.wakeState !== wakeState;
    state.wakeState = wakeState;
    root.setAttribute('data-kp-focus-steps-screen', wakeState);
    const strings = getStrings();
    const line = part(root, 'wake');
    if (line)
        line.textContent =
            wakeState === 'on' ? strings.focusWakeOn : wakeState === 'unsupported' ? strings.focusWakeUnsupported : strings.focusWakeOff;
    if (changed) root.dispatchEvent(new CustomEvent(FOCUS_STEPS_WAKE_EVENT, { bubbles: true, detail: { state: wakeState } }));
}
/** Ask for the screen to stay on. @param {HTMLElement} root */
export async function holdScreen(root) {
    // Answer mode does not force the screen on (a two-minute flow); `data-kp-wake="true"` asks for it, cook mode keeps its default.
    const wake = root.getAttribute('data-kp-wake') ?? root.getAttribute('data-kp-focus-steps-wake');
    if (wake === 'false' || (wake === null && answering(root))) return paintWake(root, 'off');
    const lock = /** @type {any} */ (navigator).wakeLock;
    if (!lock?.request) return paintWake(root, 'unsupported');
    if (document.visibilityState !== 'visible') return;
    const state = stateOf(root);
    if (state.wake && !state.wake.released) return paintWake(root, 'on');
    try {
        const sentinel = /** @type {WakeLockSentinel} */ (await lock.request('screen'));
        if (!WIRED.has(root)) {
            void sentinel.release();
            return;
        }
        state.wake = sentinel;
        sentinel.addEventListener('release', () => {
            if (stateOf(root).wake === sentinel) paintWake(root, 'off');
        });
        paintWake(root, 'on');
    } catch {
        paintWake(root, 'off');
    }
}
/** @param {HTMLElement} root */
export function letScreenGo(root) {
    const state = stateOf(root);
    const sentinel = state.wake;
    state.wake = null;
    if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
}
/** The screen option changed at run time: ask for the screen again, or let it go. @param {HTMLElement} root */
export function applyWake(root) {
    const wake = root.getAttribute('data-kp-wake') ?? root.getAttribute('data-kp-focus-steps-wake');
    if (wake === 'false' || (wake === null && answering(root))) {
        letScreenGo(root);
        paintWake(root, 'off');
    } else void holdScreen(root);
}
