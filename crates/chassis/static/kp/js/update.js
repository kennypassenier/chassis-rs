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
// without its overshoot. A register without an idea: the value changes and
// nothing plays. Under reduced motion the time is 0, and a register names an
// idea there only when it has a still version that keeps its own time
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

import { themeMotion, withoutOvershoot } from './motion.js';
import { SPARK, drawSparkline, sparkPaths } from './kpi.js';
import { setStateWord } from './components.js';

/** The attribute written on an element while its update plays. */
export const UPDATING_ATTRIBUTE = 'data-kp-updating';

/** The custom property a register names its update idea in. */
export const UPDATE_PROPERTY = '--kp-update';

/** The inline properties update() sets while it plays, and takes off after. */
export const UPDATE_STYLE = /** @type {readonly string[]} */ (Object.freeze(['display', '--kp-update-duration', '--kp-update-ease']));

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The idea a register's `--kp-update` names, or '' for none.
 * @param {string | null | undefined} value the computed custom property
 * @returns {string}
 */
export function updateIdea(value) {
    const idea = String(value ?? '').trim();
    return idea === 'none' ? '' : idea;
}

/**
 * How long an update plays and on which curve, from the theme's motion: the
 * box's resize time or the dialog's close time, whichever is longer, times
 * 1.25; the entrance's curve without its overshoot. 0 without motion.
 * @param {{ size: number, close: number, ease: string }} motion what themeMotion() returns
 * @returns {{ duration: number, ease: string }}
 */
export function updateTimingOf({ size, close, ease }) {
    return { duration: Math.max(size, close) * 1.25, ease: withoutOvershoot(ease) };
}

/**
 * The update timing of the theme at `scope`.
 * @param {Element} [scope]
 * @returns {{ duration: number, ease: string }}
 */
export function updateTiming(scope = document.documentElement) {
    return updateTimingOf(themeMotion(scope));
}

/**
 * Whether an update with this idea plays anything: whenever the register
 * names one. Its timing may be 0 (reduced motion): a register that names an
 * idea there plays a still version on its own time.
 * @param {string} idea
 */
export const updatePlays = (idea) => idea !== '';

/**
 * Put the mark on: the theme's timing as inline custom properties, an
 * inline host as an inline-block (a transform and an overlay need a box),
 * the attribute last. No reflow of its own: a mark that was on came off
 * before the batch read the host's style, so setting it again starts the
 * keyframes again.
 * @param {HTMLElement} host
 * @param {string} idea
 * @param {{ duration: number, ease: string }} timing
 * @param {{ inline?: boolean }} [options] whether the host is laid out inline now
 * @returns {Record<string, string>} the inline values update() replaced, to put back
 */
export function markUpdating(host, idea, timing, { inline = false } = {}) {
    /** @type {Record<string, string>} */
    const before = {};
    for (const name of UPDATE_STYLE) before[name] = host.style.getPropertyValue(name);
    if (inline) host.style.setProperty('display', 'inline-block');
    host.style.setProperty('--kp-update-duration', `${timing.duration}ms`);
    host.style.setProperty('--kp-update-ease', timing.ease);
    host.setAttribute(UPDATING_ATTRIBUTE, idea);
    return before;
}

/**
 * Take the mark off and put back what markUpdating() replaced.
 * @param {HTMLElement} host
 * @param {Record<string, string>} before
 */
export function unmarkUpdating(host, before) {
    host.removeAttribute(UPDATING_ATTRIBUTE);
    for (const name of UPDATE_STYLE) {
        if (before[name]) host.style.setProperty(name, before[name]);
        else host.style.removeProperty(name);
    }
}

/** @type {WeakMap<Element, () => void>} */
const running = new WeakMap();

/** @param {Element} el */
const isSvg = (el) => el.namespaceURI === SVG_NS && el.localName === 'svg';

/**
 * @typedef {{ svg: SVGSVGElement, parts: string, from: { line: string, area: string }, to: { line: string, area: string } }} SparkWrite
 * @typedef {{ el: Element, host: HTMLElement, spark: SparkWrite | null, resolve: (took: number) => void }} UpdateJob
 */

/**
 * Write a spark's numbers. A spark that `attachSparklines()` watches is
 * redrawn from its `data-kp-spark`, so the attribute takes the numbers and
 * its own redraw runs first; one nobody watches is drawn here. Returns the
 * two paths before and after, for glideSpark().
 * @param {SVGSVGElement} svg
 * @param {readonly number[]} values
 * @returns {Promise<SparkWrite>}
 */
async function writeSpark(svg, values) {
    const oldLine = svg.querySelector('[class$="-line"]');
    const parts = /(\S+)-line\b/.exec(oldLine?.getAttribute('class') ?? '')?.[1] ?? 'kp-kpi__spark';
    const from = { line: oldLine?.getAttribute('d') ?? '', area: svg.querySelector('[class$="-area"]')?.getAttribute('d') ?? '' };
    if (svg.matches(SPARK)) {
        svg.setAttribute('data-kp-spark', values.join(' '));
        // A mutation observer's callback was queued with the change: it runs before this.
        await Promise.resolve();
    }
    const to = sparkPaths(values);
    if (svg.querySelector(`.${CSS.escape(parts)}-line`)?.getAttribute('d') !== to.line) drawSparkline(svg, values, { parts });
    return { svg, parts, from, to };
}

/**
 * The last point glides to its new place on the theme's curve: the two paths
 * morph (the same commands, so they interpolate).
 * @param {SparkWrite} spark
 * @param {{ duration: number, ease: string }} timing
 * @returns {Animation[]}
 */
function glideSpark({ svg, parts, from, to }, timing) {
    if (!from.line || !from.area || timing.duration <= 0) return [];
    const line = svg.querySelector(`.${CSS.escape(parts)}-line`);
    const area = svg.querySelector(`.${CSS.escape(parts)}-area`);
    const options = { duration: timing.duration, easing: timing.ease };
    /** @type {Animation[]} */
    const out = [];
    try {
        if (line) out.push(line.animate({ d: [`path("${from.line}")`, `path("${to.line}")`] }, options));
        if (area) out.push(area.animate({ d: [`path("${from.area}")`, `path("${to.area}")`] }, options));
    } catch {
        // An engine that cannot animate `d` shows the new line at once.
    }
    return out;
}

/** The updates written in this task, by host, waiting for the one flush. @type {Map<HTMLElement, UpdateJob>} */
const pending = new Map();

/** @param {UpdateJob} job */
function enqueue(job) {
    if (pending.size === 0) queueMicrotask(flush);
    // The same host twice in one task: the later value is the one shown, and
    // the earlier call played nothing.
    pending.get(job.host)?.resolve(0);
    pending.set(job.host, job);
}

/**
 * Mark every update written in this task at once: all reads, then all
 * writes, then the animations read back. Never a read between two writes.
 */
function flush() {
    const jobs = [...pending.values()];
    pending.clear();
    const started = performance.now();
    // Reads. The idea on the element itself (a spark's svg may name none),
    // the host's display; then the theme's timing once per themed scope
    // (themeMotion() reads a probe it adds and takes off: once per theme,
    // not once per value).
    const read = jobs.map((job) => {
        const idea = updateIdea(getComputedStyle(job.el).getPropertyValue(UPDATE_PROPERTY));
        const inline = idea !== '' && getComputedStyle(job.host).display === 'inline';
        return { job, idea, inline };
    });
    /** @type {Map<Element, { duration: number, ease: string }>} */
    const timings = new Map();
    const timingOf = (/** @type {HTMLElement} */ host) => {
        const scope = host.closest('[data-theme]') ?? host.ownerDocument.documentElement;
        let timing = timings.get(scope);
        if (!timing) timings.set(scope, (timing = updateTiming(host)));
        return timing;
    };
    const plays = read.filter((r) => updatePlays(r.idea)).map((r) => ({ ...r, timing: timingOf(r.job.host) }));
    for (const r of read) if (!updatePlays(r.idea)) r.job.resolve(0);
    // Writes: every mark.
    const marked = plays.map((p) => ({ ...p, before: markUpdating(p.job.host, p.idea, p.timing, { inline: p.inline }) }));
    // Reads: the register's keyframes on every host, before any glide is added.
    const css = marked.map((m) =>
        m.job.host.getAnimations({ subtree: true }).filter((a) => a instanceof CSSAnimation && a.animationName.includes('-update-')),
    );
    marked.forEach((m, at) => {
        const glide = m.job.spark ? glideSpark(m.job.spark, m.timing) : [];
        const { host, resolve } = m.job;
        let done = false;
        const end = () => {
            if (done) return;
            done = true;
            unmarkUpdating(host, m.before);
            for (const a of glide) a.cancel();
            if (running.get(host) === end) running.delete(host);
        };
        running.set(host, end);
        Promise.all([...css[at], ...glide].map((a) => a.finished.catch(() => undefined))).then(() => {
            const took = performance.now() - started;
            end();
            resolve(took);
        });
    });
}

/**
 * Show `next` in `el` the theme's way. The value is written at the call and
 * stays readable throughout; any width the new value itself needs is taken
 * then, with the value, so nothing moves while the idea plays and nothing
 * moves when it ends. The mark goes on in the batch of this task (see
 * flush()), before the next frame.
 * @param {Element} el a text element, a `.kp-state-word`, or a spark's svg
 * @param {string | number | readonly number[]} next
 * @returns {Promise<number>} how long it played, in ms; 0 when nothing played
 */
export async function update(el, next) {
    // A spark is an svg, which has no pseudo-elements: its box carries the mark.
    const host = /** @type {HTMLElement} */ (isSvg(el) ? (el.parentElement ?? el) : el);
    running.get(host)?.();
    /** @type {SparkWrite | null} */
    let spark = null;
    if (isSvg(el) && Array.isArray(next)) spark = await writeSpark(/** @type {SVGSVGElement} */ (el), next);
    else if (el.classList.contains('kp-state-word')) setStateWord(/** @type {HTMLElement} */ (el), String(next));
    else el.textContent = String(next);
    return new Promise((resolve) => enqueue({ el, host, spark, resolve }));
}
