// One ticking number: the count from the number shown to the number written, on the page's frames, ending on the exact text.

import { motionAllowed } from '../calm.js';
import { EASE_POWER, MAX_STEPS, TICK_EVENT, TICK_KNOB, TICK_MS } from './values.js';
import { localeOf, numberNode, parseTick } from './parse.js';

/** @typedef {import('../tick.js').TickParse} TickParse */

/** @param {Element} el */
const reduced = (el) => !motionAllowed(el);

/** The state of one number: its frame, the text last written, the value shown, and the end of a tick that is running. */
export class Ticker {
    /** @param {Element} el */
    constructor(el) {
        this.el = el;
        /** The animation frame of the running tick, or 0. */
        this.frame = 0;
        /** The text this module last wrote, to tell its own writes from anyone else's. */
        this.written = '';
        /** The number shown now (mid-tick, the value in between), or null. @type {number | null} */
        this.shown = null;
        /** Lands the running tick at once; undefined when none is running. @type {(() => void) | undefined} */
        this.pending = undefined;
    }

    /** Take the number the element shows as the one shown, and mark it done. */
    adopt() {
        const parsed = parseTick(numberNode(this.el)?.nodeValue ?? '', localeOf(this.el));
        this.written = numberNode(this.el)?.nodeValue ?? '';
        this.shown = parsed?.value ?? null;
        this.el.setAttribute('data-kp-tick-state', 'done');
    }

    /** Land a tick that is running; the number ends on its target. */
    stop() {
        const view = this.el.ownerDocument.defaultView;
        if (this.frame) view?.cancelAnimationFrame(this.frame);
        this.pending?.();
    }

    /** @param {string} value */
    write(value) {
        this.written = value;
        const own = numberNode(this.el);
        if (own) own.nodeValue = value;
        else this.el.textContent = value;
    }

    /** End on the written text exactly and say so. @param {string} target @param {TickParse | null} parsed */
    land(target, parsed) {
        const { el } = this;
        this.frame = 0;
        this.pending = undefined;
        this.write(target);
        this.shown = parsed?.value ?? null;
        el.removeAttribute('aria-busy');
        el.setAttribute('data-kp-tick-state', 'done');
        el.dispatchEvent(new CustomEvent(TICK_EVENT, { bubbles: true, detail: { value: parsed?.value ?? null } }));
    }

    /** How long a tick takes: the call's, else the element's `--kp-tick`, else the default. @param {Window | null} view @param {number | undefined} duration */
    lengthOf(view, duration) {
        const asked = view?.getComputedStyle(this.el).getPropertyValue(TICK_KNOB).trim() ?? '';
        return duration ?? (asked === '' || !Number.isFinite(Number(asked)) ? TICK_MS : Number(asked));
    }

    /**
     * Count the element from the number it shows to the number in `text`, and end on
     * `text` exactly. Without a number in either, `text` is written at once.
     * @param {string} [text]
     * @param {{ from?: number, duration?: number }} [options]
     */
    tickTo(text, { from, duration } = {}) {
        const { el } = this;
        const view = el.ownerDocument.defaultView;
        if (this.frame) view?.cancelAnimationFrame(this.frame);
        this.frame = 0;
        const node = numberNode(el);
        const target = text ?? node?.nodeValue ?? el.textContent ?? '';
        const parsed = parseTick(target, localeOf(el));
        const start = from ?? this.shown;
        const ms = this.lengthOf(view, duration);
        if (!parsed || start == null || start === parsed.value || ms <= 0 || reduced(el) || !view) {
            this.land(target, parsed);
            return;
        }
        this.run(view, { target, parsed, start, ms });
    }

    /**
     * The running tick: a frame at a time along an ease-out curve, landing on the target.
     * @param {Window} view
     * @param {{ target: string, parsed: TickParse, start: number, ms: number }} tick
     */
    run(view, { target, parsed, start, ms }) {
        const { el } = this;
        const unit = 10 ** -parsed.decimals;
        const steps = Math.abs(parsed.value - start) / unit;
        const begin = steps > MAX_STEPS ? parsed.value - Math.sign(parsed.value - start) * MAX_STEPS * unit : start;
        el.setAttribute('aria-busy', 'true');
        el.setAttribute('data-kp-tick-state', 'running');
        this.pending = () => this.land(target, parsed);
        const t0 = view.performance.now();
        const step = () => {
            const t = Math.min(1, (view.performance.now() - t0) / ms);
            if (t >= 1 || reduced(el)) {
                this.land(target, parsed);
                return;
            }
            const eased = 1 - (1 - t) ** EASE_POWER;
            const value = begin + (parsed.value - begin) * eased;
            this.shown = value;
            this.write(parsed.render(value));
            this.frame = view.requestAnimationFrame(step);
        };
        this.frame = view.requestAnimationFrame(step);
    }
}

/** The ticker of each number, made at the first look. @type {WeakMap<Element, Ticker>} */
const tickers = new WeakMap();

/** The ticker of an element, if it has one. @param {Element} el */
export const knownTicker = (el) => tickers.get(el);

/** The ticker of an element, made when it has none. @param {Element} el @returns {Ticker} */
export function tickerOf(el) {
    let ticker = tickers.get(el);
    if (!ticker) tickers.set(el, (ticker = new Ticker(el)));
    return ticker;
}

/**
 * Count `el` from the number it shows to the number in `text`, and end on
 * `text` exactly. Without a number in either, `text` is written at once.
 * @param {Element} el
 * @param {string} [text]  the new text; left out, the element's own text is the target (it was just written)
 * @param {{ from?: number, duration?: number }} [options]  `from` the number to start at (default the one last shown)
 */
export function tickTo(el, text, options) {
    tickerOf(el).tickTo(text, options);
}
