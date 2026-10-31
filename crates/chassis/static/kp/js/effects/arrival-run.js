// One arrival of js/effects/arrival.js on screen: the overlay, its line, its bar and Skip, and the end that runs once.

import { STATE, ARRIVAL, KNOBS, BOOT_PROGRESS, TIMINGS } from '../effects.js';
import { getStrings } from '../strings.js';

/** @typedef {import('../effects.js').EffectsContext} EffectsContext */

/**
 * The cadence of the sequence before `--kp-arrival-rate` scales it (ms): a percent step, the lines mode's line, the pause on
 * 100% and on the last line, and the grace after the off animation's own duration.
 */
const PERCENT_STEP = 110;
const LINE_STEP = 190;
const PERCENT_HOLD = 220;
const LINE_HOLD = 320;
const OFF_GRACE = 50;
/** A percent step adds at least this much, plus up to PERCENT_JITTER - 1 more. */
const PERCENT_MIN = 7;
const PERCENT_JITTER = 9;
/** The memory test's total when the theme declares none. */
const DEFAULT_COUNT = 640;
const FULL = 100;

export class ArrivalRun {
    /** @param {EffectsContext} ctx @param {HTMLElement} body */
    constructor(ctx, body) {
        this.ctx = ctx;
        this.body = body;
        const { doc, html, rootStyle } = ctx;
        const words = getStrings();
        this.routine = ctx.arrivalRoutine;
        this.card = this.routine === 'card';
        this.theme = html.getAttribute('data-theme') ?? '';
        // The words of this theme's own world [scope-84]: a theme with an entry reads its own, and a theme without one reads
        // the neutral default, never another theme's.
        const own = words.arrivalWordsByTheme?.[this.theme] ?? {};
        this.said = { line: own.line ?? words.arrivalLine, progress: own.progress ?? words.arrivalProgress, ready: own.ready ?? words.arrivalReady };
        /** The POST lines of a theme whose own boot is one [S49, A11], or null. @type {string[] | null} */
        this.lines = words.arrivalLinesByTheme?.[this.theme] ?? null;
        this.total = Number(rootStyle?.getPropertyValue(KNOBS.arrivalCount)) || DEFAULT_COUNT;
        const askedRate = parseFloat(rootStyle?.getPropertyValue(KNOBS.arrivalRate) ?? '');
        this.rate = Number.isFinite(askedRate) && askedRate > 0 ? askedRate : 1;
        this.overlay = doc.createElement('div');
        this.line = doc.createElement('pre');
        this.skip = doc.createElement('button');
        this.skipLabel = words.arrivalSkip;
        // The segmented bar retro's POST counts along [S49, A11]: built only when the theme asks for one, painted by its register.
        this.bar = rootStyle?.getPropertyValue(KNOBS.arrivalBar).trim() === 'block' ? doc.createElement('div') : null;
        this.ended = false;
        this.removed = false;
        this.pct = 0;
        this.shown = 0;
    }

    /** Put the overlay up and run it. @param {(undo: () => void) => void} own registers the take-down with the attach */
    play(own) {
        const { ctx } = this;
        this.build();
        this.pace();
        ctx.state.pending++;
        this.wireEnds();
        ctx.finishers.push(() => this.end());
        own(() => {
            this.overlay.remove();
            if (!this.removed) this.release();
        });
        if (this.card) {
            this.line.textContent = this.theme;
            this.paced(() => this.end(), TIMINGS['kp-bar-run'].durationMs + ctx.cfg.cardHold);
        } else if (this.lines && this.lines.length > 0) this.lineStep();
        else this.step();
    }

    build() {
        const { overlay, line, skip, bar } = this;
        overlay.className = ARRIVAL.root;
        line.className = ARRIVAL.line;
        line.setAttribute('aria-live', 'polite');
        skip.type = 'button';
        skip.className = ARRIVAL.skip;
        skip.textContent = this.skipLabel;
        if (bar) {
            bar.className = ARRIVAL.bar;
            bar.setAttribute('aria-hidden', 'true');
            bar.style.setProperty(BOOT_PROGRESS, '0');
        }
        overlay.append(line, ...(bar ? [bar] : []), skip);
        this.body.append(overlay);
    }

    /**
     * Skip ends it, and so does a click anywhere on the overlay (CP1, Kenny 2026-09-09): an overlay that covers the whole
     * viewport and answers one 90-pixel button is indistinguishable from a page that has stopped working. A theme that wants
     * the old behaviour sets `--kp-arrival-dismiss: skip-only`.
     */
    wireEnds() {
        const end = () => this.end();
        this.skip.addEventListener('click', end);
        if (this.ctx.rootStyle?.getPropertyValue(KNOBS.arrivalDismiss).trim() !== 'skip-only') this.overlay.addEventListener('click', end);
    }

    /** @param {() => void} fn @param {number} ms */
    paced(fn, ms) {
        this.ctx.later(fn, ms / this.rate);
    }

    /** The overlay's CSS animations at the same rate, read after a style flush so an animation a class has just started is in the list. */
    pace() {
        const { overlay, rate } = this;
        if (rate === 1 || typeof overlay.getAnimations !== 'function') return;
        void this.ctx.view?.getComputedStyle(overlay).opacity;
        for (const animation of overlay.getAnimations({ subtree: true })) animation.playbackRate = rate;
    }

    /** The headlines held for this overlay start once it has gone [scope-86]: on its own end, on Skip, on a click and at detach. */
    release() {
        const { doc, arrivalsOnScreen } = this.ctx;
        const held = arrivalsOnScreen.get(doc);
        arrivalsOnScreen.delete(doc);
        if (held) for (const go of [...held]) go();
    }

    remove() {
        if (this.removed) return;
        this.removed = true;
        const { ctx } = this;
        this.overlay.remove();
        ctx.announce(ctx.html, 'arrival', this.routine, false);
        ctx.state.pending--;
        this.release();
        ctx.done();
    }

    end() {
        if (this.ended) return;
        this.ended = true;
        if (this.ctx.reduced()) {
            this.remove();
            return;
        }
        this.overlay.classList.add(STATE.off);
        this.pace();
        const remove = () => this.remove();
        this.overlay.addEventListener('animationend', remove, { once: true });
        this.paced(remove, TIMINGS[this.card ? 'kp-load-out' : 'kp-crt-off'].durationMs + OFF_GRACE);
    }

    /** The percentage mode: a line counting up to 100%. */
    step() {
        if (this.ended) return;
        const { said } = this;
        this.pct = Math.min(FULL, this.pct + PERCENT_MIN + Math.floor(Math.random() * PERCENT_JITTER));
        const done = this.pct === FULL;
        this.line.textContent = [said.line, `${said.progress} ${this.pct}%`.trim(), done ? said.ready : ''].filter(Boolean).join('\n');
        this.bar?.style.setProperty(BOOT_PROGRESS, String(this.pct / FULL));
        if (done) this.paced(() => this.end(), PERCENT_HOLD);
        else this.paced(() => this.step(), PERCENT_STEP);
    }

    /**
     * The lines mode [S49, A11]: a theme whose own boot is a POST shows its lines one after another, cumulatively, rather than a
     * percentage. The words are the dictionary's (KT5), and a `{count}` counts up to the theme's declared total the way a
     * memory test does.
     */
    lineStep() {
        const { lines, total } = this;
        if (this.ended || !lines) return;
        const shown = ++this.shown;
        this.line.textContent = lines
            .slice(0, shown)
            .map((text, index) => text.replace('{count}', String(index === shown - 1 ? Math.round((total * shown) / lines.length) : total)))
            .join('\n');
        this.bar?.style.setProperty(BOOT_PROGRESS, String(shown / lines.length));
        if (shown === lines.length) this.paced(() => this.end(), LINE_HOLD);
        else this.paced(() => this.lineStep(), LINE_STEP);
    }
}
