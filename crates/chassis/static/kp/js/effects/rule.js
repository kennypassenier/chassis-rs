// The rule hook of js/effects.js, in a module of its own [scope-117].
//
// Fetched the first time an element needs it, so a page that never asks for it never downloads it. What it shares with the
// rest of the attach arrives through `ctx`; the four variables every part writes are `ctx.state`. The hook is a RuleHook,
// one per attach (closure-pattern B, js/effects-core/hook.js).

import { STATE } from '../effects.js';
import { EffectHook } from '../effects-core/hook.js';

/** The rule: drawn when its heading enters the viewport [TH122]. */
class RuleHook extends EffectHook {
    /** @param {Element} el */
    rule(el) {
        const { state, view, reduced, cfg, finishers, routineOf, seen } = this.ctx;
        const routine = routineOf(el, 'rule');
        if (routine === '' || reduced() || seen(el, 'rule') || !view || typeof view.IntersectionObserver !== 'function') {
            this.draw(el, routine, true);
            return;
        }
        state.pending++;
        finishers.push(() => this.draw(el, routine, false));
        // One watcher per attach, made by the first rule that waits; its callback announces with that rule's routine, as before.
        state.io ??= new view.IntersectionObserver((/** @type {IntersectionObserverEntry[]} */ entries) => this.onSeen(entries, routine), {
            threshold: cfg.threshold,
        });
        state.io?.observe(el);
    }

    /** @param {Element} el @param {string} routine @param {boolean} skipped */
    draw(el, routine, skipped) {
        el.classList.add(STATE.in);
        this.ctx.announce(el, 'rule', routine, skipped);
    }

    /** The rules that entered the viewport draw, once each. @param {IntersectionObserverEntry[]} entries @param {string} routine */
    onSeen(entries, routine) {
        const { state, announce, done } = this.ctx;
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            state.io?.unobserve(entry.target);
            entry.target.classList.add(STATE.in);
            announce(entry.target, 'rule', routine, false);
            state.pending--;
            done();
        }
    }
}

/** Make the rule hook of one attach. @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    return new RuleHook(ctx).connect();
}
