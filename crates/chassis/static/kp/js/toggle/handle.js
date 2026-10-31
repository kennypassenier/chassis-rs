// What a toggle answers to: the handle a page gets (set, count, hint, done, refuse), the app's async answer, and the
// remembered value written after every change.

import { TOGGLE_CHANGED_EVENT, TOGGLE_REFUSED_MS, applyPlan, stateOf, storeKey, toggleGroup, togglePressedKeys, withAll, writeStore } from './group.js';
import { ToggleParts } from './parts.js';

/** @typedef {import('./group.js').PressedState} PressedState */
/** @typedef {import('../toggle.js').ToggleHandle} ToggleHandle */

export class ToggleAnswers extends ToggleParts {
    /** @param {HTMLElement} button @param {import('../toggle.js').ToggleOptions} [options] */
    constructor(button, options = {}) {
        super(button, options);
        /** A press waiting on the app's answer, with the states to go back to. @type {{ plan: Map<HTMLElement, PressedState>, before: Map<HTMLElement, PressedState> } | null} */
        this.pending = null;
        /** @type {number | undefined} */
        this.refusedTimer = undefined;
        /** @type {ToggleHandle} */
        this.handle = {
            element: button,
            state: () => stateOf(button),
            set: (next, how) => this.setValue(next, how),
            setCount: (n) => this.setCount(n),
            setHint: (text) => this.setHint(text),
            done: () => this.done(),
            refuse: (message) => this.refuse(message),
        };
    }

    /** The element whose `data-kp-remember` keeps the value: the group's container, else the lone button. @param {ReturnType<typeof toggleGroup>} g */
    rememberHolder(g) {
        return g?.container?.hasAttribute('data-kp-remember') ? g.container : this.button.hasAttribute('data-kp-remember') ? this.button : null;
    }

    remember() {
        const g = toggleGroup(this.button);
        const holder = this.rememberHolder(g);
        const name = holder?.getAttribute('data-kp-remember');
        if (!holder || !name) return;
        writeStore(storeKey(name, 'value'), holder === this.button && !g?.container ? stateOf(this.button) === 'true' : togglePressedKeys(this.button));
    }

    /** The plan applied, and the hint, the Clear button and the memory after it. @param {Map<HTMLElement, PressedState>} plan */
    settle(plan) {
        applyPlan(plan);
        this.writeHint();
        this.paintClear();
        this.remember();
    }

    /**
     * Wait for the app's answer when it asked to (`detail.wait(promise)`): busy until it settles, back to the old states if it is refused.
     * @param {Promise<unknown> | null} wait @param {Map<HTMLElement, PressedState>} plan @param {Map<HTMLElement, PressedState>} before
     */
    awaitAnswer(wait, plan, before) {
        if (!wait) return;
        this.pending = { plan, before };
        this.setBusy(true);
        Promise.resolve(wait).then(
            () => this.done(),
            (error) => this.refuse(error instanceof Error ? error.message : undefined),
        );
    }

    /** Set the state without the press event; a group keeps its rules. @param {boolean | 'mixed'} next @param {{ silent?: boolean }} [how] */
    setValue(next, { silent = false } = {}) {
        const button = this.button;
        /** @type {Map<HTMLElement, PressedState>} */
        const plan = new Map([[button, next === 'mixed' ? 'mixed' : next ? 'true' : 'false']]);
        const g = toggleGroup(button);
        if (g && next === true && g.mode !== 'multi') for (const m of g.members) if (m !== button) plan.set(m, 'false');
        if (g) withAll(g, plan);
        applyPlan(plan);
        this.writeHint();
        this.paintClear();
        if (silent) return;
        this.remember();
        const detail = { button, pressed: stateOf(button) === 'true', group: g?.name ?? null, pressedKeys: togglePressedKeys(button), source: 'script' };
        button.dispatchEvent(new CustomEvent(TOGGLE_CHANGED_EVENT, { bubbles: true, detail }));
    }

    /** @param {number | 'loading' | null} n */
    setCount(n) {
        this.ensureCount();
        this.writeCount(n);
        const mode = this.button.closest('[data-kp-announce]')?.getAttribute('data-kp-announce');
        if (mode === 'all' && typeof n === 'number') this.say(this.s.toggleCount(this.labelText(), n));
    }

    /** @param {string} text */
    setHint(text) {
        this.button.setAttribute('data-kp-pressed-hint', text);
        if (!this.hint) this.makeHint();
        this.writeHint();
    }

    done() {
        this.pending = null;
        this.setBusy(false);
    }

    /** The app refused: the states go back and the refusal's word shows for a moment. @param {string} [message] */
    refuse(message) {
        const button = this.button;
        const back = this.pending;
        this.pending = null;
        this.setBusy(false);
        if (back) this.settle(back.before);
        const word = button.getAttribute('data-kp-refused-word') ?? this.s.toggleRefused;
        this.showRefused(word, message);
        this.say(message ? `${word}. ${message}` : word);
        window.clearTimeout(this.refusedTimer);
        this.refusedTimer = window.setTimeout(() => this.hideRefused(message), /** @type {import('../toggle.js').ToggleOptions} */ (this.options).refusedMs ?? TOGGLE_REFUSED_MS);
    }
}
