// Locale, decided by the browser unless the consumer says otherwise [KT6, D5].
//
// The date picker wrote dd-mm-yyyy and read day-first, the calendar began
// on Monday, the DataTable collated with 'nl', and the upload printed
// "1.5 MB" — four decisions this package made on behalf of every person
// who ever used a consumer's page. Kenny's answer to the sweep's form:
// the browser knows. Intl knows which language the person reads, how a
// date is written there, which day their week starts on, and how their
// numbers group. So the default is whatever Intl says, and every function
// here takes an explicit `locale` for the consumer who wants to override
// it — per instance, never per package.
//
// Nothing here is clever. It is the same Intl every mature library reads;
// the point is that it is read in one place, with one fallback story.

/**
 * The locale to use: the explicit one; else the nearest `lang` attribute
 * above the element, because a document that declares its language has
 * already answered; else the browser's.
 *
 * @param {string | undefined} [explicit]
 * @param {Element | null} [element] where to look for `lang`
 * @returns {string}
 */
export function resolveLocale(explicit, element = null) {
    if (explicit) return explicit;
    const declared = element?.closest('[lang]')?.getAttribute('lang');
    if (declared) return declared;
    if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
    return 'en-GB';
}

/**
 * The day the week starts on, 0 = Sunday … 6 = Saturday.
 *
 * Intl.Locale's week info where the browser has it (Chrome and Safari
 * do, Firefox is arriving); Monday where it does not, because most of
 * the world's calendars agree and the ones that do not are the ones
 * whose browsers ship the API.
 *
 * @param {string | undefined} [locale]
 * @param {number | undefined} [explicit] a consumer's own answer wins
 * @returns {number}
 */
export function weekStartsOn(locale, explicit) {
    if (explicit !== undefined) return explicit;
    try {
        const info = /** @type {{ getWeekInfo?: () => { firstDay: number }, weekInfo?: { firstDay: number } }} */ (
            /** @type {unknown} */ (new Intl.Locale(resolveLocale(locale)))
        );
        const first = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay;
        // Intl counts Monday as 1 and Sunday as 7; the Date API counts
        // Sunday as 0.
        if (typeof first === 'number') return first % 7;
    } catch {
        // An unknown locale tag: fall through to the default.
    }
    return 1;
}

/**
 * The order and separator a locale writes a numeric date in, read from
 * Intl once rather than assumed. `parts` is e.g. ['day','month','year'].
 *
 * @param {string | undefined} [locale]
 * @returns {{ parts: ('day' | 'month' | 'year')[], separator: string, hint: string }}
 */
export function datePattern(locale) {
    const formatter = new Intl.DateTimeFormat(resolveLocale(locale), { year: 'numeric', month: '2-digit', day: '2-digit' });
    /** @type {('day' | 'month' | 'year')[]} */
    const parts = [];
    let separator = '-';
    for (const part of formatter.formatToParts(new Date(2001, 11, 25))) {
        if (part.type === 'day' || part.type === 'month' || part.type === 'year') parts.push(part.type);
        else if (part.type === 'literal' && separator === '-' && part.value.trim() !== '') separator = part.value.trim();
    }
    if (parts.length !== 3) return { parts: ['day', 'month', 'year'], separator: '-', hint: 'dd-mm-yyyy' };
    const hint = parts.map((p) => (p === 'day' ? 'dd' : p === 'month' ? 'mm' : 'yyyy')).join(separator);
    return { parts, separator, hint };
}

/**
 * A date as the locale writes it: numeric, two-digit day and month.
 *
 * @param {Date} date
 * @param {string | undefined} [locale]
 * @returns {string}
 */
export function formatDate(date, locale) {
    return new Intl.DateTimeFormat(resolveLocale(locale), { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/**
 * Read what a person typed, in their locale's order — plus ISO, which
 * everyone accepts. Returns null for anything that is not a real date:
 * "31-02-2026" is refused rather than rounded to 3 March.
 *
 * @param {string} text
 * @param {string | undefined} [locale]
 * @returns {Date | null}
 */
export function parseDate(text, locale) {
    const trimmed = text.trim();
    /** @param {number} y @param {number} m @param {number} d */
    const exact = (y, m, d) => {
        const date = new Date(y, m - 1, d);
        return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
    };
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (iso) return exact(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    const loose = /^(\d{1,4})[-/. ](\d{1,2})[-/. ](\d{1,4})$/.exec(trimmed);
    if (!loose) return null;
    const { parts } = datePattern(locale);
    const numbers = [Number(loose[1]), Number(loose[2]), Number(loose[3])];
    /** @type {Record<string, number>} */
    const by = {};
    parts.forEach((part, i) => {
        by[part] = numbers[i] ?? Number.NaN;
    });
    let year = by.year ?? Number.NaN;
    if (year < 100) year += 2000;
    return exact(year, by.month ?? Number.NaN, by.day ?? Number.NaN);
}

/**
 * The month and weekday names a calendar shows, in the locale it is drawn
 * for [gap-11].
 *
 * The date picker wrote a Dutch date under an English month, because its
 * names came from the string dictionary and the dictionary is English.
 * Intl knows the names in every language the browser does, so a locale
 * that is not English reads them from Intl. The dictionary still decides
 * in two cases: when a consumer has set names of their own (their words
 * win, which is the way out [KT6]), and when the locale is English, where
 * the dictionary already is the answer — and where Intl's "Mon" would
 * quietly change the two-letter "Mo" every English page shows.
 *
 * The short month names fill the month grid [scope-89], where twelve full
 * names in three columns ran out of their cells in eleven themes
 * ("September", 83px of text in a 75px cell). They follow the same rule, and
 * a consumer who set full names of their own but no short ones sees their
 * full names there rather than the package's English abbreviations.
 *
 * @param {{ months: string[], weekdays: string[], monthsShort?: string[] }} dictionary the strings in force; weekdays Monday first
 * @param {{ months: string[], weekdays: string[], monthsShort?: string[] }} defaults the package's own dictionary, to tell a consumer's names from it
 * @param {string | undefined} [locale]
 * @returns {{ months: string[], monthsShort: string[], weekdays: string[] }} weekdays Sunday first, the way Date#getDay counts
 */
export function calendarNames(dictionary, defaults, locale) {
    const resolved = resolveLocale(locale);
    let english = true;
    try {
        english = new Intl.Locale(resolved).language === 'en';
    } catch {
        // An unknown tag: keep the dictionary.
    }
    /** @param {string[]} a @param {string[]} b */
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    /** @param {Intl.DateTimeFormatOptions} options @param {(i: number) => Date} date @param {number} count */
    const fromIntl = (options, date, count) => {
        if (english) return null;
        try {
            const format = new Intl.DateTimeFormat(resolved, options);
            return Array.from({ length: count }, (_, i) => format.format(date(i)));
        } catch {
            return null;
        }
    };
    const ownMonths = same(dictionary.months, defaults.months);
    const months = (ownMonths ? fromIntl({ month: 'long' }, (i) => new Date(2001, i, 1), 12) : null) ?? dictionary.months;
    // Short names a consumer set win; full names they set, with no short ones, come next; then Intl's, then the dictionary's.
    const shortDefaults = defaults.monthsShort;
    const ownShort = shortDefaults !== undefined && same(dictionary.monthsShort ?? shortDefaults, shortDefaults);
    const monthsShort = !ownShort
        ? (dictionary.monthsShort ?? months)
        : !ownMonths
          ? dictionary.months
          : (fromIntl({ month: 'short' }, (i) => new Date(2001, i, 1), 12) ?? shortDefaults ?? months);
    // 7 January 2001 was a Sunday, so day i of that week is getDay() === i.
    const sundayFirst = [6, 0, 1, 2, 3, 4, 5].map((i) => dictionary.weekdays[i] ?? '');
    const weekdays =
        (same(dictionary.weekdays, defaults.weekdays) ? fromIntl({ weekday: 'short' }, (i) => new Date(2001, 0, 7 + i), 7) : null) ?? sundayFirst;
    return { months, monthsShort, weekdays };
}

/**
 * A byte count as the locale writes numbers: "1,5 MB" in Dutch, "1.5 MB"
 * in English. Base 1000 with SI units, because a person reading a file
 * size is not counting sectors.
 *
 * @param {number} bytes
 * @param {string | undefined} [locale]
 * @param {{ base?: 1000 | 1024, units?: string[] }} [options]
 * @returns {string}
 */
export function formatBytes(bytes, locale, { base = 1000, units = ['B', 'kB', 'MB', 'GB', 'TB'] } = {}) {
    let value = bytes;
    let unit = 0;
    while (value >= base && unit < units.length - 1) {
        value /= base;
        unit += 1;
    }
    const digits = unit === 0 ? 0 : 1;
    return `${new Intl.NumberFormat(resolveLocale(locale), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value)} ${units[unit]}`;
}

/**
 * Read a number the way the locale writes it: "1.284,50" in Dutch,
 * "1,284.50" in English. Intl tells us which glyph is the decimal.
 *
 * @param {string} text
 * @param {string | undefined} [locale]
 * @returns {number}
 */
export function parseNumber(text, locale) {
    const parts = new Intl.NumberFormat(resolveLocale(locale)).formatToParts(1234.5);
    const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
    const group = parts.find((p) => p.type === 'group')?.value ?? ',';
    const cleaned = text
        .replace(new RegExp(`[${escape(group)}\\s  ]`, 'g'), '')
        .replace(decimal, '.')
        .replace(/[^\d.+-]/g, '');
    return Number.parseFloat(cleaned);
}

/** @param {string} s */
function escape(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A collator for sorting text as the locale sorts it.
 *
 * @param {string | undefined} [locale]
 * @returns {Intl.Collator}
 */
export function collator(locale) {
    return new Intl.Collator(resolveLocale(locale), { numeric: true, sensitivity: 'base' });
}
