// Which half is behind [TH97, S29, AR25].
//
// The fault, in Kenny's words after opening almanac.kp-soft.dev on
// 2026-09-05: none of the thirteen new themes worked and all eleven old
// ones did. Nothing was broken. The page had vendored a css/themes.css
// that knows twenty-four themes beside a js/ that knows eleven, and the
// eleven that both halves knew were exactly the ones that worked.
//
// No gate in this repository can see that. A gate comparing
// js/theme-registry.js with package.json compares two files from the same
// commit and passes by construction; the mismatch exists only where the
// two files arrived separately, which is a consumer's page. So the
// comparison is built to run there: the generated stylesheet declares
// `--kp-themes-version` and `--kp-themes-names` on `:root` (AR10, amended
// by AR25), the registry carries `VERSION` and `THEMES`, and this module
// reads both and says which one is older.
//
// Everything here is pure except the two functions that touch the
// document, and those take the document they touch [KT6]. `diagnose` is a
// function of its two arguments and nothing else, which is what lets a
// test hand it a deliberately mismatched pair and measure the verdict
// instead of trusting it.
//
// Every sentence it produces comes from js/strings.js [KT5].

// The module is a facade [closure-pattern B, Kenny 2026-10-30]: a pure library with no element to look after, split by responsibility
// into js/diagnostics/ (sides.js, compare.js, report.js, render.js), listed in js/README.md.

export { VERSION_PROPERTY, NAMES_PROPERTY, stylesheetSide, scriptSide } from './diagnostics/sides.js';
export { compareVersions } from './diagnostics/compare.js';
export { diagnose, diagnostics } from './diagnostics/report.js';
export { renderDiagnostics } from './diagnostics/render.js';

/**
 * @typedef {object} Side
 * @property {string | null} version the version this half was generated from, or null when it does not say
 * @property {string[]} themes the theme names this half knows
 * @property {string[]} [unknownEffects] the hook values js/effects.js reported as unknown on this page [AR44]
 */

/**
 * @typedef {object} Report
 * @property {'match' | 'stylesheet-behind' | 'script-behind' | 'themes-differ' | 'no-version'} status
 * @property {Side} stylesheet
 * @property {Side} script
 * @property {string[]} onlyInStylesheet themes the stylesheet has and the JavaScript does not
 * @property {string[]} onlyInScript themes the JavaScript has and the stylesheet does not
 * @property {string} verdict one sentence, from the dictionary, saying which half is behind
 */
