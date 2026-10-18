// A toast with Undo and a visible clock [kpadopt5; homelab's "Undo for 6 s", JobTracker's discard].
//
// After an action, say what happened and offer Undo for a few seconds, instead
// of asking "are you sure?" before. It joins the two halves the package had:
// toast() with an action button (js/overlays.js) and the deferred commit of
// `data-kp-undo-action` (js/patterns.js), and adds the clock that shows how long
// is left.
//
//   undoToast('3 schedules deleted', {
//       commit: () => api.deleteMany(keys),   // runs when the window closes
//       undo: () => rows.restore(),           // runs on Undo
//   });
//
// Two modes. `defer` (default) holds the action back: nothing reaches the
// server until the window closes, and Undo only has to put the rows back.
// `revert` is for an action already done: Undo calls the page's reverse.
//
// Options, as arguments and as attributes on <html> or on the toast region
// (`data-kp-undo-ms` and so on):
//
//   ms       how long Undo is offered (default 6000; 0 = no undo, the action is committed at once)
//   mode     `defer` (default) | `revert`
//   clock    `ring` (default) | `bar` | `text` | `none`, `data-kp-undo-clock`; the toast says the seconds left in words once, not on every tick
//   key      the key that undoes the newest toast (default `Mod+Z`; false for none); never while typing in a field
//   leave    what a pending action does when the page is left: `carry` (default) keeps the toast across an in-app navigation and commits on a
//            full page load; `commit`; `cancel`
//   max      how many toasts stand at once (default 3); the oldest is committed when a newer one pushes it out
//
// The toast stops its clock while the pointer or the focus is on it and goes on
// where it stopped. Esc on it, or its close, accepts the action now. A commit
// that fails turns the toast into the problem ("Not done: why") and calls
// `restore` (default `undo`), so the row comes back. The clock steps once a
// second under reduced motion.
//
// States, on the toast as `data-kp-undo-state`: counting, committing, failed,
// undone, done; `data-kp-paused` while it is held.

import { toast } from './overlays.js';
import { getStrings } from './strings.js';
import { UNDO_MS } from './patterns.js';

/** The toast's own class. */
export const UNDO_TOAST = 'kp-toast--undo';
/** Fired on the toast region, bubbling, when the action is committed, undone or failed: `{ toast, outcome }`. */
export const UNDO_TOAST_EVENT = 'kp-undo-toast';
/** How long the toast says "Restored" [ms]. */
export const UNDO_RESTORED_MS = 1500;
/** How many toasts stand at once. */
export const UNDO_MAX = 3;

/**
 * @typedef {object} UndoToastOptions
 * @property {() => unknown | Promise<unknown>} [commit] runs when the window closes (mode `defer`); a rejection is a failure
 * @property {() => unknown} [undo] runs on Undo
 * @property {() => unknown} [restore] runs when a commit failed (default `undo`)
 * @property {number} [ms] the window; 0 commits at once
 * @property {'defer' | 'revert'} [mode]
 * @property {'ring' | 'bar' | 'text' | 'none'} [clock]
 * @property {string | false} [key] `Mod+Z`
 * @property {'carry' | 'commit' | 'cancel'} [leave]
 * @property {number} [max]
 * @property {string} [failed] the toast's line when the commit fails, instead of "Not done: why"
 * @property {string} [restored] the toast's line after Undo, instead of "Restored"
 * @property {HTMLElement | null} [region]
 */

/**
 * @typedef {object} UndoToast
 * @property {HTMLElement & { dismiss: () => void }} toast
 * @property {() => 'counting' | 'committing' | 'failed' | 'undone' | 'done'} state
 * @property {() => void} undo undo now
 * @property {() => Promise<void>} accept commit now
 * @property {Promise<'committed' | 'undone' | 'failed' | 'left'>} done settles with how it ended
 */

/** The toasts still counting or committing, oldest first. @type {{ handle: UndoToast, key: string | false }[]} */
const live = [];
let listening = false;

const isMac = () =>
    typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(/** @type {any} */ (navigator).userAgentData?.platform ?? navigator.platform ?? '');

/** @param {string} key `Mod+Z` */
const keyName = (key) => key.replace(/^mod\+/i, isMac() ? '⌘' : 'Ctrl+');

/** @param {KeyboardEvent} event */
function onKey(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'z') return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    for (let i = live.length - 1; i >= 0; i -= 1) {
        const entry = live[i];
        if (entry.key === false || entry.handle.state() !== 'counting') continue;
        event.preventDefault();
        entry.handle.undo();
        return;
    }
}

/** @param {{ handle: UndoToast, key: string | false }} entry */
function enter(entry) {
    live.push(entry);
    if (!listening && typeof document !== 'undefined') {
        document.addEventListener('keydown', onKey);
        listening = true;
    }
}

/** @param {UndoToast} handle */
function leaveStack(handle) {
    const at = live.findIndex((e) => e.handle === handle);
    if (at >= 0) live.splice(at, 1);
    if (live.length === 0 && listening) {
        document.removeEventListener('keydown', onKey);
        listening = false;
    }
}

/**
 * A default the page set on <html> or the toast region.
 * @param {string} name `ms`, `mode` …
 * @param {HTMLElement | null} region
 */
function declared(name, region) {
    const attr = `data-kp-undo-${name}`;
    return region?.getAttribute(attr) ?? (typeof document !== 'undefined' ? document.documentElement.getAttribute(attr) : null);
}

/**
 * Show a toast with Undo and a clock.
 * @param {string} text what happened: "3 schedules deleted"
 * @param {UndoToastOptions} [options]
 * @returns {UndoToast}
 */
export function undoToast(text, options = {}) {
    const strings = getStrings();
    const doc = document;
    const region = options.region ?? null;
    const msDeclared = declared('ms', region);
    const ms = Math.max(0, options.ms ?? (msDeclared !== null && msDeclared !== '' ? Number(msDeclared) : UNDO_MS));
    const mode = (options.mode ?? declared('mode', region)) === 'revert' ? 'revert' : 'defer';
    const clockRaw = options.clock ?? declared('clock', region);
    const clock = clockRaw === 'bar' || clockRaw === 'text' || clockRaw === 'none' ? clockRaw : 'ring';
    const keyRaw = options.key ?? declared('key', region);
    const key = keyRaw === false || keyRaw === 'false' ? false : keyRaw || 'Mod+Z';
    const leaveRaw = options.leave ?? declared('leave', region);
    const leaves = leaveRaw === 'commit' || leaveRaw === 'cancel' ? leaveRaw : 'carry';
    const max = Math.max(1, options.max ?? (Number(declared('max', region)) || UNDO_MAX));
    const seconds = Math.max(1, Math.round(ms / 1000));

    /** @type {'counting' | 'committing' | 'failed' | 'undone' | 'done'} */
    let state = 'counting';
    /** @type {(how: 'committed' | 'undone' | 'failed' | 'left') => void} */
    let finish = () => undefined;
    const done = new Promise((resolve) => (finish = resolve));

    // The content: the clock, the words (and for a screen reader the sentence once), no markup to keep in step.
    const body = doc.createElement('span');
    body.className = 'kp-undo';
    /** The ring and the seconds in it. @type {HTMLElement | null} */
    let ring = null;
    /** @type {HTMLElement | null} */
    let secs = null;
    if (clock === 'ring') {
        ring = doc.createElement('span');
        ring.className = 'kp-undo__ringbox';
        ring.setAttribute('aria-hidden', 'true');
        const circles = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
        circles.setAttribute('class', 'kp-undo__ring');
        circles.setAttribute('viewBox', '0 0 24 24');
        for (const part of ['track', 'fill']) {
            const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('class', `kp-undo__ring-${part}`);
            circle.setAttribute('cx', '12');
            circle.setAttribute('cy', '12');
            circle.setAttribute('r', '10');
            circle.setAttribute('pathLength', '1');
            circles.append(circle);
        }
        ring.append(circles);
        body.append(ring);
    }
    const words = doc.createElement('span');
    words.className = 'kp-undo__text';
    words.setAttribute('aria-hidden', 'true');
    words.textContent = text;
    const said = doc.createElement('span');
    said.className = 'kp-sr-only';
    said.textContent = ms > 0 ? strings.undoToastAnnounce(text, seconds) : text;
    body.append(words, said);
    if (clock === 'text' || clock === 'ring') {
        secs = doc.createElement('span');
        secs.className = clock === 'ring' ? 'kp-undo__secs' : 'kp-undo__clock';
        secs.setAttribute('aria-hidden', 'true');
        secs.textContent = clock === 'ring' ? String(seconds) : strings.undoToastClock(seconds);
        if (ring) ring.append(secs);
        else body.append(secs);
    }
    if (clock === 'bar') {
        const bar = doc.createElement('span');
        bar.className = 'kp-undo__bar';
        bar.setAttribute('aria-hidden', 'true');
        body.append(bar);
    }

    // `ms: 0` for toast(): the clock is this module's, so it can stop and go on where it stopped.
    const el = toast(body, {
        ms: 0,
        region,
        pause: false,
        className: `kp-toast ${UNDO_TOAST}`,
        action: ms > 0 ? { label: strings.undoToastUndo, onClick: () => handle.undo() } : undefined,
        close: false,
    });
    el.setAttribute('data-kp-undo-state', 'counting');
    el.setAttribute('data-kp-undo-clock', clock);
    el.setAttribute('data-kp-undo-mode', mode);
    el.style.setProperty('--kp-undo-ms', `${ms}ms`);
    el.style.setProperty('--kp-undo-steps', String(seconds));
    const undoButton = /** @type {HTMLButtonElement | null} */ (el.querySelector(':scope > .kp-button'));
    if (undoButton && key) undoButton.title = strings.undoToastKeyTitle(keyName(key));
    undoButton?.setAttribute('data-kp-undo-button', '');

    const view = doc.defaultView;
    let remaining = ms;
    let startedAt = 0;
    let timer = 0;
    let tick = 0;
    let pointer = false;
    let focus = false;

    const stopClocks = () => {
        view?.clearTimeout(timer);
        view?.clearInterval(tick);
    };
    /** @param {string} line */
    const setLine = (line) => {
        words.textContent = line;
        said.textContent = line;
    };
    /** @param {'committed' | 'undone' | 'failed' | 'left'} how */
    const announce = (how) => {
        el.parentElement?.dispatchEvent(new CustomEvent(UNDO_TOAST_EVENT, { bubbles: true, detail: { toast: el, outcome: how } }));
    };

    const run = () => {
        startedAt = performance.now();
        timer = view?.setTimeout(() => void handle.accept(), remaining) ?? 0;
        if (secs) {
            const write = () => {
                const left = Math.max(0, Math.ceil((remaining - (performance.now() - startedAt)) / 1000));
                if (secs) secs.textContent = clock === 'ring' ? String(left) : strings.undoToastClock(left);
            };
            tick = view?.setInterval(write, 250) ?? 0;
            write();
        }
    };
    const hold = () => {
        if (state !== 'counting' || el.hasAttribute('data-kp-paused')) return;
        remaining = Math.max(0, remaining - (performance.now() - startedAt));
        stopClocks();
        el.setAttribute('data-kp-paused', '');
    };
    const go = () => {
        if (state !== 'counting' || !el.hasAttribute('data-kp-paused')) return;
        el.removeAttribute('data-kp-paused');
        run();
    };
    const attended = () => (pointer || focus ? hold() : go());
    el.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'touch') return;
        pointer = true;
        attended();
    });
    el.addEventListener('pointerleave', () => {
        pointer = false;
        attended();
    });
    el.addEventListener('focusin', () => {
        focus = true;
        attended();
    });
    el.addEventListener('focusout', (event) => {
        if (event.relatedTarget instanceof Node && el.contains(event.relatedTarget)) return;
        focus = false;
        attended();
    });

    /** @type {UndoToast} */
    const handle = {
        toast: el,
        state: () => state,
        undo() {
            if (state !== 'counting') return;
            state = 'undone';
            stopClocks();
            leaveStack(handle);
            el.setAttribute('data-kp-undo-state', 'undone');
            el.removeAttribute('data-kp-paused');
            setLine(options.restored ?? strings.undoToastRestored);
            undoButton?.remove();
            ring?.remove();
            secs?.remove();
            body.querySelector('.kp-undo__bar')?.remove();
            try {
                void options.undo?.();
            } catch {
                // The page's reverse failed: the toast still says what it can.
            }
            announce('undone');
            finish('undone');
            view?.setTimeout(() => el.dismiss(), UNDO_RESTORED_MS);
        },
        async accept() {
            if (state !== 'counting') return;
            stopClocks();
            state = 'committing';
            el.setAttribute('data-kp-undo-state', 'committing');
            el.removeAttribute('data-kp-paused');
            undoButton?.remove();
            if (mode === 'revert' || !options.commit) {
                state = 'done';
                leaveStack(handle);
                el.setAttribute('data-kp-undo-state', 'done');
                announce('committed');
                finish('committed');
                el.dismiss();
                return;
            }
            const wheel = doc.createElement('span');
            wheel.className = 'kp-spinner kp-undo__spinner';
            wheel.setAttribute('aria-hidden', 'true');
            if (ring) ring.replaceWith(wheel);
            else if (secs) secs.replaceWith(wheel);
            else body.prepend(wheel);
            body.querySelector('.kp-undo__bar')?.remove();
            try {
                await options.commit();
            } catch (error) {
                state = 'failed';
                leaveStack(handle);
                el.setAttribute('data-kp-undo-state', 'failed');
                el.classList.add('kp-toast--destructive');
                wheel.remove();
                const why = error instanceof Error ? error.message : String(error ?? '');
                setLine(options.failed ?? strings.undoToastFailed(why));
                try {
                    void (options.restore ?? options.undo)?.();
                } catch {
                    // Nothing more to do: the toast carries the problem.
                }
                const closer = doc.createElement('button');
                closer.type = 'button';
                closer.className = 'kp-button kp-button--ghost';
                closer.textContent = strings.undoToastDismiss;
                closer.addEventListener('click', () => el.dismiss());
                el.append(closer);
                announce('failed');
                finish('failed');
                return;
            }
            state = 'done';
            leaveStack(handle);
            el.setAttribute('data-kp-undo-state', 'done');
            announce('committed');
            finish('committed');
            el.dismiss();
        },
        done,
    };

    // Esc or a close before the end accepts the action now.
    const dismiss = el.dismiss;
    el.dismiss = () => {
        if (state === 'counting') {
            void handle.accept();
            return;
        }
        if (state === 'committing') return;
        dismiss();
    };

    // Leaving the page.
    const onPageHide = () => {
        if (state !== 'counting') return;
        if (leaves === 'cancel') handle.undo();
        else if (mode === 'defer') {
            // The page is going: commit as far as a script still can.
            try {
                void options.commit?.();
            } catch {
                // Nothing is left to say it to.
            }
            state = 'done';
            finish('left');
        }
        leaveStack(handle);
    };
    const onSoftLeave = () => {
        if (state !== 'counting' || leaves === 'carry') return;
        if (leaves === 'cancel') handle.undo();
        else void handle.accept();
    };
    view?.addEventListener('pagehide', onPageHide);
    view?.addEventListener('popstate', onSoftLeave);
    view?.addEventListener('hashchange', onSoftLeave);
    void done.then(() => {
        view?.removeEventListener('pagehide', onPageHide);
        view?.removeEventListener('popstate', onSoftLeave);
        view?.removeEventListener('hashchange', onSoftLeave);
    });

    if (ms === 0) {
        void handle.accept();
        return handle;
    }
    enter({ handle, key });
    // The oldest gives way: it is committed, and its toast goes.
    const standing = live.filter((e) => e.handle.state() === 'counting' || e.handle.state() === 'committing');
    for (const old of standing.slice(0, Math.max(0, standing.length - max))) void old.handle.accept();
    run();
    return handle;
}
