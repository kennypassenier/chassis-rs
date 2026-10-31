// The emphasis hook of js/effects.js, in a module of its own [scope-117].
//
// Fetched the first time an element needs it, so a page that never asks for it never downloads it. What it shares with the
// rest of the attach arrives through `ctx`; the four variables every part writes are `ctx.state`. The hook is an
// EmphasisHook, one per attach (closure-pattern B, js/effects-core/hook.js).

import { HOOKS, STATE, REVEAL_STATE, TEXT_ATTRIBUTE } from '../effects.js';
import { EffectHook } from '../effects-core/hook.js';

/**
 * A register whose plate drags the words in with it reads them from here [S49, A11, retro]: the element's own text, copied
 * to the same attribute a headline carries, never authored copy.
 * @param {Element[]} marks
 */
function copyText(marks) {
    for (const mark of marks) if (!mark.hasAttribute(TEXT_ATTRIBUTE)) mark.setAttribute(TEXT_ATTRIBUTE, mark.textContent ?? '');
}

/** @param {Element[]} marks */
function clearAll(marks) {
    for (const mark of marks) mark.classList.add(STATE.cleared);
}

/** Emphasis: marks clear themselves, or on a trigger [TH120]. */
class EmphasisHook extends EffectHook {
    /** @param {Element[]} marks @param {number} first @param {number} step @param {Element} on @param {string} routine */
    clearInSteps(marks, first, step, on, routine) {
        const { state, finishers, done, announce, later } = this.ctx;
        if (marks.length === 0) return;
        state.pending++;
        finishers.push(() => clearAll(marks));
        marks.forEach((mark, i) => {
            later(() => {
                mark.classList.add(STATE.cleared);
                if (i !== marks.length - 1) return;
                state.pending--;
                announce(on, 'emphasis', routine, false);
                done();
            }, first + i * step);
        });
    }

    /** @param {Element} container an element carrying data-kp-reveal="emphasis" */
    emphasis(container) {
        const { reduced, cfg, announce, routineOf, seen } = this.ctx;
        const marks = [...container.querySelectorAll('mark')];
        copyText(marks);
        // The emphasis knob carries the register's own vocabulary (plate, wash, redact, ignite), because the module does the
        // same thing whatever it is called: cover the marks, clear them on the trigger. Only a name the module branches on can
        // be wrong, which is why the headline knob is checked and this one is not.
        const routine = routineOf(container, 'emphasis');
        const trigger = container.querySelector(`[${HOOKS.revealTrigger}]`);
        // A container with nothing to clear (a button that carries the hook for its own reveal) touches neither the marks nor the memo.
        if (marks.length === 0) {
            announce(container, 'emphasis', routine, true);
            return;
        }
        if (routine === '' || reduced()) {
            this.atRest(marks, container, routine);
            if (trigger) this.wireTrigger(trigger, marks, container, routine);
            return;
        }
        if (trigger) {
            this.arm(trigger, marks, container, routine);
            return;
        }
        if (seen(container, 'emphasis')) {
            this.atRest(marks, container, routine);
            return;
        }
        this.clearInSteps(marks, cfg.delay, cfg.stagger, container, routine);
    }

    /** @param {Element[]} marks @param {Element} container @param {string} routine */
    atRest(marks, container, routine) {
        clearAll(marks);
        this.ctx.announce(container, 'emphasis', routine, true);
    }

    /**
     * The dossier: the marks stay covered until the trigger opens the file; the register staggers the lift. A second press
     * closes it. Armed is a state, and it was the one nobody could see: nothing has happened yet, so nothing is announced
     * [TF2], but it is readable, or "waiting for a click" and "never wired at all" look identical from outside.
     * @param {Element} trigger @param {Element[]} marks @param {Element} container @param {string} routine
     */
    arm(trigger, marks, container, routine) {
        this.wireTrigger(trigger, marks, container, routine);
        trigger.setAttribute('aria-pressed', 'false');
        container.setAttribute(REVEAL_STATE, 'armed');
    }

    /** @param {Element} trigger @param {Element[]} marks @param {Element} container @param {string} routine */
    wireTrigger(trigger, marks, container, routine) {
        this.listen(trigger, 'click', () => this.toggle(trigger, marks, container, routine));
    }

    /** A press on the trigger opens or closes the file. @param {Element} trigger @param {Element[]} marks @param {Element} container @param {string} routine */
    toggle(trigger, marks, container, routine) {
        const open = trigger.getAttribute('aria-pressed') !== 'true';
        trigger.setAttribute('aria-pressed', String(open));
        for (const mark of marks) mark.classList.toggle(STATE.cleared, open);
        // The stamp a theme changes when the file opens [S49, A11]: the second word is the page's (data-kp-label-open), and
        // the register swaps to it while this attribute is set.
        container.toggleAttribute(HOOKS.openState, open);
        // announce() writes 'played' here, which is right: the trigger is what makes it play. Closing it again is a play too;
        // the marks move either way [TF2].
        this.ctx.announce(container, 'emphasis', routine, false);
    }

    /** The marks outside any emphasis container clear on load, one after another. @param {ParentNode} scope */
    looseMarks(scope) {
        const { reduced, cfg, announce, routineOf, seen, started } = this.ctx;
        const marks = [...scope.querySelectorAll('mark')].filter((m) => m.closest(`[${HOOKS.reveal}='emphasis']`) === null && !started.has(m));
        if (marks.length === 0) return;
        copyText(marks);
        for (const m of marks) started.add(m);
        const first = marks[0];
        const routine = routineOf(first, 'emphasis');
        if (routine === '' || reduced() || seen(first, 'emphasis')) {
            clearAll(marks);
            announce(first, 'emphasis', routine, true);
            return;
        }
        this.clearInSteps(marks, cfg.delay, cfg.stagger, first, routine);
    }
}

/** Make the emphasis hook of one attach. @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    return new EmphasisHook(ctx).connect();
}
