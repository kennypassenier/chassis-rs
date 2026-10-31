// Size easing: the curve and the stepped clock a height change runs on.
import { msOf, themeMotion } from './timing.js';
import { switching } from './switching.js';

/**
 * The entrance's curve without its overshoot: a size goes to its new value
 * and stops there (Kenny, 2026-10-04: pastel's and synthwave's cards "grow
 * too much and shrink again at the end, it should just grow to the correct
 * size"). A cubic-bezier's y values are held between 0 and 1.
 * @param {string} ease
 */
export function withoutOvershoot(ease) {
    // A `linear()` list (pastel's landing since scope-141) is held the same
    // way, output by output; a list with nothing past 0 or 1 (forest's,
    // phantom's) is returned exactly as it came.
    const list = /^linear\((.*)\)$/.exec(ease.trim());
    if (list) {
        const stops = list[1].split(',').map((stop) => stop.trim().split(/\s+/));
        if (stops.every(([y]) => Number(y) >= 0 && Number(y) <= 1)) return ease;
        return `linear(${stops.map(([y, ...at]) => [String(Math.min(1, Math.max(0, Number(y)))), ...at].join(' ')).join(', ')})`;
    }
    const m = /^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/.exec(ease.trim());
    if (!m) return ease;
    const [x1, y1, x2, y2] = m.slice(1).map(Number);
    const hold = (/** @type {number} */ y) => Math.min(1, Math.max(0, y));
    return `cubic-bezier(${x1}, ${hold(y1)}, ${x2}, ${hold(y2)})`;
}
/**
 * The curve a size change runs on: the entrance's, without overshoot, or,
 * where the theme asks for it (`--kp-size-steps: line`, terminal), one step
 * per line of text the box gains or loses.
 * @param {HTMLElement} box @param {string} ease @param {number} change in px
 * @param {boolean} [plain] the entrance's curve alone, without the theme's size character (the accordion, approved as it is)
 */
export function sizeEase(box, ease, change, plain = false) {
    // A theme that says `--kp-accordion-size: own` gives the parts that keep
    // "the entrance's curve alone" (the accordion, a tree branch) its own
    // size character as well; every other theme is untouched.
    if (plain && getComputedStyle(box).getPropertyValue('--kp-accordion-size').trim() === 'own') plain = false;
    // A shrink is its grow played backwards: the same duration on the curve
    // turned around, so frame t of the shrink is frame (T - t) of the grow
    // (Kenny, 2026-10-05: "find out where else there is a discrepancy
    // between opening/closing or shrink/grow"). A box that grew easing out
    // shrinks easing in, as a dialog's close already did.
    const way = (/** @type {string} */ curve) => withoutOvershoot(change < 0 ? reversedEase(curve) : curve);
    if (plain) return way(ease);
    const style = getComputedStyle(box);
    // A theme may give its sizes a curve of their own (`--kp-size-ease`),
    // still held from overshooting.
    const own = style.getPropertyValue('--kp-size-ease').trim();
    if (own) ease = own;
    if (style.getPropertyValue('--kp-size-steps').trim() === 'line') {
        const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3 || 20;
        return way(`steps(${Math.max(1, Math.round(Math.abs(change) / line))}, jump-end)`);
    }
    return way(ease);
}
/**
 * How long a stepped size motion takes in the theme `box` wears: a theme
 * that counts its time in steps (`--kp-size-step`, the ms of one step:
 * nostromo's 80 ms frame, terminal's 136 ms line) moves a box, a fold and
 * an unfold one step per that time, so the steps keep the theme's own clock
 * instead of dividing the size time among them (a fold of 400 ms in four
 * steps ran 100 ms a step, off nostromo's 80 ms frame). Any other curve, or
 * a theme without the knob, keeps `duration`.
 * @param {Element} box @param {string} easing @param {number} duration
 * @returns {number}
 */
export function steppedDuration(box, easing, duration) {
    const steps = /^steps\(\s*(\d+)/.exec(easing.trim());
    if (!steps || duration <= 0) return duration;
    const step = msOf(box, '--kp-size-step', 0);
    if (step <= 0) return duration;
    const root = box.ownerDocument?.documentElement ?? document.documentElement;
    const scale = parseFloat(getComputedStyle(root).getPropertyValue('--kp-motion-scale')) || 1;
    return Number(steps[1]) * step * scale;
}
/**
 * A wait before a stepped fold, put on the theme's step clock
 * (`--kp-size-step`): a whole number of steps.
 * @param {Element} box @param {string} easing @param {number} ms
 */
export function onStepClock(box, easing, ms) {
    if (!/^steps\(/.test(easing.trim())) return ms;
    const step = msOf(box, '--kp-size-step', 0);
    return step > 0 ? Math.round(ms / step) * step : ms;
}
/** The keywords as the curves they name, for reversedEase(). */
const NAMED_EASES = /** @type {Record<string, string>} */ ({
    ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    'ease-in': 'cubic-bezier(0.42, 0, 1, 1)',
    'ease-out': 'cubic-bezier(0, 0, 0.58, 1)',
    'ease-in-out': 'cubic-bezier(0.42, 0, 0.58, 1)',
    'step-start': 'steps(1, jump-start)',
    'step-end': 'steps(1, jump-end)',
});
/**
 * A timing function turned around: the curve that plays a motion backwards
 * as `direction: reverse` would, so a close, a shrink or a fold that runs
 * on it is its opening frame for frame in the other order. A cubic-bezier
 * is rotated half a turn (an ease-out becomes an ease-in, an overshoot past
 * the end becomes one before the start), steps that jump at the end jump at
 * the start, a `linear()` list runs from its other end; `linear` and the
 * symmetric curves stay themselves.
 * @param {string} ease a CSS easing function
 * @returns {string}
 */
export function reversedEase(ease) {
    const curve = NAMED_EASES[ease.trim()] ?? ease.trim();
    const bezier = /^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/.exec(curve);
    if (bezier) {
        const [x1, y1, x2, y2] = bezier.slice(1).map(Number);
        const r = (/** @type {number} */ n) => Math.round(n * 1e4) / 1e4;
        return `cubic-bezier(${r(1 - x2)}, ${r(1 - y2)}, ${r(1 - x1)}, ${r(1 - y1)})`;
    }
    const steps = /^steps\(\s*(\d+)\s*(?:,\s*([a-z-]+)\s*)?\)$/.exec(curve);
    if (steps) {
        const flip = /** @type {Record<string, string>} */ ({
            start: 'jump-end',
            'jump-start': 'jump-end',
            end: 'jump-start',
            'jump-end': 'jump-start',
        });
        const position = steps[2] ?? 'jump-end';
        return `steps(${steps[1]}, ${flip[position] ?? position})`;
    }
    const list = /^linear\((.*)\)$/.exec(curve);
    if (list) {
        // Each stop is an output and up to two input percentages; a list
        // with no percentages is evenly spaced, one with some is left alone.
        const stops = list[1].split(',').map((stop) => stop.trim().split(/\s+/));
        if (stops.every((s) => s.length === 1))
            return `linear(${stops
                .reverse()
                .map(([y]) => String(Math.round((1 - Number(y)) * 1e4) / 1e4))
                .join(', ')})`;
        if (stops.every((s) => s.length === 2 && s[1].endsWith('%')))
            return `linear(${stops
                .reverse()
                .map(([y, x]) => `${Math.round((1 - Number(y)) * 1e4) / 1e4} ${Math.round((100 - parseFloat(x)) * 100) / 100}%`)
                .join(', ')})`;
    }
    return curve;
}
/**
 * A box's layout height to the fraction: its border box as drawn when that
 * is the layout height rounded (a fold of 75.5 px glided to 76 and then
 * clicked half a pixel back, in formal), and `offsetHeight` when a
 * transform scales what is drawn (an entrance that zooms the box).
 * @param {HTMLElement} el
 */
export function layoutHeight(el) {
    const whole = el.offsetHeight;
    const drawn = el.getBoundingClientRect().height;
    return Math.abs(drawn - whole) < 1 ? drawn : whole;
}
/**
 * The size motion of the theme `box` wears, for a box this module does not
 * glide itself (the tiles of a set, js/tiles.js): the duration and the curve
 * a change of `change` px runs on, with the theme's own size character
 * (`--kp-size-ease`, `--kp-size-steps`). A duration of 0 means: take the
 * new size at once (reduced motion, a theme without an entrance, or a theme
 * switch in progress).
 * @param {HTMLElement} box @param {number} change in px
 * @returns {{ duration: number, easing: string }}
 */
export function sizeMotion(box, change) {
    const { size, ease } = themeMotion(box);
    if (size <= 0 || switching) return { duration: 0, easing: 'linear' };
    const easing = sizeEase(box, ease, change);
    return { duration: steppedDuration(box, easing, size), easing };
}
