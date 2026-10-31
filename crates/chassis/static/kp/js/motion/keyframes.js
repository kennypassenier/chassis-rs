// Reads a theme's entrance keyframes and turns them into lines and entrances.

/* ------------------------------------------------------------- closing */

/**
 * One CSS animation of a dialog's entrance, kept for its close: its
 * keyframes (the custom properties of a register's animation included, see
 * keyframesOf()), where it plays, its curve, and its own time and wait
 * (`line`).
 * @typedef {{ target: Element, keyframes: Keyframe[], easing: string, pseudoElement: string | null, line: Line }} Entrance
 */
/** @type {WeakMap<HTMLDialogElement, Entrance[]>} */
export const entrances = new WeakMap();
/** @type {WeakSet<HTMLDialogElement>} */
export const closing = new WeakSet();
export const nativeClose = typeof HTMLDialogElement === 'undefined' ? null : HTMLDialogElement.prototype.close;
/** The fields of a keyframe that are not a property of the style. */
const KEYFRAME_FIELDS = new Set(['offset', 'computedOffset', 'easing', 'composite']);
/**
 * `read`, the keyframes `getKeyframes()` reports (every ordinary property,
 * the implicit first and last frame filled in, each frame on the animation's
 * curve), with the custom properties that `own` (a copy of the same effect)
 * keeps and `read` does not. Chromium's `getKeyframes()` leaves the custom
 * properties of a register's animation out, even a whole frame that holds
 * nothing else, and an `Element.animate()` fed with it plays nothing for a
 * `--x` (package finding of 2026-10-08). A frame `read` has gets the custom
 * properties it lacks; a frame it lacks (same offset) is added, on the curve
 * and the composite `own` gives it. When `own` has no custom property, `read`
 * is returned as it is. Pure.
 * @param {Keyframe[]} read
 * @param {Keyframe[]} own
 * @returns {Keyframe[]}
 */
export function withCustomProperties(read, own) {
    const customs = own.filter((frame) => Object.keys(frame).some((key) => key.startsWith('--')));
    if (customs.length === 0) return read;
    const frames = read.map((frame) => ({ ...frame }));
    const at = (/** @type {any} */ frame) => Number(frame.computedOffset ?? frame.offset);
    for (const custom of /** @type {any[]} */ (customs)) {
        let frame = /** @type {any} */ (frames.find((one) => Math.abs(at(one) - at(custom)) < 1e-6));
        if (!frame) {
            frame = { offset: at(custom), computedOffset: at(custom), easing: custom.easing, composite: custom.composite };
            const next = frames.findIndex((one) => at(one) > at(custom));
            frames.splice(next === -1 ? frames.length : next, 0, frame);
        }
        for (const key of Object.keys(custom)) if (key.startsWith('--') && !(key in frame) && !KEYFRAME_FIELDS.has(key)) frame[key] = custom[key];
    }
    return frames;
}
/**
 * The keyframes to play `effect` again with `Element.animate()`: what
 * `getKeyframes()` reports, plus the custom properties it may leave out
 * (withCustomProperties()). An engine without the copy constructor gets what
 * `getKeyframes()` reports.
 * @param {KeyframeEffect} effect
 * @returns {Keyframe[]}
 */
export function keyframesOf(effect) {
    const read = effect.getKeyframes();
    try {
        return withCustomProperties(read, new KeyframeEffect(effect).getKeyframes());
    } catch {
        return read;
    }
}
/**
 * The own time of one line of a part, in ms: when it starts, how long one
 * iteration plays and where it ends on the part's clock.
 * @typedef {{ delay: number, duration: number, end: number }} Line
 */

/** @param {KeyframeEffect} effect @returns {Line} */
function lineOf(effect) {
    const timing = effect.getTiming();
    const delay = Number(timing.delay) || 0;
    return {
        delay,
        duration: Number(timing.duration) || 0,
        end: delay + (Number(effect.getComputedTiming().activeDuration) || 0),
    };
}
/**
 * The lines of a part that closes as its open played backwards, line by line
 * (`--kp-lines: keep`): the part takes `total` ms from its first line's start
 * to its last line's end, each line keeps its own share of that time and its
 * own wait, and the whole is turned round, so the line that came in last
 * goes first. Pure: the lines as the register's entrance plays them in, the
 * timing of each in the close and in the opening out. Where the part's
 * entrance is as long as `total` the scale is 1 and every wait is the one the
 * register wrote.
 * @param {readonly Line[]} lines
 * @param {number} total the time the part's close (and its open) takes
 * @returns {{ duration: number, openDelay: number, closeDelay: number }[]}
 */
export function turnLines(lines, total) {
    const span = Math.max(0, ...lines.map((line) => line.end));
    const scale = span > 0 ? total / span : 1;
    return lines.map((line) => ({
        duration: line.duration * scale,
        openDelay: line.delay * scale,
        closeDelay: (span - line.end) * scale,
    }));
}
/**
 * turnLines() for a dialog's kept entrances. The shade behind it
 * (`::backdrop`) is no line of the dialog: it belongs to the whole part and
 * takes the whole `total`, as it does without `--kp-lines: keep`, and it
 * neither lengthens the span the lines are scaled by nor is scaled with them.
 * @param {readonly { pseudoElement: string | null, line: Line }[]} kept
 * @param {number} total
 * @returns {{ duration: number, openDelay: number, closeDelay: number }[]}
 */
export function turnEntrances(kept, total) {
    const lines = turnLines(
        kept.filter((one) => one.pseudoElement !== '::backdrop').map((one) => one.line),
        total,
    );
    let at = 0;
    return kept.map((one) => (one.pseudoElement !== '::backdrop' ? lines[at++] : { duration: total, openDelay: 0, closeDelay: 0 }));
}
/**
 * Whether the register of `el` keeps every line of a part with its own time
 * and wait (`--kp-lines: keep`) instead of one time for the whole part.
 * Formal rules a card's frame first and then its lines top down, so its
 * leave, arrival, close and open each play every line's wait. Without the
 * token nothing here is read and every part plays as one.
 * @param {Element} el
 * @returns {boolean}
 */
export const keepsLines = (el) => getComputedStyle(el).getPropertyValue('--kp-lines').trim() === 'keep';
/**
 * Keep the entrance the dialog just started, so its close can play it
 * backwards: a finished entrance with `fill: backwards` is gone from the
 * element by the time the dialog closes.
 * @param {HTMLDialogElement} dialog
 */
export function rememberEntrance(dialog) {
    getComputedStyle(dialog).animationName;
    const kept = entranceOf(dialog).map((a) => {
        const effect = /** @type {KeyframeEffect} */ (a.effect);
        return {
            target: /** @type {Element} */ (effect.target),
            keyframes: keyframesOf(effect),
            easing: String(effect.getTiming().easing ?? 'linear'),
            pseudoElement: effect.pseudoElement,
            line: lineOf(effect),
        };
    });
    entrances.set(dialog, kept);
}
/**
 * The CSS animations that make up the dialog's entrance: its own and those
 * of what is in it (grotesk rules the title in under its ::before), each
 * kept on its own element. A motion that never ends is no entrance (the
 * caret terminal blinks on a ghost button's ::after): it is left alone, so
 * it neither moves to the dialog nor stops.
 * @param {HTMLDialogElement} dialog
 * @returns {CSSAnimation[]}
 */
export function entranceOf(dialog) {
    return /** @type {CSSAnimation[]} */ (
        dialog
            .getAnimations({ subtree: true })
            .filter(
                (a) =>
                    a instanceof CSSAnimation &&
                    a.effect instanceof KeyframeEffect &&
                    a.effect.target !== null &&
                    Number.isFinite(Number(a.effect.getComputedTiming().activeDuration)),
            )
    );
}
