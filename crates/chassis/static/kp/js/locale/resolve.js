// Which locale to use, the day a week starts on, and the collator: the three answers every other locale function starts from.

/** The locale of last resort: no explicit one, no `lang` above the element, no browser language. */
export const FALLBACK_LOCALE = 'en-GB';
/** The first day of the week when nothing says otherwise: Monday, as most of the world's calendars agree. */
export const DEFAULT_WEEK_START = 1;
/** Intl counts Sunday as 7; the Date API counts it as 0. */
const INTL_SUNDAY = 7;

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
    return FALLBACK_LOCALE;
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
        if (typeof first === 'number') return first % INTL_SUNDAY;
    } catch {
        // An unknown locale tag: fall through to the default.
    }
    return DEFAULT_WEEK_START;
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
