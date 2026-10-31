// The headline hook of js/effects.js, in a module of its own [scope-117].
//
// Fetched the first time an element needs it, so a page that never asks for it never downloads it. What it shares with the
// rest of the attach arrives through `ctx`; the four variables every part writes are `ctx.state`. The hook is a HeadlineHook,
// one per attach (closure-pattern B, js/effects-core/hook.js); one reveal is one HeadlineRun (headline-run.js), and its
// routines are in headline-special.js and headline-text.js beside this file.

import { EffectHook } from '../effects-core/hook.js';
import { HeadlineRun } from './headline-run.js';

/** The headline: decipher, then one slice burst [TH119]. */
class HeadlineHook extends EffectHook {
    /** @param {Element} el @param {boolean} [atRest] straight to rest, as a detach does for a reveal it never started */
    headline(el, atRest = false) {
        return new HeadlineRun(this.ctx, el, atRest).play();
    }
}

/** Make the headline hook of one attach. @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    return new HeadlineHook(ctx).connect();
}
