// The one leave question of the page [habits-1103]: every guard that holds something unsaved (a guarded region, an open guarded
// dialog, an editor an app registered) hands its "units" to leaveUnits(), which saves what can save itself first and asks
// "Discard your changes?" once for all of them. Same question and strings as the dialog guard (js/overlays/discard-question.js).
import { openDiscardQuestion } from './discard-question.js';

/**
 * One thing that may hold unsaved work.
 * @typedef {object} GuardUnit
 * @property {HTMLElement} el  the box or editor; the question opens next to the focused one, else the first
 * @property {() => Promise<unknown>} [flush]  saves it now; afterwards the unit says whether that worked
 * @property {() => void} release  Discard was chosen: do not hold this unit again
 */

let open = false;

/** Whether a question is on screen. */
export function questionOpen() {
    return open;
}

/** @param {GuardUnit[]} units */
function anchorOf(units) {
    const focused = document.activeElement;
    const here = focused instanceof HTMLElement ? units.find((u) => u.el.contains(focused)) : undefined;
    const el = here ? focused : units[0].el;
    return el instanceof HTMLElement && el.getClientRects().length > 0 ? el : units[0].el;
}

/** @param {GuardUnit[]} units @param {() => void} go */
function ask(units, go) {
    if (open) return;
    open = true;
    const opened = openDiscardQuestion(anchorOf(units), {
        onAccept: () => {
            open = false;
            for (const u of units) u.release();
            go();
        },
        onCancel: () => (open = false),
    });
    if (!opened.open) open = false;
}

/** Runs every unit's save; a save that fails is logged and the question asks. @param {GuardUnit[]} units */
export function flushUnits(units) {
    return Promise.all(
        units.map((u) => {
            const save = u.flush;
            return save ? Promise.resolve().then(save).catch((err) => console.warn('saving before leaving failed', err)) : null;
        }),
    );
}

/**
 * Run `go` at once when no unit holds unsaved work; else let the units save themselves (when any can), and ask once if
 * something is still unsaved. Discard releases every unit and runs `go`.
 * @param {() => GuardUnit[]} units the units that hold unsaved work right now
 * @param {() => void} go
 * @returns {boolean} whether `go` ran at once
 */
export function leaveUnits(units, go) {
    const now = units();
    if (!now.length) {
        go();
        return true;
    }
    if (open) return false;
    if (!now.some((u) => u.flush)) {
        ask(now, go);
        return false;
    }
    void flushUnits(now).then(() => {
        const rest = units();
        if (rest.length) ask(rest, go);
        else go();
    });
    return false;
}
