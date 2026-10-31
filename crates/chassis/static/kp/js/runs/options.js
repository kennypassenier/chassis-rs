// Reading the options of one list from its attributes; the page's own clock beats the fixed one, and the fixed one beats the real clock.

import { CHART_TIME_ZONE } from '../chart.js';
import { DEFAULT_COUNT } from './values.js';

/**
 * @param {HTMLElement} el
 * @param {(() => number) | undefined} nowOption the clock the page passed to attachRuns()
 */
export function readRunsOptions(el, nowOption) {
    const fixed = Date.parse(el.dataset.kpNow ?? '');
    return {
        zone: el.dataset.kpTimeZone || CHART_TIME_ZONE,
        count: Math.max(1, Number(el.dataset.kpRunsCount) || DEFAULT_COUNT),
        more: Math.max(0, Number(el.dataset.kpRunsMore) || 0),
        relative: el.dataset.kpRunsRelative !== 'false',
        warn: el.dataset.kpRunsWarn !== 'false',
        /** Whether the clock stands still, so the words need no refresh. */
        fixed: Number.isFinite(fixed) || Boolean(nowOption),
        now: nowOption ?? (Number.isFinite(fixed) ? () => fixed : () => Date.now()),
    };
}
