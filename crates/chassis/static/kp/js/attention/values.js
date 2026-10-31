// The band, the severities it orders by, and what each severity wears.

/** The band, and the severities it orders by, worst first. */
export const ATTENTION = '.kp-attention';
export const SEVERITIES = /** @type {const} */ (['critical', 'warning', 'info']);

/** The alert flavour each severity wears. */
export const FLAVOUR = { critical: 'destructive', warning: 'warning', info: 'info' };
/** The glyph in each severity's round icon; not words, so not in the dictionary. */
export const GLYPH = { critical: '!', warning: '!', info: 'i' };

/** Where an item stands among the severities: unknown severities come last. @param {Element} el */
export const rank = (el) => {
    const at = SEVERITIES.indexOf(/** @type {any} */ (el.getAttribute('data-kp-severity')));
    return at < 0 ? SEVERITIES.length : at;
};
