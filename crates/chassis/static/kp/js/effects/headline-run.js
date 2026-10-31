// One headline reveal of js/effects/headline.js: what every routine shares (the text, the rest state, the finish that
// ends once) and the routines that are one class waiting for one keyframe.

import { HEADLINE_ROUTINES, ROUTINES, STATE, TEXT_ATTRIBUTE, TIMINGS } from '../effects.js';
import { END_GRACE_MS, arrive, draw, ink, tracking } from './headline-special.js';
import { decipher, typeOut, words, WORD_ROUTINES } from './headline-text.js';

/** @typedef {import('../effects.js').EffectsContext} EffectsContext */

/**
 * The routines that add one class and finish when the register's keyframe ends, or by the table's duration when no animation
 * runs: `{ state class, keyframe }`.
 * @type {Record<string, { cls: string, keyframe: string }>}
 */
const TIMED_CLASS = {
    // The nostromo headline [S48, LIFT_PLAN nostromo row]: the text stays whole throughout — no glyph or word is ever touched —
    // under a clip-path the register sweeps open top-down; the class runs it, then the element rests.
    popdown: { cls: STATE.popping, keyframe: 'kp-popdown' },
    // The solstice headline [S49, A1]: the text is whole and solid under a mix-blend-mode overlay the register paints; the
    // class runs the overlay's one wipe, then the element rests.
    calibrate: { cls: STATE.calibrating, keyframe: 'kp-cal-slide' },
    // The mono headline [S48, LIFT_PLAN row 6]: the text stays whole, never split into words or glyphs; the register sweeps a
    // hard-edge mask across it once, left to right — rauno.me's verticalFade, adapted from opacity to mask-position so nothing
    // ever flashes. The class arms the register's own animation.
    wipe: { cls: STATE.revealed, keyframe: 'kp-wipe' },
    // The Lapis headline [S48, LIFT_PLAN row 6]: the text is whole and already gold; the class runs one clip-path wipe left to
    // right (the register's `kp-burnish` keyframe), then the element rests — same shape as `dissolve`, a different keyframe,
    // because the demo's mechanism is neither a dither nor a per-glyph type [S49].
    gild: { cls: STATE.gilding, keyframe: 'kp-burnish' },
    // The grotesk headline [S49, LIFT_PLAN row 12]: the text is whole under a blur+brightness the register paints; the class
    // runs the one-shot optical resolve, then the element rests. Its own routine name and keyframe, distinct from the `focus`
    // word-stagger group and `kp-focus` Shade (dark) already owns.
    sharpen: { cls: STATE.sharpening, keyframe: 'kp-sharpen-in' },
    // The light headline [S48, LIFT_PLAN, A1]: the text is whole the entire time — no noise, no dither, no per-word stagger —
    // and the register opens a rounded clip window around it once.
    clip: { cls: STATE.revealing, keyframe: 'kp-clip-reveal' },
    // The pastel headline [S48, LIFT_PLAN row 6]: the text is whole; the register's ::before duplicate (the second-ink layer,
    // already there at its rest offset for a no-script page) springs from a wide mis-registration into that rest position once.
    overprint: { cls: STATE.registering, keyframe: 'kp-registration' },
    // The Retro headline (theme removed 2026-10-09) [RT2]: the text is whole under a dither the register paints; the class runs
    // the dither's clearing, then the element rests.
    dissolve: { cls: STATE.dissolving, keyframe: 'kp-dither-clear' },
};

export class HeadlineRun {
    /** @param {EffectsContext} ctx @param {Element} el @param {boolean} atRest straight to rest, as a detach does for a reveal it never started */
    constructor(ctx, el, atRest) {
        this.ctx = ctx;
        this.el = el;
        this.atRest = atRest;
        this.text = el.textContent ?? '';
        this.routine = '';
    }

    /** The headline: decipher, then one slice burst [TH119], or the routine the theme asked for. */
    play() {
        const { ctx, el } = this;
        el.setAttribute(TEXT_ATTRIBUTE, this.text);
        if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', this.text);
        const asked = ctx.routineOf(el, 'headline');
        // A name no routine answers to is reported and then treated as
        // silence [G6]: the chain below ends at decipher, so a typo in a
        // register used to give that theme glyph noise over its headline
        // rather than the rest it asked for.
        this.routine = asked === '' || HEADLINE_ROUTINES.includes(asked) ? asked : ctx.reportUnknownRoutine(el, ROUTINES.headline, asked, HEADLINE_ROUTINES);
        if (this.atRest || this.routine === '' || ctx.reduced() || ctx.seen(el, 'headline')) {
            this.rest(true);
            return;
        }
        this.perform();
    }

    /** Hand the element to the routine it asked for. */
    perform() {
        const { routine } = this;
        const timed = TIMED_CLASS[routine];
        if (timed) this.timedClass(timed.cls, timed.keyframe);
        else if (routine === 'tracking') tracking(this);
        else if (routine === 'draw') draw(this);
        else if (routine === 'arrive') arrive(this);
        else if (routine === 'ink') ink(this);
        else if (WORD_ROUTINES.includes(routine)) words(this);
        else if (routine === 'type') typeOut(this);
        else decipher(this);
    }

    /** The element ends as its own text, announced as played or skipped. @param {boolean} skipped */
    rest(skipped) {
        const { ctx, el } = this;
        el.textContent = this.text;
        el.classList.add(STATE.deciphered);
        ctx.announce(el, 'headline', this.routine, skipped);
    }

    /**
     * A finish that runs once: `undo`, then the rest state, then one less pending reveal. It is registered with the finishers, so
     * a detach or a switch to reduced motion ends the reveal at rest.
     * @param {() => void} [undo]
     */
    once(undo = () => {}) {
        const { ctx } = this;
        let ended = false;
        const finish = () => {
            if (ended) return;
            ended = true;
            undo();
            this.rest(false);
            ctx.state.pending--;
            ctx.done();
        };
        ctx.finishers.push(finish);
        return finish;
    }

    /** Finish when an event of the element matches. @param {string} type @param {() => void} finish @param {(event: Event) => boolean} matching */
    whenHeard(type, finish, matching) {
        const { el } = this;
        const onEnd = (/** @type {Event} */ e) => {
            if (!matching(e)) return;
            el.removeEventListener(type, onEnd);
            finish();
        };
        el.addEventListener(type, onEnd);
    }

    /** One class the register animates by `keyframe`; without an animation the class comes off by the table's duration. @param {string} cls @param {string} keyframe */
    timedClass(cls, keyframe) {
        const { ctx, el } = this;
        ctx.state.pending++;
        el.classList.add(cls);
        const finish = this.once(() => el.classList.remove(cls));
        this.whenHeard('animationend', finish, (e) => /** @type {AnimationEvent} */ (e).animationName === keyframe);
        ctx.later(finish, TIMINGS[keyframe].durationMs + END_GRACE_MS);
    }
}
