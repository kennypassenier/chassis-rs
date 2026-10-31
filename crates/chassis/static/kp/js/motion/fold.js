// Folding: timing, curve and frames of a collapsing block.
import { exitsOf } from './reversed-leave.js';
import { inTurnGap, reaches } from './turns.js';
import { firstMs, reduced } from './timing.js';
import { arrival } from './arrive.js';

/**
 * Settles once the CSS animations on `el` are `share` of the way through,
 * or when `done` settles, whichever is first.
 * @param {HTMLElement} el @param {number} share @param {Promise<unknown>} done @param {boolean} [lines] the lines of the part count (exitsOf())
 * @returns {Promise<unknown>}
 */
export function partway(el, share, done, lines = false) {
    const css = exitsOf(el, lines);
    const reached = new Promise((resolve) => {
        const tick = () => {
            const through = css.every((a) => {
                const timing = a.effect?.getComputedTiming();
                return a.playState === 'finished' || (timing?.progress ?? 0) >= share || (timing?.currentIteration ?? 0) > 0;
            });
            if (through) resolve(undefined);
            else requestAnimationFrame(tick);
        };
        tick();
    });
    return Promise.race([reached, done]);
}
/**
 * The gap inTurnGap() gives a leave of a row of `count`, in ms on its
 * exit's clock, when it is shorter than the one partway() would wait for;
 * else null. The same reading arrive() takes for its `lag`.
 * @param {HTMLElement} el @param {number} share @param {number} lasts @param {number} count @param {boolean} [lines] as partway()
 * @returns {number | null}
 */
export function cappedGap(el, share, lasts, count, lines = false) {
    const exits = exitsOf(el, lines).map((a) => {
        const effect = /** @type {KeyframeEffect} */ (a.effect);
        const timing = effect.getTiming();
        return { timing, end: (Number(timing.delay) || 0) + (Number(effect.getComputedTiming().activeDuration) || 0) };
    });
    if (exits.length === 0) return null;
    const gap =
        share > 0 && share < 1
            ? Math.max(0, ...exits.map((exit) => reaches(exit.timing, exit.end, share)))
            : Math.max(lasts, ...exits.map((exit) => exit.end));
    if (!Number.isFinite(gap)) return null;
    const next = inTurnGap(gap, count);
    return next < gap ? next : null;
}
/**
 * Settles once every CSS animation on `el` has run `ms` on its own clock (or
 * is over), or when `done` does.
 * @param {HTMLElement} el @param {number} ms @param {Promise<unknown>} done @param {boolean} [lines] as partway()
 */
export function atTime(el, ms, done, lines = false) {
    const css = exitsOf(el, lines);
    const reached = new Promise((resolve) => {
        const tick = () => {
            if (css.every((a) => a.playState === 'finished' || (Number(a.currentTime) || 0) >= ms)) resolve(undefined);
            else requestAnimationFrame(tick);
        };
        tick();
    });
    return Promise.race([reached, done]);
}
/**
 * Settles when the CSS animations running on `el` have played out, at
 * whatever rate they play (a slowed-down review plays them at a quarter);
 * with none running, after `fallback` ms.
 * @param {HTMLElement} el @param {number} fallback @param {boolean} [lines] as partway()
 * @returns {Promise<unknown>}
 */
export function playedOut(el, fallback, lines = false) {
    // Its pseudo-elements count too: a theme may draw its exit on ::after.
    const css = exitsOf(el, lines);
    if (css.length === 0) return new Promise((resolve) => setTimeout(resolve, fallback));
    return Promise.all(css.map((a) => a.finished.catch(() => undefined)));
}
/**
 * The arrival `el` would play, as an animation name, duration and curve:
 * the register's own `[data-kp-arriving]`, else the theme's toast entrance.
 * @param {HTMLElement} el
 * @returns {{ name: string, duration: number, ease: string } | null}
 */
export function arrivalOf(el) {
    if (reduced()) return null;
    const had = el.hasAttribute('data-kp-arriving');
    el.setAttribute('data-kp-arriving', '');
    const style = getComputedStyle(el);
    const own = style.animationName && style.animationName !== 'none';
    const read = own
        ? {
              name: style.animationName.split(',')[0].trim(),
              duration: firstMs(style.animationDuration),
              ease: style.animationTimingFunction.split(/,(?![^(]*\))/)[0].trim(),
          }
        : null;
    if (!had) el.removeAttribute('data-kp-arriving');
    if (read && read.duration > 0) return read;
    const toast = arrival(el);
    if (!toast) return null;
    const [name, duration, ...ease] = toast.split(' ');
    return { name, duration: parseFloat(duration), ease: ease.slice(0, -1).join(' ') };
}
/**
 * How a leave's fold of space is timed, read off the leaving element: its
 * length as a multiple of the longer of the exit and the size glide
 * (`--kp-leave-fold-grow`, 1.25 unless a theme says otherwise) and, with no
 * `--kp-leave-fold: after`, where it starts as a share of the exit
 * (`--kp-leave-fold-start`, a third unless a theme says otherwise; forest
 * sets 1 and 0, so its space closes as long as, and with, its leave).
 * @param {CSSStyleDeclaration} style the element's style while it carries `data-kp-leaving`
 * @returns {{ grow: number, start: (lasts: number) => number }}
 */
export function foldTiming(style) {
    const grow = parseFloat(style.getPropertyValue('--kp-leave-fold-grow'));
    const start = parseFloat(style.getPropertyValue('--kp-leave-fold-start'));
    return {
        grow: Number.isNaN(grow) ? 1.25 : grow,
        start: (lasts) => (Number.isNaN(start) ? lasts / 3 : lasts * start),
    };
}
/**
 * The curve a leave's fold of space runs on: the theme's entrance curve,
 * unless the theme says `--kp-leave-fold-ease` (cyberpunk folds in whole
 * ticks, not in the entrance's single step).
 * @param {CSSStyleDeclaration} style the element's style while it carries `data-kp-leaving`
 * @param {string} ease the entrance's curve
 * @returns {string}
 */
export function foldCurve(style, ease) {
    return style.getPropertyValue('--kp-leave-fold-ease').trim() || ease;
}
/**
 * The space `el` takes, and nothing, as a leave folds it: in a row (a flex
 * row, an inline chip) its width, sideways; anywhere else its height, from
 * below; margins and paddings to 0, and the flex gap towards a neighbour
 * swallowed by a negative margin.
 * @param {HTMLElement} el @param {CSSStyleDeclaration} style its style while it carries `data-kp-leaving`
 * @returns {[Record<string, string>, Record<string, string>]}
 */
export function foldFrames(el, style) {
    const parent = el.parentElement ? getComputedStyle(el.parentElement) : null;
    const sideways =
        style.display.startsWith('inline') || (parent !== null && /flex/.test(parent.display) && !parent.flexDirection.startsWith('column'));
    /** @type {Record<string, string>} */
    const from = sideways
        ? {
              width: `${el.offsetWidth}px`,
              marginLeft: style.marginLeft,
              marginRight: style.marginRight,
              paddingLeft: style.paddingLeft,
              paddingRight: style.paddingRight,
          }
        : {
              height: `${el.offsetHeight}px`,
              marginTop: style.marginTop,
              marginBottom: style.marginBottom,
              paddingTop: style.paddingTop,
              paddingBottom: style.paddingBottom,
          };
    // A floor of its own (the toolbar's "Showing only" row keeps 1.75rem)
    // would hold the box open at that size for the first part of the fold,
    // which then showed as a jump of the floor's size when it began.
    const floor = sideways ? 'minWidth' : 'minHeight';
    if (parseFloat(style[floor]) > 0) from[floor] = style[floor];
    /** @type {Record<string, string>} */
    const to = Object.fromEntries(Object.keys(from).map((k) => [k, '0px']));
    // The gap a flex box keeps between its items stays until the item is
    // taken out, so a column of rows folded every row to nothing and then
    // jumped by a gap at each removal (15 px, measured in the leave
    // options' cards, 2026-10-05). A negative margin towards the
    // neighbour swallows the gap as the space closes.
    const gapOf = parent && /flex/.test(parent.display) ? parseFloat(sideways ? parent.columnGap : parent.rowGap) || 0 : 0;
    if (gapOf > 0) {
        const inFlow = (/** @type {Element | null} */ n) => {
            if (!n) return false;
            const s = getComputedStyle(n);
            return s.display !== 'none' && s.position !== 'absolute' && s.position !== 'fixed';
        };
        const near = (/** @type {'previousElementSibling' | 'nextElementSibling'} */ way) => {
            let n = el[way];
            while (n && !inFlow(n)) n = n[way];
            return n;
        };
        const rtl = sideways && style.direction === 'rtl';
        const start = sideways ? (rtl ? 'marginRight' : 'marginLeft') : 'marginTop';
        const end = sideways ? (rtl ? 'marginLeft' : 'marginRight') : 'marginBottom';
        if (near('previousElementSibling')) to[start] = `${-gapOf}px`;
        else if (near('nextElementSibling')) to[end] = `${-gapOf}px`;
    }
    return [from, to];
}
/**
 * Whether folding the width of `el` to nothing would re-wrap the row it
 * sits in. Folding sideways moves the neighbours up with the closing
 * space; in a wrapping row that puts a neighbour on another line half way,
 * so the row (and the page under it) is a line shorter or taller for the
 * length of the fold and jumps to its real height when the fold ends (a
 * filter tag arriving in the toolbar's "Showing only" row at 390 px: 28 px
 * while it grew, 62 px after; Kenny, kpadopt-controls, 2026-10-16). Read by
 * laying the end of the fold out for one read and comparing the heights of
 * the ancestors; a fold that re-wraps is not played: the neighbours take
 * their place at once and the box around them glides.
 * @param {HTMLElement} el @param {Record<string, string>} from @param {Record<string, string>} to
 * @returns {boolean}
 */
export function foldReflows(el, from, to) {
    if (!('width' in from)) return false;
    /** @type {HTMLElement[]} */
    const chain = [];
    for (let up = el.parentElement; up && up !== document.body && chain.length < 6; up = up.parentElement) chain.push(up);
    const before = chain.map((n) => n.getBoundingClientRect().height);
    const dashed = (/** @type {string} */ k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    const keys = Object.keys(to).map(dashed);
    const kept = keys.map((k) => el.style.getPropertyValue(k));
    const values = Object.values(to);
    keys.forEach((k, i) => el.style.setProperty(k, values[i], 'important'));
    const after = chain.map((n) => n.getBoundingClientRect().height);
    keys.forEach((k, i) => (kept[i] ? el.style.setProperty(k, kept[i]) : el.style.removeProperty(k)));
    return after.some((h, i) => Math.abs(h - before[i]) >= 1);
}
