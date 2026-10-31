// One toggle: wired in the order its parts depend on, its press (with the group's rules, the app's say and an async
// answer), its handle, the remembered value, the arrow keys of a single group, its shortcut and its disabled reason.

import { attachDisabledReasons } from '../reason.js';
import { registerShortcuts } from '../shortcuts.js';
import { TOGGLE_CHANGED_EVENT, TOGGLE_EVENT, planFor, readStore, stateOf, storeKey, toggleGroup, toggleKey } from './group.js';
import { ToggleAnswers } from './handle.js';

/** @typedef {import('./group.js').PressedState} PressedState */

export class ToggleControl extends ToggleAnswers {
    connect() {
        const button = this.button;
        if (button instanceof HTMLButtonElement && !button.hasAttribute('type')) this.stamp('type', 'button');
        this.stamp('aria-pressed', 'false');
        if (!button.dataset.kpLook) this.stamp('data-kp-look', 'button');
        this.buildParts();
        const group0 = toggleGroup(button);
        this.readRemembered(group0);
        this.writeHint();
        queueMicrotask(() => this.paintClear());
        this.listen(button, 'click', (event) => {
            event.preventDefault();
            this.press(button);
        });
        this.listen(button, 'kp-toggle-press', (event) => this.press(button, Boolean(/** @type {CustomEvent} */ (event).detail?.forceClear)));
        this.listen(button, 'keydown', (event) => this.arrows(/** @type {KeyboardEvent} */ (event)));
        if (group0?.mode === 'single') this.rove();
        this.registerKey();
        this.own(button.hasAttribute('data-kp-disabled-reason') && button.parentElement ? attachDisabledReasons(button.parentElement) : () => undefined);
        // Registered last, so it runs first, as the old detach did: the timers, the refusal and the spinner go before the rest.
        this.own(() => {
            window.clearTimeout(this.sayTimer);
            window.clearTimeout(this.refusedTimer);
            this.refusedWord?.remove();
            this.spinner?.remove();
        });
    }

    /** The label, the tick, the count and the hint, each only when the markup asks for it. */
    buildParts() {
        const button = this.button;
        const hasCount = button.hasAttribute('data-kp-count');
        const hasHint = button.hasAttribute('data-kp-pressed-hint');
        if (hasCount || hasHint || button.dataset.kpPressedMark === 'check' || button.hasAttribute('data-kp-toggle-async')) this.ensureLabel();
        this.syncMark();
        this.observe(new MutationObserver(() => this.syncMark())).observe(button, { attributes: true, attributeFilter: ['data-kp-pressed-mark'] });
        this.own(() => this.mark?.remove());
        if (hasCount) {
            this.makeCount();
            this.own(() => this.count?.remove());
        }
        if (hasHint) {
            this.makeHint();
            this.own(() => this.hint?.remove());
        }
        if (hasCount) {
            const raw = button.getAttribute('data-kp-count');
            this.writeCount(raw === 'loading' ? 'loading' : raw === '' || raw === null || Number.isNaN(Number(raw)) ? null : Number(raw));
        }
        this.writeHint();
        // A member changed by another member's press (a single group, the All chip) redraws its own hint.
        this.observe(new MutationObserver(() => this.writeHint())).observe(button, { attributes: true, attributeFilter: ['aria-pressed', 'data-kp-pressed-hint'] });
    }


    /** Remembered state, read before the first press; the All member reads the others once they have all been attached. @param {ReturnType<typeof toggleGroup>} g */
    readRemembered(g) {
        const button = this.button;
        const holder = this.rememberHolder(g);
        const name = holder?.getAttribute('data-kp-remember');
        if (holder && name) {
            const kept = readStore(storeKey(name, 'value'));
            if (holder === button && !g?.container && typeof kept === 'boolean') button.setAttribute('aria-pressed', String(kept));
            else if (Array.isArray(kept) && g?.container === holder)
                button.setAttribute('aria-pressed', kept.includes(toggleKey(button)) && !button.hasAttribute('data-kp-toggle-all') ? 'true' : stateOf(button));
        }
        if (g?.all === button)
            queueMicrotask(() => {
                const on = g.members.some((m) => m !== button && stateOf(m) === 'true');
                button.setAttribute('aria-pressed', String(!on));
            });
    }


    /** @param {HTMLElement} member @param {boolean} [forceClear] */
    press(member, forceClear = false) {
        const button = this.button;
        // Another member's press runs through that member's own controller (its busy state and parts).
        if (member !== button) return void member.dispatchEvent(new CustomEvent('kp-toggle-press', { detail: { forceClear } }));
        if (button.getAttribute('aria-disabled') === 'true' || button.hasAttribute('data-kp-busy') || /** @type {any} */ (button).disabled) return;
        const plan = planFor(member, forceClear);
        if (plan.size === 0) return;
        const g = toggleGroup(member);
        const before = new Map([...plan.keys()].map((m) => [m, stateOf(m)]));
        const nextState = plan.get(member) ?? stateOf(member);
        const after = () =>
            g ? [...new Set(g.members.filter((m) => (plan.get(m) ?? stateOf(m)) === 'true' && !m.hasAttribute('data-kp-toggle-all')).map(toggleKey))] : nextState === 'true' ? [toggleKey(member)] : [];
        /** @type {Promise<unknown> | null} */
        let wait = null;
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
        if (!member.dispatchEvent(new CustomEvent(TOGGLE_EVENT, { bubbles: true, cancelable: true, detail }))) return;
        this.settle(plan);
        this.sayState(nextState);
        member.dispatchEvent(new CustomEvent(TOGGLE_CHANGED_EVENT, { bubbles: true, detail: { button: member, pressed: nextState === 'true', group: g?.name ?? null, pressedKeys: after(), source: 'press' } }));
        this.awaitAnswer(wait, plan, before);
    }


    /** @param {PressedState} nextState */
    sayState(nextState) {
        const total = Number(this.button.getAttribute('data-kp-count-value'));
        const known = Number.isFinite(total) && this.button.hasAttribute('data-kp-count-value') ? total : null;
        this.say(nextState === 'true' ? this.s.toggleOn(this.labelText(), known) : this.s.toggleOff(this.labelText(), null));
    }

    /** A single group walks with the arrow keys, Home and End. @param {KeyboardEvent} event */
    arrows(event) {
        const g = toggleGroup(this.button);
        if (!g || g.mode !== 'single' || event.altKey || event.ctrlKey || event.metaKey) return;
        const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
        if (step === 0 && event.key !== 'Home' && event.key !== 'End') return;
        const usable = g.members.filter((m) => !(/** @type {any} */ (m).disabled));
        const at = usable.indexOf(g.members[g.members.indexOf(this.button)]);
        const next = event.key === 'Home' ? usable[0] : event.key === 'End' ? usable[usable.length - 1] : usable[(at + step + usable.length) % usable.length];
        if (!next) return;
        event.preventDefault();
        next.focus();
    }

    /** A single group is one stop in the Tab order: the member that is on, else the first. */
    rove() {
        const button = this.button;
        const sync = () => {
            const g = toggleGroup(button);
            if (!g) return;
            const on = g.members.find((m) => stateOf(m) === 'true') ?? g.members[0];
            for (const m of g.members) m.tabIndex = m === on ? 0 : -1;
        };
        this.observe(new MutationObserver(sync)).observe(button, { attributes: true, attributeFilter: ['aria-pressed'] });
        sync();
        this.own(() => button.removeAttribute('tabindex'));
    }

    /** `data-kp-toggle-key`: the shortcut that presses the toggle (never a bare digit, which AZERTY types as a sign). */
    registerKey() {
        const button = this.button;
        const key = button.dataset.kpToggleKey;
        if (!key) return;
        if (/^[0-9]$/.test(key)) return void console.warn(`[kp-toggle] "${key}" is a bare digit: an unshifted digit on AZERTY types & é ", so the key is not registered.`);
        button.setAttribute('aria-keyshortcuts', key);
        const off = registerShortcuts(
            button,
            [{ keys: key, what: this.s.toggleKeyWhat(this.labelText()), group: this.s.toggleKeyGroup, run: () => button.click(), when: () => !(/** @type {any} */ (button).disabled) && button.getAttribute('aria-disabled') !== 'true' }],
            { layoutGuard: 'warn' },
        );
        this.own(() => {
            off();
            button.removeAttribute('aria-keyshortcuts');
        });
    }
}

