// The emphasis hook of js/effects.js, in a module of its own [scope-117].
//
// Cut out of attachEffects() line for line, so a page that never asks for it
// never downloads it: js/effects.js fetches this the first time an element or
// a theme knob needs it. What it shared with the rest of the closure arrives
// through `ctx`; the four variables every part writes are `ctx.state`.

import { HOOKS, STATE, REVEAL_STATE, TEXT_ATTRIBUTE } from '../effects.js';

/** @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    const { state, reduced, cfg, cleanups, finishers, done, announce, later, routineOf, seen, started } = ctx;
    // ── Emphasis: marks clear themselves, or on a trigger [TH120] ──────
    /** @param {Element[]} marks @param {number} first @param {number} step @param {Element} on @param {string} routine */
    const clearInSteps = (marks, first, step, on, routine) => {
        if (marks.length === 0) return;
        state.pending++;
        finishers.push(() => {
            for (const mark of marks) mark.classList.add(STATE.cleared);
        });
        marks.forEach((mark, i) => {
            later(
                () => {
                    mark.classList.add(STATE.cleared);
                    if (i === marks.length - 1) {
                        state.pending--;
                        announce(on, 'emphasis', routine, false);
                        done();
                    }
                },
                first + i * step,
            );
        });
    };
    /** @param {Element} container an element carrying data-kp-reveal="emphasis" */
    const emphasis = (container) => {
        const marks = [...container.querySelectorAll('mark')];
        // A register whose plate drags the words in with it reads them
        // from here [S49, A11, retro]: the element's own text, copied to
        // the same attribute a headline carries, never authored copy.
        for (const mark of marks) if (!mark.hasAttribute(TEXT_ATTRIBUTE)) mark.setAttribute(TEXT_ATTRIBUTE, mark.textContent ?? '');
        // The emphasis knob carries the register's own vocabulary — plate,
        // wash, redact, ignite — because the module does the same thing
        // whatever it is called: cover the marks, clear them on the
        // trigger. Only a name the module branches on can be wrong, which
        // is why the headline knob is checked and this one is not.
        const routine = routineOf(container, 'emphasis');
        const trigger = container.querySelector(`[${HOOKS.revealTrigger}]`);
        // A container with nothing to clear (a button that carries the hook
        // for its own reveal) touches neither the marks nor the memo.
        if (marks.length === 0) {
            announce(container, 'emphasis', routine, true);
            return;
        }
        const atRest = () => {
            for (const mark of marks) mark.classList.add(STATE.cleared);
            announce(container, 'emphasis', routine, true);
        };
        if (routine === '' || reduced()) {
            atRest();
            if (trigger) wireTrigger(trigger, marks, container, routine);
            return;
        }
        if (trigger) {
            // The dossier: the marks stay covered until the trigger opens the
            // file; the register staggers the lift. A second press closes it.
            wireTrigger(trigger, marks, container, routine);
            trigger.setAttribute('aria-pressed', 'false');
            // Armed is a state, and it was the one nobody could see: this
            // branch announces nothing, because nothing has happened yet
            // [TF2]. It still has to be readable, or "waiting for a click"
            // and "never wired at all" look identical from outside.
            container.setAttribute(REVEAL_STATE, 'armed');
            return;
        }
        if (seen(container, 'emphasis')) {
            atRest();
            return;
        }
        clearInSteps(marks, cfg.delay, cfg.stagger, container, routine);
    };
    /** @param {Element} trigger @param {Element[]} marks @param {Element} container @param {string} routine */
    const wireTrigger = (trigger, marks, container, routine) => {
        const onClick = () => {
            const open = trigger.getAttribute('aria-pressed') !== 'true';
            trigger.setAttribute('aria-pressed', String(open));
            for (const mark of marks) mark.classList.toggle(STATE.cleared, open);
            // The stamp a theme changes when the file opens [S49, A11]:
            // the second word is the page's (data-kp-label-open), and the
            // register swaps to it while this attribute is set.
            container.toggleAttribute(HOOKS.openState, open);
            // announce() writes 'played' here, which is right: the trigger
            // is what makes it play. Closing it again is a play too — the
            // marks move either way [TF2].
            announce(container, 'emphasis', routine, false);
        };
        trigger.addEventListener('click', onClick);
        cleanups.push(() => trigger.removeEventListener('click', onClick));
    };
    /** The marks outside any emphasis container clear on load, one after another. */
    /** @param {ParentNode} scope */
    const looseMarks = (scope) => {
        const marks = [...scope.querySelectorAll('mark')].filter((m) => m.closest(`[${HOOKS.reveal}='emphasis']`) === null && !started.has(m));
        if (marks.length === 0) return;
        for (const mark of marks) if (!mark.hasAttribute(TEXT_ATTRIBUTE)) mark.setAttribute(TEXT_ATTRIBUTE, mark.textContent ?? '');
        for (const m of marks) started.add(m);
        const first = marks[0];
        const routine = routineOf(first, 'emphasis');
        if (routine === '' || reduced() || seen(first, 'emphasis')) {
            for (const mark of marks) mark.classList.add(STATE.cleared);
            announce(first, 'emphasis', routine, true);
            return;
        }
        clearInSteps(marks, cfg.delay, cfg.stagger, first, routine);
    };
    return { clearInSteps, emphasis, wireTrigger, looseMarks };
}
