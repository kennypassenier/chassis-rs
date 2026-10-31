// Information that updates in place, the theme's way [picked by Kenny on
// research/update-motion, 2026-10-05: formal a checked stamp, titanium a
// heat tint; cyberpunk's count-down stutter picked on research/cyberpunk-live,
// 2026-10-07 02:49].
//
// Kenny, 2026-10-05 11:29: "think about an 'update' or 'refresh' type of
// animation that updates info the 'theme way'". update(el, next) writes the
// new value at once, then marks the element `data-kp-updating="<idea>"` for
// as long as the register's update keyframes play
// (`kp-sig-<theme>-update-*`, in the register's kp.signature layer), and
// takes the mark off again. The idea is the register's `--kp-update`; the
// time and the curve are the theme's own, from themeMotion():
// `--kp-update-duration` is max(size, close) × 1.25 (the stretch leave()
// gives the fold of a space), `--kp-update-ease` the entrance's curve
// without its overshoot. A register that knows its own update time says it
// with `--kp-update-time` (a time, set inside its no-preference block like
// the idea): it wins when set, so a register is not bound to its dialog's
// time. A register without an idea: the value changes and nothing plays.
// Under reduced motion the time is 0, and a register names an idea there
// only when it has a still version that keeps its own time
// (cyberpunk's copies stand still beside the value for 1.2 s); the others
// declare theirs under `prefers-reduced-motion: no-preference` alone.
//
// The rules every idea keeps: the new value is in the DOM at the first frame
// and readable throughout (overlays on `::before`, effects of colour,
// drop-shadow, opacity and a bounded transform); the box keeps its space
// (a width the new value itself needs is taken at the first frame, with the
// value); every keyframe runs once, and a second update during the first
// restarts it. Nothing plays on first paint: only a change is an update.
//
// Many values change at once on a dashboard, so update() never reads layout
// or style beside a write of its own: it writes the value at the call, and
// every update called in the same task is marked together in one microtask
// that reads everything first (one style resolution serves all of them),
// then writes every mark, then reads the animations. A page that updates
// fifty cells pays for one style pass, not fifty forced layouts.
//
//   import { update } from '@kp-soft/themes/js/update';
//
//   await update(document.querySelector('#pressure'), '3.41');            // a text value
//   await update(row.querySelector('.kp-state-word'), 'Restarting');      // a state word
//   await update(tile.querySelector('svg[data-kp-spark]'), [...last24h, 3.41]); // a spark
//
// A spark is an svg, which has no pseudo-elements: its parent carries the
// mark, and a register draws its overlay over the parent's last part when
// the parent's child is the svg. Give the spark a box of its own (a `div`
// round the svg) so the overlay sits on the chart, not on the whole tile.
// The idea is read on the svg itself, so a register can let a chart take its
// new point at once (`--kp-update: none` on the svg: cyberpunk's split is the
// value's alone).

// The module is a facade [closure-pattern B, Kenny 2026-10-30]: the names, the timing, the mark, the spark and the
// batch (one UpdateBatch for the page, js/update/batch.js) live in js/update/, listed in js/README.md.

export { UPDATING_ATTRIBUTE, UPDATE_PROPERTY, UPDATE_STYLE } from './update/values.js';
export { updateIdea, updateTimingOf, updateTiming, updatePlays } from './update/timing.js';
export { markUpdating, unmarkUpdating } from './update/mark.js';
export { update } from './update/run.js';

/**
 * @typedef {{ svg: SVGSVGElement, parts: string, from: { line: string, area: string }, to: { line: string, area: string } }} SparkWrite
 * @typedef {{ el: Element, host: HTMLElement, spark: SparkWrite | null, resolve: (took: number) => void }} UpdateJob
 */
