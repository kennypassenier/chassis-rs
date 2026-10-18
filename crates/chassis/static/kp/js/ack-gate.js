// The acknowledge gate: a tick that must be set before a button may be pressed [kpadopt6-ops; homelab's major-version box,
// `uf-major__item`, `paintGo`].
//
// A warning alert says what is about to happen ("jellyfin 10.11 → 12.1 is a major version"), offers the release notes,
// and holds a checkbox with a sentence ("I read the release notes of 12.1"). The button it guards stays off until the
// box is ticked, says why while it is off, and answers a press on it by taking the reader to the first box still
// unticked. The gate is a human guard, not a security control: the server still verifies on its own.
//
//   <div class="kp-alert kp-alert--warning" data-kp-ack data-kp-ack-for="#update" data-kp-ack-key="jellyfin"
//        data-kp-ack-label="I read the release notes of 12.1" data-kp-ack-link="https://example.com/notes">
//       <div class="kp-alert__body"><strong>jellyfin 10.11 → 12.1 is a major version</strong> …</div>
//   </div>
//   <button class="kp-button kp-button--primary" id="update">Update</button>
//
//   data-kp-ack-for          the control(s) to enable (a selector; required)
//   data-kp-ack-label        the tick's words (default "I read the release notes")
//   data-kp-ack-link         the release notes' URL, with `data-kp-ack-link-label` for its words (opens in a new tab;
//                            opening it ticks nothing for the reader)
//   data-kp-ack-tone         `warning` (default), `destructive` or `info`
//   data-kp-ack-mode         several gates, one control: `each` (default, one tick per gate) or `all` (one tick for the lot)
//   data-kp-ack-reset        `on-change` (default: a changed `data-kp-ack-key`, `-label` or `-version` clears the tick, a
//                            stale tick is a false promise) or `never`
//   data-kp-ack-min-ms       the tick cannot be set before the link was opened or this many ms passed (default 0)
//   data-kp-ack-require-link the tick stays off until the link was opened once
//   data-kp-ack-focus        a press on the off control takes the focus to the first open tick (default on; `off`)
//   data-kp-ack-key          names the item for the event and the announcement
//   data-kp-ack-retry        a failed lookup offers a Retry button (`kp-ack-retry`)
//   data-kp-state            `loading` (skeleton lines, the alert keeps its height, the tick off), `error` (no notes link
//                            found, the tick stays) or `empty` (no gate at all: hidden, the control simply enabled)
//   data-kp-ack-locked       the tick is locked while the job runs
//
// `kp-ack-change` `{ key, checked, remaining, at }` is fired on the gate. The control carries `aria-disabled` (so the press
// can answer) and the reason as `data-kp-disabled-reason` (js/reason.js); the change is announced once, politely. Nothing
// runs on import.

import { attachDisabledReasons } from './reason.js';
import { getStrings } from './strings.js';

/** The gates this module drives. */
export const ACK_GATE = '[data-kp-ack]';
/** Fired on the gate when its tick changes: `{ key, checked, remaining, at }`. */
export const ACK_EVENT = 'kp-ack-change';
/** Fired on the gate when its Retry is pressed. */
export const ACK_RETRY_EVENT = 'kp-ack-retry';

/**
 * @typedef {object} AckHandle
 * @property {HTMLElement} element
 * @property {() => boolean} checked
 * @property {(checked: boolean) => void} set
 * @property {(state: 'ready' | 'loading' | 'error' | 'empty') => void} setState
 * @property {(locked: boolean) => void} setLocked
 * @property {() => number} remaining how many gates of this gate's controls are still unticked
 */

/** @type {WeakMap<Element, AckHandle>} */
const HANDLES = new WeakMap();

/**
 * The handle of an attached gate.
 * @param {Element} el
 * @returns {AckHandle | null}
 */
export function ackGate(el) {
    return HANDLES.get(el) ?? null;
}

/** @param {Element} gate @returns {HTMLElement[]} */
const targetsOf = (gate) => {
    const selector = gate.getAttribute('data-kp-ack-for');
    if (!selector) return [];
    try {
        return /** @type {HTMLElement[]} */ ([...gate.ownerDocument.querySelectorAll(selector)]);
    } catch {
        return [];
    }
};

/** The gates that guard the same control as `gate`, itself included. @param {Element} gate @returns {HTMLElement[]} */
const siblingsOf = (gate) => {
    const mine = targetsOf(gate);
    return /** @type {HTMLElement[]} */ ([...gate.ownerDocument.querySelectorAll(ACK_GATE)]).filter(
        (other) => HANDLES.has(other) && targetsOf(other).some((t) => mine.includes(t)),
    );
};

/** Whether a gate holds the control back: unticked and in play. @param {HTMLElement} gate */
const open = (gate) => {
    const state = gate.getAttribute('data-kp-state');
    if (state === 'empty' || gate.hidden) return false;
    return HANDLES.get(gate)?.checked() !== true;
};

let counter = 0;

/**
 * @param {HTMLElement} gate
 * @returns {() => void}
 */
function attachOne(gate) {
    if (HANDLES.has(gate)) return () => undefined;
    const doc = gate.ownerDocument;
    const s = getStrings();
    /** @type {(() => void)[]} */
    const undo = [];
    const id = `kp-ack-${++counter}`;
    gate.classList.add('kp-ack');
    undo.push(() => gate.classList.remove('kp-ack'));
    if (!gate.classList.contains('kp-alert')) gate.classList.add('kp-alert');
    const tone = gate.getAttribute('data-kp-ack-tone') ?? 'warning';
    const toneClass = `kp-alert--${['warning', 'destructive', 'info'].includes(tone) ? tone : 'warning'}`;
    gate.classList.add(toneClass);
    gate.setAttribute('role', 'group');
    const key = () => gate.getAttribute('data-kp-ack-key') ?? gate.id ?? id;

    /** @param {string} className @param {string} [tag] */
    const make = (className, tag = 'div') => {
        const el = doc.createElement(tag);
        el.className = className;
        return el;
    };

    // The side: the notes link, then the tick.
    const side = make('kp-ack__side');
    const link = gate.getAttribute('data-kp-ack-link');
    /** @type {HTMLAnchorElement | null} */
    let anchor = null;
    let linkOpened = false;
    if (link) {
        anchor = /** @type {HTMLAnchorElement} */ (make('kp-ack__link', 'a'));
        anchor.href = link;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = gate.getAttribute('data-kp-ack-link-label') ?? s.ackLink;
        side.append(anchor);
    }
    const tick = /** @type {HTMLLabelElement} */ (make('kp-ack__tick', 'label'));
    const box = /** @type {HTMLInputElement} */ (make('kp-field__check', 'input'));
    box.type = 'checkbox';
    box.id = `${id}-box`;
    const words = make('kp-ack__label', 'span');
    tick.append(box, words);
    side.append(tick);
    const live = make('kp-sr-only', 'span');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    const wait = make('kp-ack__wait');
    wait.setAttribute('aria-hidden', 'true');
    wait.hidden = true;
    for (let i = 0; i < 2; i++) wait.append(make('kp-skeleton kp-ack__bone', 'span'));
    const problem = make('kp-ack__problem');
    problem.hidden = true;
    const problemText = make('kp-ack__problem-text', 'span');
    const retry = /** @type {HTMLButtonElement} */ (make('kp-button kp-ack__retry', 'button'));
    retry.type = 'button';
    retry.textContent = s.ackRetry;
    retry.hidden = true;
    problem.append(problemText, retry);
    // The words and the side stand in one frame, so a container query can lay the frame out (it cannot lay out its own container).
    const frame = make('kp-ack__frame');
    const authored = [...gate.childNodes];
    side.prepend(problem);
    frame.append(...authored, side);
    gate.append(frame, wait, live);
    undo.push(() => {
        gate.prepend(...authored);
        frame.remove();
        wait.remove();
        live.remove();
    });
    const labelText = () => gate.getAttribute('data-kp-ack-label') ?? s.ackLabel;

    let locked = gate.hasAttribute('data-kp-ack-locked');
    const mode = () => (gate.getAttribute('data-kp-ack-mode') === 'all' ? 'all' : 'each');
    const startedAt = performance.now();
    const minMs = () => Number(gate.getAttribute('data-kp-ack-min-ms')) || 0;
    const needsLink = () => gate.hasAttribute('data-kp-ack-require-link');

    /** Why the tick cannot be set now, or ''. */
    const tickBlock = () => {
        const state = gate.getAttribute('data-kp-state');
        if (state === 'loading') return s.ackLooking;
        if (locked) return s.ackLocked;
        if (needsLink() && !linkOpened) return s.ackOpenFirst;
        if (minMs() > 0 && !linkOpened && performance.now() - startedAt < minMs()) return s.ackOpenFirst;
        return '';
    };

    /** The reason a control gives while it is off. */
    const reasonFor = () => {
        const mine = siblingsOf(gate).filter(open);
        if (mine.length === 0) return '';
        const all = siblingsOf(gate).filter((g) => g.getAttribute('data-kp-state') !== 'empty' && !g.hidden);
        if (all.length > 1) return s.ackReasonMany(mine.length, all.length);
        return s.ackReason(labelText());
    };

    /** @param {HTMLElement} target */
    const guardTarget = (target) => {
        if (target.dataset.kpAckGuarded !== undefined) return;
        target.dataset.kpAckGuarded = '';
        const guard = (/** @type {Event} */ event) => {
            if (target.getAttribute('aria-disabled') !== 'true' || target.getAttribute('data-kp-ack-held') === null) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const first = siblingsOf(gate).find(open);
            if (first && first.getAttribute('data-kp-ack-focus') !== 'off')
                /** @type {HTMLElement | null} */ (first.querySelector('.kp-ack__tick input'))?.focus();
        };
        target.addEventListener('click', guard, true);
        undo.push(() => {
            target.removeEventListener('click', guard, true);
            delete target.dataset.kpAckGuarded;
            target.removeAttribute('data-kp-ack-held');
        });
    };

    /** Bring every control this gate guards in step with every gate that guards it. */
    const syncTargets = () => {
        for (const target of targetsOf(gate)) {
            guardTarget(target);
            const gates = siblingsOf(gate);
            const holding = gates.some(open);
            if (holding) {
                if (target.getAttribute('data-kp-ack-held') === null) {
                    target.setAttribute('data-kp-ack-held', '');
                    target.dataset.kpAckWas = target.getAttribute('aria-disabled') ?? '';
                }
                target.setAttribute('aria-disabled', 'true');
                target.setAttribute('data-kp-disabled-reason', reasonFor());
                if (target.parentElement && !target.closest('.kp-reason')) attachDisabledReasons(target.parentElement);
            } else if (target.getAttribute('data-kp-ack-held') !== null) {
                target.removeAttribute('data-kp-ack-held');
                if (target.dataset.kpAckWas === 'true') target.setAttribute('aria-disabled', 'true');
                else target.removeAttribute('aria-disabled');
                target.removeAttribute('data-kp-disabled-reason');
                delete target.dataset.kpAckWas;
            }
        }
    };

    /** @type {number | undefined} */
    let sayTimer;
    /** @param {string} text */
    const say = (text) => {
        window.clearTimeout(sayTimer);
        sayTimer = window.setTimeout(() => (live.textContent = text), 40);
    };

    const paint = () => {
        words.textContent = labelText();
        const block = tickBlock();
        box.disabled = block !== '';
        if (block) tick.setAttribute('data-kp-reason', block);
        else tick.removeAttribute('data-kp-reason');
        tick.title = block;
        const state = gate.getAttribute('data-kp-state');
        wait.hidden = state !== 'loading';
        gate.toggleAttribute('aria-busy', state === 'loading');
        if (state === 'empty') {
            if (!gate.hidden) gate.setAttribute('data-kp-ack-hid', '');
            gate.hidden = true;
        } else if (gate.hasAttribute('data-kp-ack-hid')) {
            gate.hidden = false;
            gate.removeAttribute('data-kp-ack-hid');
        }
        problem.hidden = state !== 'error';
        retry.hidden = !(state === 'error' && gate.hasAttribute('data-kp-ack-retry'));
        problemText.textContent = state === 'error' ? s.ackNoLink : '';
        if (anchor) anchor.hidden = state === 'error';
        gate.toggleAttribute('data-kp-checked', box.checked);
    };

    /** Keep the alert's height through a state that stands in for its words. */
    const keepHeight = () => {
        const state = gate.getAttribute('data-kp-state');
        if (state === null || state === 'ready') gate.style.setProperty('--kp-ack-keep', `${gate.offsetHeight}px`);
    };

    /** What the gate last decided: the browser flips the box before its change event, so the box cannot say what changed. */
    let ticked = false;
    /** @param {boolean} checked @param {boolean} fire */
    const set = (checked, fire) => {
        if (checked && tickBlock()) return;
        const changed = ticked !== checked;
        ticked = checked;
        box.checked = checked;
        if (changed && mode() === 'all') for (const other of siblingsOf(gate)) if (other !== gate) HANDLES.get(other)?.set(checked);
        paint();
        for (const g of siblingsOf(gate)) g.dispatchEvent(new CustomEvent('kp-ack-sync'));
        syncTargets();
        if (changed && fire) {
            const remaining = siblingsOf(gate).filter(open).length;
            gate.dispatchEvent(
                new CustomEvent(ACK_EVENT, { bubbles: true, detail: { key: key(), checked, remaining, at: new Date().toISOString() } }),
            );
            say(remaining === 0 ? s.ackEnabled : s.ackDisabled(remaining));
        }
    };

    /** @type {AckHandle} */
    const handle = {
        element: gate,
        checked: () => box.checked,
        set: (checked) => set(checked, true),
        setState(state) {
            if (state === 'ready') gate.removeAttribute('data-kp-state');
            else gate.setAttribute('data-kp-state', state);
        },
        setLocked(value) {
            locked = value;
            gate.toggleAttribute('data-kp-ack-locked', value);
            paint();
        },
        remaining: () => siblingsOf(gate).filter(open).length,
    };
    HANDLES.set(gate, handle);

    const onChange = () => set(box.checked, true);
    const onSync = () => {
        syncTargets();
        paint();
    };
    const onLink = () => {
        linkOpened = true;
        paint();
    };
    const onRetry = () => gate.dispatchEvent(new CustomEvent(ACK_RETRY_EVENT, { bubbles: true }));
    box.addEventListener('change', onChange);
    gate.addEventListener('kp-ack-sync', onSync);
    anchor?.addEventListener('click', onLink);
    retry.addEventListener('click', onRetry);
    undo.push(() => {
        box.removeEventListener('change', onChange);
        gate.removeEventListener('kp-ack-sync', onSync);
        anchor?.removeEventListener('click', onLink);
        retry.removeEventListener('click', onRetry);
    });

    // A changed item is a new decision: the tick clears (default), and a gate redraws when its words or state change.
    /** @type {string} */
    let sig = `${key()}|${gate.getAttribute('data-kp-ack-version') ?? ''}|${labelText()}`;
    const watch = new MutationObserver(() => {
        const next = `${key()}|${gate.getAttribute('data-kp-ack-version') ?? ''}|${labelText()}`;
        if (next !== sig && gate.getAttribute('data-kp-ack-reset') !== 'never' && box.checked) set(false, true);
        sig = next;
        paint();
        syncTargets();
        if (gate.getAttribute('data-kp-state') === null) keepHeight();
    });
    watch.observe(gate, {
        attributes: true,
        attributeFilter: [
            'data-kp-ack-key',
            'data-kp-ack-version',
            'data-kp-ack-label',
            'data-kp-state',
            'data-kp-ack-tone',
            'data-kp-ack-mode',
            'data-kp-ack-locked',
            'data-kp-ack-link-label',
        ],
    });
    undo.push(() => watch.disconnect());

    // A min-ms wait ends by itself.
    /** @type {number | undefined} */
    let waitTimer;
    if (minMs() > 0) waitTimer = window.setTimeout(paint, minMs() + 20);
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(keepHeight) : null;
    resize?.observe(gate);
    undo.push(() => resize?.disconnect());
    paint();
    // Every gate of a page is attached in one pass: the controls are read once all of them are known.
    queueMicrotask(() => {
        syncTargets();
        keepHeight();
    });
    return () => {
        window.clearTimeout(waitTimer);
        window.clearTimeout(sayTimer);
        for (const fn of undo.reverse()) fn();
        for (const target of targetsOf(gate)) {
            target.removeAttribute('data-kp-ack-held');
        }
        HANDLES.delete(gate);
    };
}

/**
 * Give every acknowledge gate under `root` its tick and guard its controls.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachAckGates(root = document) {
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(ACK_GATE) ? [root] : []),
        ...root.querySelectorAll(ACK_GATE),
    ]);
    const undo = found.map((el) => attachOne(el));
    return () => undo.forEach((u) => u());
}
