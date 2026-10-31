// The count hook of js/effects.js, in a module of its own [scope-117].
//
// Fetched the first time an element needs it, so a page that never asks for it never downloads it. What it shares with the
// rest of the attach arrives through `ctx`. The hook is a CountHook, one per attach, and each counting number is one CountRun
// (closure-pattern B, js/effects-core/hook.js).

import { HOOKS, COUNT_KNOB, COUNT_FROM_KNOB } from '../effects.js';
import { EffectHook } from '../effects-core/hook.js';

/** How long a count runs when the theme says nothing (ms), and the number formatted to learn a locale's separators. */
const DEFAULT_DURATION = 900;
const SAMPLE = 12345.6;
/** The first run of digits, with whatever separators sit inside it. */
const DIGITS = /-?[\d][\d\s.,  ]*/;

/**
 * A knob read as a number: an empty string is unset, and `0` is a choice. `|| 900` would read a deliberate `0` as "unset"
 * and count anyway; the absence of a value is not the value.
 * @param {CSSStyleDeclaration | undefined} style @param {string} name @param {number} fallback
 */
function numberKnob(style, name, fallback) {
    const asked = style?.getPropertyValue(name).trim() ?? '';
    return asked === '' || !Number.isFinite(Number(asked)) ? fallback : Number(asked);
}

/**
 * Which character groups and which one is the decimal point is NOT decidable from the string: `1.204` is one thousand two
 * hundred and four in Dutch and one-point-two-oh-four in English. So it is not guessed: the page's own language decides, the
 * way every other locale-shaped thing in this package does, and a page that says nothing gets the browser's default locale.
 * @param {Element} el @param {Document} doc
 */
function separatorsOf(el, doc) {
    const locale = /** @type {HTMLElement | null} */ (el.closest('[lang]'))?.lang || doc?.documentElement?.lang || undefined;
    const parts = new Intl.NumberFormat(locale).formatToParts(SAMPLE);
    return {
        group: parts.find((part) => part.type === 'group')?.value ?? '',
        decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
    };
}

/**
 * One number that counts up to what it already says [feat-count-1]. The authored text is the oracle, the way the headline's
 * is: the element already reads `1 118 204,75` or `€ 1.204` or `98%`, and this reads the number out of that, counts to it,
 * and writes the same string back. It never formats a number of its own, so the page's own locale is preserved.
 */
class CountRun {
    /** @param {import('../effects.js').EffectsContext} ctx @param {Element} el @param {RegExpExecArray} match */
    constructor(ctx, el, match) {
        this.ctx = ctx;
        this.el = el;
        const text = el.textContent ?? '';
        const whole = match[0].trim();
        this.before = text.slice(0, match.index);
        this.after = text.slice(match.index + match[0].length);
        const sep = separatorsOf(el, ctx.doc);
        this.decimalSep = sep.decimal;
        const cut = sep.decimal === '' ? -1 : whole.lastIndexOf(sep.decimal);
        this.decimals = cut < 0 ? 0 : whole.length - cut - 1;
        const digitsOnly = (/** @type {string} */ part) => part.replace(/[^\d-]/g, '');
        this.target = Number(cut < 0 ? digitsOnly(whole) : `${digitsOnly(whole.slice(0, cut))}.${digitsOnly(whole.slice(cut + 1))}`);
        /** The separator the authored text grouped its digits with, or '' when it did not group them. */
        this.groupSep = sep.group !== '' && whole.includes(sep.group) ? sep.group : '';
        const style = ctx.view?.getComputedStyle(el);
        this.duration = numberKnob(style, COUNT_KNOB, DEFAULT_DURATION);
        this.from = numberKnob(style, COUNT_FROM_KNOB, 0);
        this.startedAt = 0;
        /** The frame asked for, or 0. */
        this.frame = 0;
    }

    /** Put a value back in the authored shape: same grouping, same decimals. @param {number} value */
    render(value) {
        const [int, frac] = value.toFixed(this.decimals).split('.');
        const body = this.groupSep ? int.replace(/\B(?=(\d{3})+(?!\d))/g, this.groupSep) : int;
        return `${this.before}${body}${this.decimals ? this.decimalSep + frac : ''}${this.after}`;
    }

    /**
     * The rest state, and the only state a reader who asked for less movement ever sees: the real number, whatever happened
     * before.
     */
    rest() {
        const { el, target } = this;
        el.textContent = this.render(target);
        el.setAttribute(HOOKS.countState, 'done');
        el.dispatchEvent(new CustomEvent('kp-count', { bubbles: true, detail: { value: target, counted: false } }));
    }

    /** @param {(undo: () => void) => void} own registers the stop with the attach */
    play(own) {
        const { el, ctx } = this;
        if (ctx.reduced() || this.duration <= 0 || this.target === this.from) {
            this.rest();
            return;
        }
        el.setAttribute(HOOKS.countState, 'running');
        this.startedAt = this.now();
        this.frame = ctx.view?.requestAnimationFrame?.(() => this.step()) ?? 0;
        // Mid-session reduced motion, and detaching: both land on the real number rather than wherever the count had got to [DI7, KT6].
        own(() => {
            if (this.frame) ctx.view?.cancelAnimationFrame?.(this.frame);
            this.rest();
        });
    }

    now() {
        return this.ctx.view?.performance?.now?.() ?? Date.now();
    }

    step() {
        const { ctx, target, from } = this;
        const t = Math.min(1, (this.now() - this.startedAt) / this.duration);
        // Ease out: fast at first, settling onto the real number.
        const eased = 1 - (1 - t) ** 3;
        this.el.textContent = this.render(from + (target - from) * eased);
        if (t < 1 && !ctx.reduced()) this.frame = ctx.view?.requestAnimationFrame?.(() => this.step()) ?? 0;
        else this.rest();
    }
}

/** Counting numbers [feat-count-1]. */
class CountHook extends EffectHook {
    /** @param {Element} el */
    countUp(el) {
        const match = DIGITS.exec(el.textContent ?? '');
        if (match === null) {
            el.setAttribute(HOOKS.countState, 'done');
            return;
        }
        const run = new CountRun(this.ctx, el, match);
        if (!Number.isFinite(run.target)) {
            el.setAttribute(HOOKS.countState, 'done');
            return;
        }
        run.play((undo) => this.own(undo));
    }
}

/** Make the count hook of one attach. @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    return new CountHook(ctx).connect();
}
