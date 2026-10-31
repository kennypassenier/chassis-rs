// Drawing the rows: one row per run with its time, its distance and its marks, the loading rows, and the "show more" button.

import { RunsCore } from './core.js';
import { clockShift, runMoment, runsRelative } from './time.js';

export class RunsRows extends RunsCore {
    /** The marks of a run: the clock turning before it, and the app's own conflict. @param {import('./core.js').Run} run @param {number | undefined} before */
    marksOf(run, before) {
        const shift = clockShift(before ?? this.read.now(), run.at, this.read.zone);
        /** @type {string[]} */
        const marks = [];
        if (shift !== 0) marks.push(this.s.runsClockChange(shift));
        if (run.conflict) marks.push(run.conflict);
        return marks;
    }

    /** One row. @param {import('./core.js').Run} run @param {number} index @param {number | undefined} before */
    row(run, index, before) {
        const { doc, s, read } = this;
        const li = doc.createElement('li');
        li.className = 'kp-runs__row';
        const time = doc.createElement('time');
        time.className = 'kp-runs__when';
        time.dateTime = new Date(run.at).toISOString();
        time.textContent = runMoment(run.at, read.zone, this.host.lang || undefined);
        li.append(time);
        if (read.relative) {
            const rel = doc.createElement('span');
            rel.className = 'kp-runs__rel';
            rel.textContent = runsRelative(run.at, read.now(), s);
            li.append(rel);
        }
        const marks = read.warn ? this.marksOf(run, before) : [];
        if (marks.length) {
            const flag = doc.createElement('span');
            flag.className = 'kp-badge kp-badge--warning kp-runs__flag';
            flag.textContent = marks.join(' · ');
            li.append(flag);
        }
        if (index === 0) li.dataset.kpRunsNext = '';
        return li;
    }

    /** The placeholder rows of the loading state. */
    waitRows() {
        return Array.from({ length: this.read.count }, () => {
            const li = this.doc.createElement('li');
            li.className = 'kp-runs__row kp-runs__row--wait';
            li.setAttribute('aria-hidden', 'true');
            const bar = this.doc.createElement('span');
            bar.className = 'kp-skeleton kp-runs__bar';
            li.append(bar);
            return li;
        });
    }

    draw() {
        const { list, button } = this.parts;
        const { count, more } = this.read;
        const shown = this.expanded ? this.all : this.all.slice(0, count);
        const rows = this.state === 'loading' && shown.length === 0 ? this.waitRows() : shown.map((run, i) => this.row(run, i, i === 0 ? undefined : shown[i - 1]?.at));
        list.replaceChildren(...rows);
        list.toggleAttribute('inert', this.state !== 'ready');
        if (this.state === 'loading') list.setAttribute('aria-busy', 'true');
        else list.removeAttribute('aria-busy');
        button.hidden = !(more > 0 && this.state === 'ready' && this.all.length > count);
        button.textContent = this.expanded ? this.s.runsFewer : this.s.runsMore(Math.min(more, this.all.length - count));
        button.setAttribute('aria-expanded', String(this.expanded));
    }
}
