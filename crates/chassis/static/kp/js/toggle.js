// The toggle button: a button that stays pressed until it is pressed again [kpadopt6-ops; homelab's filter chips,
// segmented switches, pin and follow buttons, JobTracker's `Toggle` and `Seg`].
//
// Not a new control: the `.kp-button` (and the chip `.kp-segmented--chips` look) already drew `aria-pressed='true'`
// in twenty places, each with its own rule. This is the one rule family for it and the script that keeps it honest:
// it flips `aria-pressed`, keeps a group coherent, fires one cancelable event and answers an app that needs time.
//
//   <button class="kp-button" data-kp-toggle aria-pressed="false">Only errors</button>
//
//   <div role="group" aria-label="Level" data-kp-toggle-group="level" data-kp-toggle-mode="single-or-none" data-kp-toggle-clear>
//       <button class="kp-button" data-kp-toggle data-kp-toggle-all data-kp-look="chip">All</button>
//       <button class="kp-button" data-kp-toggle data-kp-look="chip" data-kp-count="12" data-kp-toggle-key="e">Error</button>
//   </div>
//
// The label never changes when the state changes (a pressed toggle keeps its name; changing the words as well reads as
// a different button). Words that change go in the hint under the label. Options, as attributes and as the second
// argument of attachToggles():
//
//   aria-pressed            `true`, `false` (default) or `mixed`: the platform attribute is the single source
//   data-kp-look            `button` (default), `chip` (a pill that wraps in a row) or `icon` (a square)
//   data-kp-count           an exact number beside the label ("Error 12", never "9+"), or `loading` (a skeleton, never "0")
//   data-kp-toggle-group    a name (members share it) or a container of the members
//   data-kp-toggle-mode     on the group: `multi` (default), `single` (one is always on) or `single-or-none`
//   data-kp-toggle-all      one member is the "All" chip: on when nothing else is, pressing it clears the rest
//   data-kp-toggle-value    the member's key in `pressedKeys` (default its id, else its label)
//   data-kp-toggle-key      a key that presses it, listed in the `?` sheet (never a digit: AZERTY's unshifted digits are & é ")
//   data-kp-toggle-async    the app answers the event with `detail.wait(promise)`: busy, rolled back, refusal on the button
//   data-kp-pressed-mark    `none` (default) or `check`: a tick beside the label while it is on, its room kept while it is off
//   data-kp-pressed-hint    a short line under the label while it is on (its row is always there, so nothing moves)
//   data-kp-toggle-clear    on the group: a "Clear filters (N)" button, in place whether or not anything is pressed
//   data-kp-announce        `state` (default), `all` (a changed count too) or `off`: one polite line per change
//   data-kp-remember        remembers the state (a group's keys) per device; off by default, most filters start clean
//   data-kp-disabled-reason a toggle that cannot be pressed says why (js/reason.js)
//
// `kp-toggle` is fired on the button before anything changes, bubbling and cancelable: `{ button, pressed, previous,
// group, pressedKeys, wait }`. Keys: Space and Enter (native); in a `single` group the arrow keys walk the buttons.
// Nothing runs on import.

import { registerShortcuts } from './shortcuts.js';
import { attachDisabledReasons } from './reason.js';
import { getStrings } from './strings.js';

/** A button this module drives. */
export const TOGGLE = '[data-kp-toggle]';
/** Fired on the button before its state changes, cancelable: `{ button, pressed, previous, group, pressedKeys, wait(promise) }`. */
export const TOGGLE_EVENT = 'kp-toggle';
/** Fired on the button after its state changed, or was rolled back: `{ button, pressed, group, pressedKeys, source }`. */
export const TOGGLE_CHANGED_EVENT = 'kp-toggle-changed';
/** The looks a toggle may have. */
export const TOGGLE_LOOKS = /** @type {const} */ (['button', 'chip', 'icon']);
/** How a group lets its members be on together. */
export const TOGGLE_MODES = /** @type {const} */ (['multi', 'single', 'single-or-none']);
/** How long a refusal's word stays on the button, in ms (the flash button's value). */
export const TOGGLE_REFUSED_MS = 3000;

/** @typedef {'true' | 'false' | 'mixed'} PressedState */

/**
 * @typedef {object} ToggleOptions
 * @property {number} [refusedMs] how long a refusal's word stays (default 3000)
 */

/**
 * @typedef {object} ToggleHandle
 * @property {HTMLElement} element
 * @property {() => PressedState} state
 * @property {(state: boolean | 'mixed', options?: { silent?: boolean }) => void} set set the state without the event; a group keeps its rules
 * @property {(count: number | 'loading' | null) => void} setCount the exact number beside the label, a skeleton, or none
 * @property {(text: string) => void} setHint the line under the label while it is on
 * @property {() => void} done an async answer: it went through
 * @property {(message?: string) => void} refuse an async answer: it was refused; the state goes back and the word shows
 */

/** @type {WeakMap<Element, ToggleHandle>} */
const HANDLES = new WeakMap();

/**
 * The handle of an attached toggle.
 * @param {Element} el
 * @returns {ToggleHandle | null}
 */
export function toggle(el) {
    return HANDLES.get(el) ?? null;
}

/** @param {Element} el @returns {PressedState} */
const stateOf = (el) => {
    const v = el.getAttribute('aria-pressed');
    return v === 'true' || v === 'mixed' ? v : 'false';
};

/** The key a member has in `pressedKeys`. @param {HTMLElement} el */
export const toggleKey = (el) => el.dataset.kpToggleValue ?? (el.id || (el.querySelector('.kp-toggle__label') ?? el).textContent?.trim() || '');

/**
 * The group a toggle belongs to: its members, its mode and its container.
 * @param {HTMLElement} button
 * @returns {{ name: string, members: HTMLElement[], mode: 'multi' | 'single' | 'single-or-none', container: HTMLElement | null, all: HTMLElement | null } | null}
 */
export function toggleGroup(button) {
    const holder = /** @type {HTMLElement | null} */ (button.closest('[data-kp-toggle-group]'));
    if (!holder) return null;
    const name = holder.dataset.kpToggleGroup ?? '';
    const own = holder === button;
    const members = own
        ? [...button.ownerDocument.querySelectorAll(TOGGLE)].filter((m) => /** @type {HTMLElement} */ (m).dataset.kpToggleGroup === name)
        : [...holder.querySelectorAll(TOGGLE)];
    const members2 = /** @type {HTMLElement[]} */ (members);
    const said = (own ? members2.find((m) => m.dataset.kpToggleMode) : holder)?.dataset.kpToggleMode;
    const mode = TOGGLE_MODES.includes(/** @type {any} */ (said)) ? /** @type {'multi' | 'single' | 'single-or-none'} */ (said) : 'multi';
    return { name, members: members2, mode, container: own ? null : holder, all: members2.find((m) => m.hasAttribute('data-kp-toggle-all')) ?? null };
}

/**
 * The keys of every member that is on, the "All" member left out.
 * @param {HTMLElement} anyMember
 * @returns {string[]}
 */
export function togglePressedKeys(anyMember) {
    const g = toggleGroup(anyMember);
    const list = g ? g.members : [anyMember];
    return list.filter((m) => !m.hasAttribute('data-kp-toggle-all') && stateOf(m) === 'true').map(toggleKey);
}

/** @param {string} name @param {string} what */
const storeKey = (name, what) => `kp-remember:toggle:${name}:${what}`;
/** @param {string} key */
const readStore = (key) => {
    try {
        const raw = globalThis.localStorage?.getItem(key);
        return raw == null ? undefined : JSON.parse(raw);
    } catch {
        return undefined;
    }
};
/** @param {string} key @param {unknown} value */
const writeStore = (key, value) => {
    try {
        globalThis.localStorage?.setItem(key, JSON.stringify(value));
    } catch {
        /* no storage: no memory, the toggle still works */
    }
};

/** @param {Document} doc @param {string} className @param {string} [tag] */
const made = (doc, className, tag = 'span') => {
    const el = doc.createElement(tag);
    el.className = className;
    return el;
};

/**
 * Give one button its parts and its press.
 * @param {HTMLElement} button
 * @param {ToggleOptions} options
 * @returns {() => void}
 */
function attachOne(button, options) {
    if (HANDLES.has(button)) return () => undefined;
    const doc = button.ownerDocument;
    const s = getStrings();
    /** @type {(() => void)[]} */
    const undo = [];
    const stamp = (/** @type {string} */ name, /** @type {string} */ value) => {
        if (button.hasAttribute(name)) return;
        button.setAttribute(name, value);
        undo.push(() => button.removeAttribute(name));
    };
    if (button instanceof HTMLButtonElement && !button.hasAttribute('type')) stamp('type', 'button');
    stamp('aria-pressed', 'false');
    if (!button.dataset.kpLook) stamp('data-kp-look', 'button');

    const hasCount = button.hasAttribute('data-kp-count');
    const hasHint = button.hasAttribute('data-kp-pressed-hint');
    // The words are wrapped only when there is something to put beside them, so a plain toggle keeps its markup.
    /** @type {HTMLElement | null} */
    let label = null;
    const ensureLabel = () => {
        if (label) return;
        label = made(doc, 'kp-toggle__label');
        for (const node of [...button.childNodes]) if (!(node instanceof HTMLElement && node.className.startsWith('kp-toggle__'))) label.append(node);
        button.append(label);
        undo.push(() => label?.replaceWith(...label.childNodes));
    };
    if (hasCount || hasHint || button.dataset.kpPressedMark === 'check' || button.hasAttribute('data-kp-toggle-async')) ensureLabel();
    /** The tick, kept in step with `data-kp-pressed-mark` while the toggle lives. @type {HTMLElement | null} */
    let mark = null;
    const syncMark = () => {
        const want = button.dataset.kpPressedMark === 'check';
        if (want && !mark) {
            ensureLabel();
            mark = made(doc, 'kp-toggle__mark');
            mark.setAttribute('aria-hidden', 'true');
            button.prepend(mark);
        } else if (!want && mark) {
            mark.remove();
            mark = null;
        }
    };
    syncMark();
    const markWatch = new MutationObserver(syncMark);
    markWatch.observe(button, { attributes: true, attributeFilter: ['data-kp-pressed-mark'] });
    undo.push(() => {
        markWatch.disconnect();
        mark?.remove();
    });
    /** @type {HTMLElement | null} */
    let count = null;
    /** @type {HTMLElement | null} */
    let hint = null;
    if (hasCount) {
        count = made(doc, 'kp-toggle__count');
        button.append(count);
        undo.push(() => count?.remove());
    }
    if (hasHint) {
        hint = made(doc, 'kp-toggle__hint');
        hint.setAttribute('aria-hidden', 'true');
        button.append(hint);
        undo.push(() => hint?.remove());
    }
    /** The refusal's word, laid over the button while it is shown. @type {HTMLElement | null} */
    let refusedWord = null;
    /** The spinner, laid over the button while it works. @type {HTMLElement | null} */
    let spinner = null;

    /** @param {number | 'loading' | null} n */
    const writeCount = (n) => {
        if (!count) return;
        count.replaceChildren();
        count.removeAttribute('data-kp-state');
        if (n === 'loading') {
            count.setAttribute('data-kp-state', 'loading');
            const bone = made(doc, 'kp-skeleton kp-toggle__bone');
            bone.setAttribute('role', 'img');
            bone.setAttribute('aria-label', s.toggleCounting);
            count.append(bone);
            count.style.setProperty('--kp-toggle-digits', '2');
            button.removeAttribute('data-kp-count-value');
        } else if (n === null) {
            count.hidden = true;
            button.removeAttribute('data-kp-count-value');
        } else {
            count.hidden = false;
            count.textContent = String(n);
            // The room for the next digit is held, so a count growing a digit moves nothing.
            count.style.setProperty('--kp-toggle-digits', String(Math.max(2, String(n).length)));
            button.setAttribute('data-kp-count-value', String(n));
        }
    };
    if (hasCount) {
        const raw = button.getAttribute('data-kp-count');
        writeCount(raw === 'loading' ? 'loading' : raw === '' || raw === null || Number.isNaN(Number(raw)) ? null : Number(raw));
    }
    const writeHint = () => {
        if (!hint) return;
        // The words stay in while it is off (unseen, css/components.css), so the button keeps the width of its longest line.
        hint.textContent = button.getAttribute('data-kp-pressed-hint') ?? '';
    };
    writeHint();
    // A member changed by another member's press (a single group, the All chip) redraws its own hint.
    const hintWatch = new MutationObserver(writeHint);
    hintWatch.observe(button, { attributes: true, attributeFilter: ['aria-pressed', 'data-kp-pressed-hint'] });
    undo.push(() => hintWatch.disconnect());

    const labelText = () => (label ?? button).textContent?.trim() ?? '';

    /* ---- the group's parts: the live line and the Clear button, made once per container ---- */
    const group0 = toggleGroup(button);
    /** @param {ReturnType<typeof toggleGroup>} g */
    const regionOf = (g) => {
        const host = g?.container ?? button.parentElement;
        if (!host) return null;
        let region = /** @type {HTMLElement | null} */ (host.querySelector(':scope > .kp-toggle__live'));
        if (!region) {
            region = made(doc, 'kp-sr-only kp-toggle__live');
            region.setAttribute('role', 'status');
            region.setAttribute('aria-live', 'polite');
            host.append(region);
        }
        return region;
    };
    /** @type {number | undefined} */
    let sayTimer;
    /** @param {string} text */
    const say = (text) => {
        if ((button.closest('[data-kp-announce]')?.getAttribute('data-kp-announce') ?? 'state') === 'off') return;
        const region = regionOf(toggleGroup(button));
        if (!region) return;
        // A burst of changes in one tick is one line.
        window.clearTimeout(sayTimer);
        sayTimer = window.setTimeout(() => {
            region.textContent = text;
        }, 40);
    };

    /** The Clear button and its count, kept in step by whichever member changed last. */
    const paintClear = () => {
        const g = toggleGroup(button);
        const container = g?.container;
        if (!container || !container.hasAttribute('data-kp-toggle-clear')) return;
        let clear = /** @type {HTMLButtonElement | null} */ (container.querySelector(':scope > .kp-toggle__clear'));
        if (!clear) {
            clear = /** @type {HTMLButtonElement} */ (made(doc, 'kp-button kp-button--ghost kp-toggle__clear', 'button'));
            clear.type = 'button';
            clear.addEventListener('click', () => {
                const first = toggleGroup(button)?.members.find((m) => stateOf(m) === 'true' && !m.hasAttribute('data-kp-toggle-all'));
                if (first) clearGroup(first);
            });
            container.append(clear);
        }
        const n = togglePressedKeys(button).length;
        clear.textContent = s.toggleClear(n);
        clear.toggleAttribute('data-kp-idle', n === 0);
        clear.inert = n === 0;
        clear.setAttribute('aria-hidden', String(n === 0));
    };

    /**
     * Put the whole group to the state `plan` says, remembering the one before.
     * @param {Map<HTMLElement, PressedState>} plan
     */
    const apply = (plan) => {
        for (const [member, next] of plan) member.setAttribute('aria-pressed', next);
    };

    /** Everything off but the All member (a Clear press, or pressing All). @param {HTMLElement} from */
    const clearGroup = (from) => {
        const g = toggleGroup(from);
        if (!g) return;
        const target = g.all ?? from;
        press(target, true);
    };

    /** What a press on `member` would make of the group. @param {HTMLElement} member @param {boolean} forceClear */
    const planFor = (member, forceClear) => {
        const g = toggleGroup(member);
        /** @type {Map<HTMLElement, PressedState>} */
        const plan = new Map();
        const was = stateOf(member);
        if (!g) {
            plan.set(member, was === 'true' ? 'false' : 'true');
            return plan;
        }
        const isAll = member.hasAttribute('data-kp-toggle-all');
        const others = g.members.filter((m) => m !== member);
        if (isAll || forceClear) {
            // Pressing All clears the rest; with nothing else on, there is nothing to change.
            if (g.members.every((m) => (m === (g.all ?? member) ? false : stateOf(m) !== 'true'))) return plan;
            for (const m of g.members) plan.set(m, m === (g.all ?? member) ? 'true' : 'false');
            return plan;
        }
        if (g.mode === 'single') {
            if (was === 'true') return plan;
            for (const m of others) plan.set(m, 'false');
            plan.set(member, 'true');
        } else if (g.mode === 'single-or-none') {
            if (was === 'true') plan.set(member, 'false');
            else {
                for (const m of others) plan.set(m, 'false');
                plan.set(member, 'true');
            }
        } else plan.set(member, was === 'true' ? 'false' : 'true');
        if (g.all) {
            const anyOn = g.members.some((m) => m !== g.all && (plan.get(m) ?? stateOf(m)) === 'true');
            plan.set(g.all, anyOn ? 'false' : 'true');
        }
        return plan;
    };

    /** @type {{ plan: Map<HTMLElement, PressedState>, before: Map<HTMLElement, PressedState> } | null} */
    let pending = null;
    /** @type {number | undefined} */
    let refusedTimer;

    const remember = () => {
        const g = toggleGroup(button);
        const holder = g?.container?.hasAttribute('data-kp-remember') ? g.container : button.hasAttribute('data-kp-remember') ? button : null;
        const name = holder?.getAttribute('data-kp-remember');
        if (!holder || !name) return;
        writeStore(storeKey(name, 'value'), holder === button && !g?.container ? stateOf(button) === 'true' : togglePressedKeys(button));
    };

    /**
     * @param {HTMLElement} member
     * @param {boolean} forceClear
     */
    function press(member, forceClear = false) {
        if (member !== button) {
            // Another member's press runs through that member's own handle (its busy state and parts).
            member.dispatchEvent(new CustomEvent('kp-toggle-press', { detail: { forceClear } }));
            return;
        }
        if (button.getAttribute('aria-disabled') === 'true' || button.hasAttribute('data-kp-busy') || /** @type {any} */ (button).disabled) return;
        const plan = planFor(member, forceClear);
        if (plan.size === 0) return;
        const g = toggleGroup(member);
        const before = new Map([...plan.keys()].map((m) => [m, stateOf(m)]));
        /** @type {Promise<unknown> | null} */
        let wait = null;
        const nextState = plan.get(member) ?? stateOf(member);
        const after = () => {
            const keys = new Set(
                g ? g.members.filter((m) => (plan.get(m) ?? stateOf(m)) === 'true' && !m.hasAttribute('data-kp-toggle-all')).map(toggleKey) : [],
            );
            return g ? [...keys] : nextState === 'true' ? [toggleKey(member)] : [];
        };
        const detail = {
            button: member,
            pressed: nextState === 'true',
            previous: stateOf(member) === 'true',
            group: g?.name ?? null,
            pressedKeys: after(),
            /** The app's answer takes time: the button is busy until it settles, and goes back if it is refused. @param {Promise<unknown>} promise */
            wait: (promise) => {
                wait = promise;
            },
        };
        const ev = new CustomEvent(TOGGLE_EVENT, { bubbles: true, cancelable: true, detail });
        if (!member.dispatchEvent(ev)) return;
        apply(plan);
        writeHint();
        paintClear();
        remember();
        const total = Number(button.getAttribute('data-kp-count-value'));
        const word =
            nextState === 'true'
                ? s.toggleOn(labelText(), Number.isFinite(total) && button.hasAttribute('data-kp-count-value') ? total : null)
                : s.toggleOff(labelText(), null);
        say(word);
        member.dispatchEvent(
            new CustomEvent(TOGGLE_CHANGED_EVENT, {
                bubbles: true,
                detail: { button: member, pressed: nextState === 'true', group: g?.name ?? null, pressedKeys: after(), source: 'press' },
            }),
        );
        pending = { plan, before };
        if (wait) {
            setBusy(true);
            Promise.resolve(wait).then(
                () => handle0.done(),
                (error) => handle0.refuse(error instanceof Error ? error.message : undefined),
            );
        } else pending = null;
    }

    /** @param {boolean} on */
    function setBusy(on) {
        if (on) {
            button.setAttribute('data-kp-busy', '');
            button.setAttribute('aria-busy', 'true');
            button.setAttribute('aria-disabled', 'true');
            if (!spinner) {
                spinner = made(doc, 'kp-button__busy');
                spinner.setAttribute('aria-hidden', 'true');
                spinner.append(made(doc, 'kp-spinner'));
                button.append(spinner);
            }
        } else {
            button.removeAttribute('data-kp-busy');
            button.removeAttribute('aria-busy');
            button.removeAttribute('aria-disabled');
            spinner?.remove();
            spinner = null;
        }
    }

    /** @type {ToggleHandle} */
    const handle0 = {
        element: button,
        state: () => stateOf(button),
        set(next, { silent = false } = {}) {
            const plan = new Map([[button, next === 'mixed' ? 'mixed' : next ? 'true' : 'false']]);
            const g = toggleGroup(button);
            if (g && next === true && g.mode !== 'multi') for (const m of g.members) if (m !== button) plan.set(m, 'false');
            if (g?.all) {
                const anyOn = g.members.some((m) => m !== g.all && (plan.get(m) ?? stateOf(m)) === 'true');
                plan.set(g.all, anyOn ? 'false' : 'true');
            }
            apply(/** @type {Map<HTMLElement, PressedState>} */ (plan));
            writeHint();
            paintClear();
            if (!silent) {
                remember();
                button.dispatchEvent(
                    new CustomEvent(TOGGLE_CHANGED_EVENT, {
                        bubbles: true,
                        detail: {
                            button,
                            pressed: stateOf(button) === 'true',
                            group: g?.name ?? null,
                            pressedKeys: togglePressedKeys(button),
                            source: 'script',
                        },
                    }),
                );
            }
        },
        setCount(n) {
            if (!count) {
                count = made(doc, 'kp-toggle__count');
                ensureLabel();
                button.append(count);
                button.setAttribute('data-kp-count', '');
            }
            writeCount(n);
            const mode = button.closest('[data-kp-announce]')?.getAttribute('data-kp-announce');
            if (mode === 'all' && typeof n === 'number') say(s.toggleCount(labelText(), n));
        },
        setHint(text) {
            button.setAttribute('data-kp-pressed-hint', text);
            if (!hint) {
                hint = made(doc, 'kp-toggle__hint');
                hint.setAttribute('aria-hidden', 'true');
                button.append(hint);
            }
            writeHint();
        },
        done() {
            pending = null;
            setBusy(false);
        },
        refuse(message) {
            const back = pending;
            pending = null;
            setBusy(false);
            if (back) {
                apply(back.before);
                writeHint();
                paintClear();
                remember();
            }
            const word = button.getAttribute('data-kp-refused-word') ?? s.toggleRefused;
            refusedWord?.remove();
            refusedWord = made(doc, 'kp-toggle__refused');
            refusedWord.textContent = word;
            if (message) button.title = message;
            button.setAttribute('data-kp-refused', '');
            button.append(refusedWord);
            say(message ? `${word}. ${message}` : word);
            window.clearTimeout(refusedTimer);
            refusedTimer = window.setTimeout(() => {
                refusedWord?.remove();
                refusedWord = null;
                button.removeAttribute('data-kp-refused');
                if (message) button.removeAttribute('title');
            }, options.refusedMs ?? TOGGLE_REFUSED_MS);
        },
    };
    HANDLES.set(button, handle0);

    /* ---- remembered state, read before the first press ---- */
    {
        const g = group0;
        const holder = g?.container?.hasAttribute('data-kp-remember') ? g.container : button.hasAttribute('data-kp-remember') ? button : null;
        const name = holder?.getAttribute('data-kp-remember');
        if (holder && name) {
            const kept = readStore(storeKey(name, 'value'));
            if (holder === button && !g?.container && typeof kept === 'boolean') button.setAttribute('aria-pressed', String(kept));
            else if (Array.isArray(kept) && g?.container === holder)
                button.setAttribute(
                    'aria-pressed',
                    kept.includes(toggleKey(button)) && !button.hasAttribute('data-kp-toggle-all') ? 'true' : stateOf(button),
                );
        }
        if (g?.all === button) {
            // The All member reads from the others once they have all been attached.
            queueMicrotask(() => {
                const on = g.members.some((m) => m !== button && stateOf(m) === 'true');
                button.setAttribute('aria-pressed', String(!on));
            });
        }
    }
    writeHint();
    queueMicrotask(paintClear);

    /* ---- the press ---- */
    const onClick = (/** @type {Event} */ event) => {
        event.preventDefault();
        press(button);
    };
    const onRemote = (/** @type {Event} */ event) => {
        press(button, Boolean(/** @type {CustomEvent} */ (event).detail?.forceClear));
    };
    button.addEventListener('click', onClick);
    button.addEventListener('kp-toggle-press', onRemote);
    undo.push(() => button.removeEventListener('click', onClick));
    undo.push(() => button.removeEventListener('kp-toggle-press', onRemote));

    /* ---- a single group walks with the arrow keys, one stop in the Tab order ---- */
    const arrows = (/** @type {KeyboardEvent} */ event) => {
        const g = toggleGroup(button);
        if (!g || g.mode !== 'single' || event.altKey || event.ctrlKey || event.metaKey) return;
        const at = g.members.indexOf(button);
        const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
        if (step === 0 && event.key !== 'Home' && event.key !== 'End') return;
        const usable = g.members.filter((m) => !(/** @type {any} */ (m).disabled));
        const next =
            event.key === 'Home'
                ? usable[0]
                : event.key === 'End'
                  ? usable[usable.length - 1]
                  : usable[(usable.indexOf(g.members[at]) + step + usable.length) % usable.length];
        if (!next) return;
        event.preventDefault();
        next.focus();
    };
    button.addEventListener('keydown', arrows);
    undo.push(() => button.removeEventListener('keydown', arrows));
    if (group0?.mode === 'single') {
        const rove = () => {
            const g = toggleGroup(button);
            if (!g) return;
            const on = g.members.find((m) => stateOf(m) === 'true') ?? g.members[0];
            for (const m of g.members) m.tabIndex = m === on ? 0 : -1;
        };
        const watch = new MutationObserver(rove);
        watch.observe(button, { attributes: true, attributeFilter: ['aria-pressed'] });
        rove();
        undo.push(() => {
            watch.disconnect();
            button.removeAttribute('tabindex');
        });
    }

    /* ---- the key ---- */
    const key = button.dataset.kpToggleKey;
    if (key) {
        if (/^[0-9]$/.test(key)) {
            console.warn(`[kp-toggle] "${key}" is a bare digit: an unshifted digit on AZERTY types & é ", so the key is not registered.`);
        } else {
            button.setAttribute('aria-keyshortcuts', key);
            const off = registerShortcuts(
                button,
                [
                    {
                        keys: key,
                        what: s.toggleKeyWhat(labelText()),
                        group: s.toggleKeyGroup,
                        run: () => {
                            button.click();
                        },
                        when: () => !(/** @type {any} */ (button).disabled) && button.getAttribute('aria-disabled') !== 'true',
                    },
                ],
                { layoutGuard: 'warn' },
            );
            undo.push(() => {
                off();
                button.removeAttribute('aria-keyshortcuts');
            });
        }
    }

    const detachReason =
        button.hasAttribute('data-kp-disabled-reason') && button.parentElement ? attachDisabledReasons(button.parentElement) : () => undefined;
    undo.push(detachReason);

    return () => {
        window.clearTimeout(sayTimer);
        window.clearTimeout(refusedTimer);
        refusedWord?.remove();
        spinner?.remove();
        for (const fn of undo.reverse()) fn();
        HANDLES.delete(button);
    };
}

/**
 * Give every toggle button under `root` its press, its group and its parts.
 *
 * @param {ParentNode} [root]
 * @param {ToggleOptions} [options]
 * @returns {() => void} detach
 */
export function attachToggles(root = document, options = {}) {
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(TOGGLE) ? [root] : []),
        ...root.querySelectorAll(TOGGLE),
    ]);
    // The first member of a group attaches last of the work that reads the others: all are attached in one pass.
    const undo = found.map((el) => attachOne(el, options));
    return () => undo.forEach((u) => u());
}
