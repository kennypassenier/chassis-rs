// Reading the options of one picker from its attributes and the page's defaults.

import { resolveLocale, weekStartsOn } from '../locale.js';
import { DEFAULT_MIN, SETS, WEEKDAY_PRESETS } from './values.js';

/**
 * @param {HTMLElement} el
 * @param {{ locale?: string, weekStartsOn?: number }} given the page's defaults
 */
export function readWeekdaysOptions(el, { locale: localeOption, weekStartsOn: weekOption }) {
    const month = el.dataset.kpDays === 'month';
    const locale = resolveLocale(localeOption ?? el.dataset.kpLocale, el);
    const presetsAttr = el.dataset.kpPresets;
    return {
        month,
        locale,
        firstDay: weekStartsOn(locale, el.dataset.kpWeekStartsOn === undefined ? weekOption : Number(el.dataset.kpWeekStartsOn)),
        narrow: el.dataset.kpDayNames === 'narrow',
        min: el.dataset.kpMin === undefined ? DEFAULT_MIN : Math.max(0, Number(el.dataset.kpMin) || 0),
        showSummary: el.dataset.kpSummary !== 'false',
        presets: month || presetsAttr === 'false' ? [] : (presetsAttr ? presetsAttr.split(/[\s,]+/) : [...WEEKDAY_PRESETS]).filter((p) => p in SETS),
        disabled: el.hasAttribute('data-kp-disabled'),
    };
}
