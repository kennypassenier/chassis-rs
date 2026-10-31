// What one picker is set to: the page's options and the picker's own attributes, resolved once when it attaches.

import { parseDate as parseLocale, resolveLocale, weekStartsOn } from '../locale.js';

/**
 * Resolve a picker's settings: each attribute on the picker wins over the option the page passed, and each option has a default.
 * @param {HTMLElement} picker
 * @param {import('./constants.js').DatePickerOptions} options
 */
export function readSettings(picker, options) {
    const {
        locale: localeOption,
        dateFormat: formatOption = 'rule52',
        weekStartsOn: weekOption,
        closeOnSelect = true,
        refocus = true,
        isDateDisabled,
        renderDay,
        previousGlyph = '‹',
        nextGlyph = '›',
    } = options;
    const locale = resolveLocale(picker.dataset.kpLocale ?? localeOption, picker);
    return {
        locale,
        // The numeric date is dd/mm/yyyy for every reader (rule 52) unless the consumer asks for the locale's own.
        numeric: /** @type {'rule52' | 'locale'} */ ((picker.dataset.kpDateFormat ?? formatOption) === 'locale' ? 'locale' : 'rule52'),
        firstDay: weekStartsOn(locale, picker.dataset.kpWeekStartsOn === undefined ? weekOption : Number(picker.dataset.kpWeekStartsOn)),
        min: picker.dataset.kpMin ? parseLocale(picker.dataset.kpMin, locale) : null,
        max: picker.dataset.kpMax ? parseLocale(picker.dataset.kpMax, locale) : null,
        disabledDays: (picker.dataset.kpDisabledDays ?? '')
            .split(',')
            .map((d) => Number.parseInt(d, 10))
            .filter((d) => !Number.isNaN(d)),
        closes: picker.dataset.kpCloseOnSelect === undefined ? closeOnSelect : picker.dataset.kpCloseOnSelect !== 'false',
        refocus,
        isDateDisabled,
        renderDay,
        previousGlyph: picker.dataset.kpPreviousGlyph ?? previousGlyph,
        nextGlyph: picker.dataset.kpNextGlyph ?? nextGlyph,
    };
}
