// The batch: every update called in one task is marked together in one microtask, so a page that updates fifty cells pays one style pass.

import { UPDATE_PROPERTY } from './values.js';
import { updateIdea, updatePlays, updateTiming } from './timing.js';
import { markUpdating, unmarkUpdating } from './mark.js';
import { glideSpark } from './spark.js';

/** @typedef {import('../update.js').UpdateJob} UpdateJob */
/** @typedef {{ duration: number, ease: string }} UpdateTiming */

/** The updates of one task and the ends of the ones playing. */
export class UpdateBatch {
    constructor() {
        /** The updates written in this task, by host, waiting for the one flush. @type {Map<HTMLElement, UpdateJob>} */
        this.pending = new Map();
        /** The end of the update playing on a host. @type {WeakMap<Element, () => void>} */
        this.running = new WeakMap();
    }

    /** End the update playing on `host`, if there is one. @param {HTMLElement} host */
    cancel(host) {
        this.running.get(host)?.();
    }

    /** @param {UpdateJob} job */
    enqueue(job) {
        if (this.pending.size === 0) queueMicrotask(() => this.flush());
        // The same host twice in one task: the later value is the one shown, and
        // the earlier call played nothing.
        this.pending.get(job.host)?.resolve(0);
        this.pending.set(job.host, job);
    }

    /**
     * Mark every update written in this task at once: all reads, then all
     * writes, then the animations read back. Never a read between two writes.
     */
    flush() {
        const jobs = [...this.pending.values()];
        this.pending.clear();
        const started = performance.now();
        const plays = this.readAll(jobs);
        // Writes: every mark.
        const marked = plays.map((p) => ({ ...p, before: markUpdating(p.job.host, p.idea, p.timing, { inline: p.inline }) }));
        // Reads: the register's keyframes on every host, before any glide is added.
        const css = marked.map((m) =>
            m.job.host.getAnimations({ subtree: true }).filter((a) => a instanceof CSSAnimation && a.animationName.includes('-update-')),
        );
        marked.forEach((m, at) => this.play(m, css[at], started));
    }

    /**
     * Reads. The idea on the element itself (a spark's svg may name none),
     * the host's display; then the theme's timing once per themed scope
     * (themeMotion() reads a probe it adds and takes off: once per theme,
     * not once per value). Updates whose register names no idea are resolved here.
     * @param {UpdateJob[]} jobs
     */
    readAll(jobs) {
        const read = jobs.map((job) => {
            const idea = updateIdea(getComputedStyle(job.el).getPropertyValue(UPDATE_PROPERTY));
            const inline = idea !== '' && getComputedStyle(job.host).display === 'inline';
            return { job, idea, inline };
        });
        /** @type {Map<Element, UpdateTiming>} */
        const timings = new Map();
        const plays = read.filter((r) => updatePlays(r.idea)).map((r) => ({ ...r, timing: this.timingOf(timings, r.job.host) }));
        for (const r of read) if (!updatePlays(r.idea)) r.job.resolve(0);
        return plays;
    }

    /**
     * The theme's timing at `host`, read once per themed scope.
     * @param {Map<Element, UpdateTiming>} timings
     * @param {HTMLElement} host
     * @returns {UpdateTiming}
     */
    timingOf(timings, host) {
        const scope = host.closest('[data-theme]') ?? host.ownerDocument.documentElement;
        let timing = timings.get(scope);
        if (!timing) timings.set(scope, (timing = updateTiming(host)));
        return timing;
    }

    /**
     * Start the glide, and take the mark off when the register's keyframes and the glide are done.
     * @param {{ job: UpdateJob, timing: UpdateTiming, before: Record<string, string> }} marked
     * @param {Animation[]} cssAnimations
     * @param {number} started
     */
    play(marked, cssAnimations, started) {
        const glide = marked.job.spark ? glideSpark(marked.job.spark, marked.timing) : [];
        const { host, resolve } = marked.job;
        let done = false;
        const end = () => {
            if (done) return;
            done = true;
            unmarkUpdating(host, marked.before);
            for (const a of glide) a.cancel();
            if (this.running.get(host) === end) this.running.delete(host);
        };
        this.running.set(host, end);
        Promise.all([...cssAnimations, ...glide].map((a) => a.finished.catch(() => undefined))).then(() => {
            const took = performance.now() - started;
            end();
            resolve(took);
        });
    }
}
