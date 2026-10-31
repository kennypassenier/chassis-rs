// The arrival hook of js/effects.js, in a module of its own [scope-117].
//
// Fetched when the attach decided to perform an arrival, so a page whose theme asks for none never downloads it. What it
// shares with the rest of the attach arrives through `ctx`. The hook is an ArrivalHook, one per attach, and the overlay on
// screen is one ArrivalRun (arrival-run.js; closure-pattern B, js/effects-core/hook.js).

import { EffectHook } from '../effects-core/hook.js';
import { ArrivalRun } from './arrival-run.js';

/**
 * The arrival [SW2]: how the page comes on. A theme answers `--kp-arrival` on the root; `boot` is synthwave's (a diegetic line
 * counting up in the overlay the register paints, a Skip button, and the CRT switching the overlay off) and `card` is
 * phantom's [PH2] (the theme's own name as the line, a bar the register runs under it, and the overlay shoved off to the
 * left). Once per session, never under reduced motion, and every word from the dictionary [KT5].
 */
class ArrivalHook extends EffectHook {
    arrival() {
        const { doc, html, announce, arrivalRoutine, arrivalPerformed, arrivalPlays } = this.ctx;
        if (!arrivalPerformed || !doc.body) return;
        if (!arrivalPlays) {
            announce(html, 'arrival', arrivalRoutine, true);
            return;
        }
        new ArrivalRun(this.ctx, doc.body).play((undo) => this.own(undo));
    }
}

/** Make the arrival hook of one attach. @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    return new ArrivalHook(ctx).connect();
}
