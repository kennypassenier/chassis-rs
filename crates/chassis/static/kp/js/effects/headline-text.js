// The headline routines that rewrite the text: the word routines, the typed headline and the decipher.

import { GLYPHS, STATE, TIMINGS } from '../effects.js';
import { END_GRACE_MS } from './headline-special.js';

/** @typedef {import('./headline-run.js').HeadlineRun} HeadlineRun */

/** The routines that put every word in its own span, the register animating them one after another by `--kp-i`. */
export const WORD_ROUTINES = ['shout', 'slam', 'focus', 'resolve', 'blur'];

/** A random glyph of the decipher's alphabet. */
const randomGlyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

/** The keyframe that times one word of a routine; Shade (light)'s `blur` runs `kp-word-in`, the name its own approved demo used [SL2, S49]. @param {string} routine */
const wordKeyframe = (routine) => (routine === 'blur' ? 'kp-word-in' : routine === 'shout' ? 'kp-sig-phantom-fly' : `kp-${routine}`);

/**
 * A word routine [PH2, BR2, S48 Shade (dark) and dark]: every word in its own span with its index, the register animates
 * them one after another by `--kp-i`; the element ends as its own text. The keyframe is `kp-<routine>` and its row in TIMINGS
 * says how long one word takes; the stagger is the theme's knob.
 * @param {HeadlineRun} run
 */
export function words(run) {
    const { ctx, el, text, routine } = run;
    const { doc, cfg } = ctx;
    ctx.state.pending++;
    const parts = text.split(/(\s+)/);
    let index = 0;
    const nodes = parts.map((part) => {
        if (part === '') return null;
        if (/^\s+$/.test(part)) return doc.createTextNode(part);
        const span = doc.createElement('span');
        span.setAttribute('data-word', '');
        span.setAttribute('aria-hidden', 'true');
        span.style.setProperty('--kp-i', String(index++));
        span.textContent = part;
        return span;
    });
    el.replaceChildren(...nodes.filter((n) => n !== null));
    el.classList.add(STATE.words);
    const finish = run.once(() => el.classList.remove(STATE.words));
    ctx.later(finish, TIMINGS[wordKeyframe(routine)].durationMs + index * cfg.wordStagger + END_GRACE_MS);
}

/** One second, in ms: the decipher rate is in characters per second. */
const SECOND = 1000;

/** The ms one character takes at the decipher rate. @param {{ cps: number }} cfg */
const perCharOf = (cfg) => SECOND / Math.max(1, cfg.cps);

/** One typed headline: the glyphs typed so far, and whether its finish has run. */
class TypeRun {
    /** @param {HeadlineRun} run */
    constructor(run) {
        this.run = run;
        this.chars = [...run.text];
        this.caret = run.ctx.doc.createElement('span');
        this.typed = 0;
        this.ended = false;
        this.perChar = perCharOf(run.ctx.cfg);
        this.finish = run.once(() => {
            this.ended = true;
            run.el.classList.remove(STATE.typing);
        });
    }

    play() {
        const { run, caret } = this;
        const { ctx, el } = run;
        ctx.state.pending++;
        caret.setAttribute('data-caret', '');
        caret.setAttribute('aria-hidden', 'true');
        el.classList.add(STATE.typing);
        el.textContent = '';
        el.append(caret);
        ctx.later(() => this.step(), ctx.cfg.lead);
    }

    step() {
        if (this.ended) return;
        const { run, chars, caret } = this;
        this.typed++;
        run.el.textContent = chars.slice(0, this.typed).join('');
        if (this.typed < chars.length) {
            run.el.append(caret);
            run.ctx.later(() => this.step(), this.perChar);
        } else this.finish();
    }
}

/**
 * The terminal headline [TM2]: typed one glyph at a time at the decipher rate, a block caret riding the last one; the caret
 * leaves with the last glyph and the element rests as its text.
 * @param {HeadlineRun} run
 */
export function typeOut(run) {
    new TypeRun(run).play();
}

/** One glyph span of the decipher: the letter's noise, or a space as it is. @param {Document} doc @param {string} ch */
function glyphSpan(doc, ch) {
    const span = doc.createElement('span');
    span.setAttribute('data-glyph', '');
    span.setAttribute('aria-hidden', 'true');
    if (/\s/.test(ch)) span.textContent = ch;
    else {
        span.textContent = randomGlyph();
        span.classList.add(STATE.noise);
    }
    return span;
}

/** One deciphering headline: its glyph spans, when it started, the frame asked for, and whether its finish has run. */
class DecipherRun {
    /** @param {HeadlineRun} run */
    constructor(run) {
        this.run = run;
        this.chars = [...run.text];
        this.spans = this.chars.map((ch) => glyphSpan(run.ctx.doc, ch));
        this.perChar = perCharOf(run.ctx.cfg);
        this.start = 0;
        this.finished = false;
        this.id = 0;
    }

    play() {
        const { ctx, el } = this.run;
        ctx.state.pending++;
        el.replaceChildren(...this.spans);
        ctx.finishers.push(() => this.finish());
        this.id = this.schedule();
    }

    /** The glyphs have settled, or the motion was cut short: the rest state, then one slice burst. */
    finish() {
        if (this.finished) return;
        this.finished = true;
        const { run } = this;
        const { ctx, el } = run;
        run.rest(false);
        el.classList.add(STATE.glitching);
        const off = () => el.classList.remove(STATE.glitching);
        el.addEventListener('animationend', off, { once: true });
        // No animation (a quiet register, or reduced motion switched on mid-run): the class comes off on its own.
        ctx.later(off, TIMINGS['kp-slice-1'].durationMs + END_GRACE_MS);
        ctx.state.pending--;
        ctx.done();
    }

    schedule() {
        const { view, frames } = this.run.ctx;
        const next = view ? view.requestAnimationFrame((/** @type {number} */ now) => this.tick(now)) : 0;
        frames.add(next);
        return next;
    }

    /** @param {number} now */
    tick(now) {
        const { state, frames, cfg } = this.run.ctx;
        frames.delete(this.id);
        if (state.detached || this.finished) return;
        if (this.start === 0) this.start = now;
        if (settleGlyphs(this.spans, this.chars, now - this.start, cfg, this.perChar)) this.finish();
        else this.id = this.schedule();
    }
}

/**
 * The default headline: every glyph starts as noise and settles into its letter at the decipher rate, then one slice burst.
 * @param {HeadlineRun} run
 */
export function decipher(run) {
    new DecipherRun(run).play();
}

/**
 * Settle the glyphs whose turn has come, and shuffle the noise of the rest.
 * @param {HTMLElement[]} spans @param {string[]} chars @param {number} t ms since the start
 * @param {{ lead: number, swap: number }} cfg @param {number} perChar
 * @returns {boolean} true when every glyph has settled
 */
function settleGlyphs(spans, chars, t, cfg, perChar) {
    let all = true;
    spans.forEach((span, i) => {
        const ch = chars[i] ?? '';
        if (/\s/.test(ch)) return;
        if (t > cfg.lead + i * perChar) {
            if (span.classList.contains(STATE.noise)) {
                span.textContent = ch;
                span.classList.remove(STATE.noise);
            }
        } else {
            all = false;
            if (Math.random() < cfg.swap) span.textContent = randomGlyph();
        }
    });
    return all;
}
