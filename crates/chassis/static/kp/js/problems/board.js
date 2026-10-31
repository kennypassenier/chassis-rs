// One container of problems: the problems a page sets, by key, in the layout the attributes or options choose, and a repaint when that layout is changed at runtime.

import { getStrings } from '../strings.js';
import { ProblemsSummary } from './summary.js';
import { DEFAULT_FOLD_FROM, LEAST_FOLD_FROM, PROBLEM_MODES, ranked } from './values.js';

/** @typedef {import('../problems.js').Problem} Problem */
/** @typedef {import('../problems.js').ProblemsOptions} ProblemsOptions */

export class ProblemsBoard extends ProblemsSummary {
    connect() {
        this.observe(
            new MutationObserver(() => {
                const wanted = `${this.host.getAttribute('data-kp-problems-mode')}|${this.host.getAttribute('data-kp-problems-fold-from')}`;
                if (wanted !== this.rendered) this.paint(this.items, this.rest);
            }),
        ).observe(this.host, { attributes: true, attributeFilter: ['data-kp-problems-mode', 'data-kp-problems-fold-from'] });
    }

    /** Remember what a page set, to paint again when an attribute changes the layout. @param {Problem[]} items @param {ProblemsOptions} options */
    track(items, options) {
        const { mode: _mode, foldFrom: _fold, ...rest } = options;
        this.items = items;
        this.rest = rest;
    }

    /** The layout, the fold count and the remedy's word: the options win over the attributes. @param {ProblemsOptions} options */
    settings(options) {
        const host = this.host;
        const modeAttr = host.getAttribute('data-kp-problems-mode');
        const mode = options.mode ?? (PROBLEM_MODES.includes(/** @type {any} */ (modeAttr)) ? /** @type {'each' | 'list' | 'fold'} */ (modeAttr) : 'each');
        const foldFrom = Math.max(
            LEAST_FOLD_FROM,
            options.foldFrom ?? (Number.parseInt(host.getAttribute('data-kp-problems-fold-from') ?? '', 10) || DEFAULT_FOLD_FROM),
        );
        const remedyLabel = options.remedyLabel ?? host.getAttribute('data-kp-remedy-label') ?? getStrings().problemRemedy;
        return { mode, foldFrom, remedyLabel };
    }

    /** Stamp the layout, the fold count and the count of problems on the container. @param {string} mode @param {number} foldFrom @param {ProblemsOptions} options @param {number} count */
    stamp(mode, foldFrom, options, count) {
        const host = this.host;
        if (host.getAttribute('data-kp-problems-mode') !== mode) host.setAttribute('data-kp-problems-mode', mode);
        if (mode === 'fold' && options.foldFrom !== undefined && host.getAttribute('data-kp-problems-fold-from') !== String(foldFrom))
            host.setAttribute('data-kp-problems-fold-from', String(foldFrom));
        this.rendered = `${host.getAttribute('data-kp-problems-mode')}|${host.getAttribute('data-kp-problems-fold-from')}`;
        host.setAttribute('data-kp-problems-count', String(count));
    }

    /** Paint the problems in the chosen layout. @param {Problem[]} items @param {ProblemsOptions} options */
    paint(items, options) {
        const { mode, foldFrom, remedyLabel } = this.settings(options);
        const list = ranked(items);
        this.stamp(mode, foldFrom, options, list.length);
        if (mode === 'list' || (mode === 'fold' && list.length >= foldFrom)) this.paintSummary(list, mode === 'list' ? 'list' : 'fold', foldFrom, remedyLabel);
        else this.paintEach(list, remedyLabel);
    }
}
