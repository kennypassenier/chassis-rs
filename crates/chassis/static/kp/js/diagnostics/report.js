// The verdict: two halves laid beside each other, and the one that is behind named.

import { getStrings } from '../strings.js';
import { compareVersions } from './compare.js';
import { scriptSide, stylesheetSide } from './sides.js';

/** @typedef {import('../diagnostics.js').Side} Side */
/** @typedef {import('../diagnostics.js').Report} Report */

/**
 * Lay the two halves beside each other and name the one that is behind.
 *
 * Pure: same arguments, same report, no document and no clock. The test
 * that measures this feeds it a pair it knows to be mismatched, because a
 * verdict that has only ever seen a matching pair has never been read.
 *
 * @param {Side} stylesheet
 * @param {Side} script
 * @param {import('../strings.js').Strings} [strings]
 * @returns {Report}
 */
export function diagnose(stylesheet, script, strings = getStrings()) {
    const onlyInStylesheet = stylesheet.themes.filter((name) => !script.themes.includes(name));
    const onlyInScript = script.themes.filter((name) => !stylesheet.themes.includes(name));
    /** @param {Report['status']} status @param {string} verdict @returns {Report} */
    const report = (status, verdict) => ({ status, stylesheet, script, onlyInStylesheet, onlyInScript, verdict });

    if (stylesheet.version === null) return report('no-version', strings.diagnosticsNoVersion);
    const order = compareVersions(stylesheet.version, script.version ?? '');
    if (order === null || order === 0) {
        if (onlyInStylesheet.length === 0 && onlyInScript.length === 0) return report('match', strings.diagnosticsMatch);
        return report('themes-differ', strings.diagnosticsThemesDiffer(stylesheet.version));
    }
    if (order < 0) return report('stylesheet-behind', strings.diagnosticsStylesheetBehind(stylesheet.version, script.version ?? ''));
    return report('script-behind', strings.diagnosticsScriptBehind(stylesheet.version, script.version ?? ''));
}

/**
 * The same judgement, over the page this runs on.
 *
 * @param {{ root?: Element, strings?: import('../strings.js').Strings }} [options]
 * @returns {Report}
 */
export function diagnostics({ root, strings } = {}) {
    return diagnose(stylesheetSide({ root }), scriptSide(), strings ?? getStrings());
}
