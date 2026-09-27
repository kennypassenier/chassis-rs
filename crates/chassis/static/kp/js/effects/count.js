// The count hook of js/effects.js, in a module of its own [scope-117].
//
// Cut out of attachEffects() line for line, so a page that never asks for it
// never downloads it: js/effects.js fetches this the first time an element or
// a theme knob needs it. What it shared with the rest of the closure arrives
// through `ctx`; the four variables every part writes are `ctx.state`.

import { HOOKS, COUNT_KNOB, COUNT_FROM_KNOB } from '../effects.js';

/** @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    const { doc, view, reduced, cleanups } = ctx;
    /**
     * A number that counts up to what it already says [feat-count-1].
     *
     * The authored text is the oracle, the way the headline's is: the
     * element already reads `1 118 204,75` or `€ 1.204` or `98%`, and
     * this reads the number out of that, counts to it, and writes the
     * same string back. It never formats a number of its own — the
     * separators, the currency and the fraction digits are whatever the
     * page wrote, so the page's own locale is preserved without this
     * module having to know what it is.
     *
     * @param {Element} el
     */
    const countUp = (el) => {
        const text = el.textContent ?? '';
        // The first run of digits, with whatever separators sit inside it.
        const match = /-?[\d][\d\s.,\u00a0\u202f]*/.exec(text);
        if (match === null) {
            el.setAttribute(HOOKS.countState, 'done');
            return;
        }
        const whole = match[0].trim();
        const before = text.slice(0, match.index);
        const after = text.slice(match.index + match[0].length);

        // Which character groups and which one is the decimal point is NOT
        // decidable from the string: `1.204` is one thousand two hundred
        // and four in Dutch and one-point-two-oh-four in English. So it is
        // not guessed — the page's own language decides, the way every
        // other locale-shaped thing in this package does. A page that says
        // nothing gets the browser's default locale, which is what a
        // reader's own browser would use anyway.
        const locale = /** @type {HTMLElement | null} */ (el.closest('[lang]'))?.lang || doc?.documentElement?.lang || undefined;
        const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
        const groupSep = parts.find((part) => part.type === 'group')?.value ?? '';
        const decimalSep = parts.find((part) => part.type === 'decimal')?.value ?? '.';

        const cut = decimalSep === '' ? -1 : whole.lastIndexOf(decimalSep);
        const decimals = cut < 0 ? 0 : whole.length - cut - 1;
        const digitsOnly = (/** @type {string} */ part) => part.replace(/[^\d-]/g, '');
        const target = Number(cut < 0 ? digitsOnly(whole) : `${digitsOnly(whole.slice(0, cut))}.${digitsOnly(whole.slice(cut + 1))}`);
        if (!Number.isFinite(target)) {
            el.setAttribute(HOOKS.countState, 'done');
            return;
        }
        /** Whether the authored text grouped its digits at all. */
        const grouped = groupSep !== '' && whole.includes(groupSep);

        /** Put a value back in the authored shape: same grouping, same decimals. */
        const render = (/** @type {number} */ value) => {
            const [int, frac] = value.toFixed(decimals).split('.');
            const body = grouped ? int.replace(/\B(?=(\d{3})+(?!\d))/g, groupSep) : int;
            return `${before}${body}${decimals ? decimalSep + frac : ''}${after}`;
        };

        const style = view?.getComputedStyle(el);
        // `|| 900` would read a deliberate `0` as "unset" and count
        // anyway — the absence of a value is not the value, a fifth time
        // in this package. An empty string is unset; `0` is a choice.
        const asked = style?.getPropertyValue(COUNT_KNOB).trim() ?? '';
        const duration = asked === '' || !Number.isFinite(Number(asked)) ? 900 : Number(asked);
        const askedFrom = style?.getPropertyValue(COUNT_FROM_KNOB).trim() ?? '';
        const from = askedFrom === '' || !Number.isFinite(Number(askedFrom)) ? 0 : Number(askedFrom);

        // The rest state, and the only state a reader who asked for less
        // movement ever sees. Setting it FIRST means every early return
        // above and every failure below still leaves the real number.
        const rest = () => {
            el.textContent = render(target);
            el.setAttribute(HOOKS.countState, 'done');
            el.dispatchEvent(new CustomEvent('kp-count', { bubbles: true, detail: { value: target, counted: false } }));
        };
        if (reduced() || duration <= 0 || target === from) {
            rest();
            return;
        }

        el.setAttribute(HOOKS.countState, 'running');
        const startedAt = view?.performance?.now?.() ?? Date.now();
        let frame = 0;
        const step = () => {
            const now = view?.performance?.now?.() ?? Date.now();
            const t = Math.min(1, (now - startedAt) / duration);
            // Ease out: fast at first, settling onto the real number.
            const eased = 1 - (1 - t) ** 3;
            el.textContent = render(from + (target - from) * eased);
            if (t < 1 && !reduced()) frame = view?.requestAnimationFrame?.(step) ?? 0;
            else rest();
        };
        frame = view?.requestAnimationFrame?.(step) ?? 0;
        // Mid-session reduced motion, and detaching: both land on the real
        // number rather than wherever the count had got to [DI7, KT6].
        cleanups.push(() => {
            if (frame) view?.cancelAnimationFrame?.(frame);
            rest();
        });
    };
    return { countUp };
}
