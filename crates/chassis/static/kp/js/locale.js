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

// The module is a facade [closure-pattern B, Kenny 2026-10-30]: a pure Intl helper library with no element to look after, split by
// responsibility into js/locale/ (resolve.js, dates.js, calendar.js, numbers.js), listed in js/README.md.

export { resolveLocale, weekStartsOn, collator } from './locale/resolve.js';
export { datePattern, formatDate, parseDate } from './locale/dates.js';
export { calendarNames } from './locale/calendar.js';
export { formatBytes, parseNumber } from './locale/numbers.js';

/** How a numeric date is written: the reader's locale, or dd/mm/yyyy (rule 52). @typedef {'locale' | 'rule52'} DateFormat */
