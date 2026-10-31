// What a picker's markup says: its name, kind, order, zone, clock, label and the rows it keeps, read once at attach.

import { CHART_TIME_ZONE } from '../chart.js';
import { getStrings } from '../strings.js';
import { DEFAULT_INLINE_MAX } from './constants.js';
import { nextPickerNumber } from './state.js';

/**
 * The settings of one picker.
 * @param {HTMLElement} el
 * @param {(() => number) | undefined} nowOption the page's clock
 */
export function readSettings(el, nowOption) {
    const id = el.id || `kp-dated-${nextPickerNumber()}`;
    const fixed = Date.parse(el.dataset.kpNow ?? '');
    return {
        id,
        name: el.dataset.kpName ?? id,
        mode: /** @type {'radio' | 'combobox' | 'auto'} */ (el.dataset.kpPicker === 'radio' || el.dataset.kpPicker === 'combobox' ? el.dataset.kpPicker : 'auto'),
        inlineMax: Math.max(1, Number(el.dataset.kpPickerInlineMax) || DEFAULT_INLINE_MAX),
        latestOn: el.dataset.kpLatest !== 'none',
        order: /** @type {'newest' | 'oldest' | 'given'} */ (el.dataset.kpOrder === 'oldest' || el.dataset.kpOrder === 'given' ? el.dataset.kpOrder : 'newest'),
        column: el.dataset.kpMetaColumn !== 'false',
        preselect: el.dataset.kpPreselect !== 'false',
        zone: el.dataset.kpTimeZone || CHART_TIME_ZONE,
        now: nowOption ?? (Number.isFinite(fixed) ? () => fixed : () => Date.now()),
        label: el.getAttribute('aria-label') ?? el.dataset.kpLegend ?? getStrings().datedGroup,
        rowsWanted: Math.max(0, Number(el.dataset.kpRows) || 0),
    };
}
