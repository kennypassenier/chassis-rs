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

import { THEMES, VERSION } from './theme-registry.js';
import { unknownEffects } from './effects.js';
import { getStrings } from './strings.js';

/** The custom property carrying the stylesheet's version [AR25]. */
export const VERSION_PROPERTY = '--kp-themes-version';
/** The custom property carrying the stylesheet's theme names [AR25]. */
export const NAMES_PROPERTY = '--kp-themes-names';

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

/**
 * What getComputedStyle hands back for a custom property: the raw token,
 * leading whitespace and all, quotes included.
 *
 * @param {string | null | undefined} raw
 * @returns {string}
 */
function unquote(raw) {
    const trimmed = (raw ?? '').trim();
    return trimmed.replace(/^['"]/, '').replace(/['"]$/, '').trim();
}

/**
 * Compare two dotted version numbers.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number | null} negative when a is older, 0 when equal, positive when a is newer; null when either is not a version
 */
export function compareVersions(a, b) {
    // `5.0.0-alpha.1` is older than `5.0.0` and newer than `4.0.0`: a
    // pre-release tag sorts below the release it precedes, and its own
    // identifiers compare numerically where both are numbers and by text
    // otherwise (the semver rule) [C6].
    const parse = /** @param {string} v @returns {{ numbers: number[], pre: string[] | null } | null} */ (v) => {
        const m = /^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/.exec(v.trim());
        return m ? { numbers: m[1].split('.').map(Number), pre: m[2] === undefined ? null : m[2].split('.') } : null;
    };
    const left = parse(a);
    const right = parse(b);
    if (left === null || right === null) return null;
    for (let i = 0; i < Math.max(left.numbers.length, right.numbers.length); i++) {
        const diff = (left.numbers[i] ?? 0) - (right.numbers[i] ?? 0);
        if (diff !== 0) return diff;
    }
    if (left.pre === null && right.pre === null) return 0;
    if (left.pre === null) return 1;
    if (right.pre === null) return -1;
    for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
        const l = left.pre[i];
        const r = right.pre[i];
        if (l === undefined) return -1;
        if (r === undefined) return 1;
        const both = /^\d+$/.test(l) && /^\d+$/.test(r);
        const diff = both ? Number(l) - Number(r) : l < r ? -1 : l > r ? 1 : 0;
        if (diff !== 0) return diff;
    }
    return 0;
}

/**
 * What the stylesheet on this page says about itself.
 *
 * A stylesheet older than 3.2.0 declares neither property, and that is
 * information rather than an error: it is older than any JavaScript that
 * can ask the question.
 *
 * @param {{ root?: Element }} [options]
 * @returns {Side}
 */
export function stylesheetSide({ root } = {}) {
    if (typeof document === 'undefined') return { version: null, themes: [] };
    const style = getComputedStyle(root ?? document.documentElement);
    const version = unquote(style.getPropertyValue(VERSION_PROPERTY));
    const names = unquote(style.getPropertyValue(NAMES_PROPERTY));
    return { version: version === '' ? null : version, themes: names === '' ? [] : names.split(/\s+/) };
}

/**
 * What the JavaScript on this page says about itself.
 *
 * @returns {Side}
 */
export function scriptSide() {
    return { version: VERSION, themes: THEMES.map((t) => t.name), unknownEffects: unknownEffects() };
}

/**
 * Lay the two halves beside each other and name the one that is behind.
 *
 * Pure: same arguments, same report, no document and no clock. The test
 * that measures this feeds it a pair it knows to be mismatched, because a
 * verdict that has only ever seen a matching pair has never been read.
 *
 * @param {Side} stylesheet
 * @param {Side} script
 * @param {import('./strings.js').Strings} [strings]
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
 * @param {{ root?: Element, strings?: import('./strings.js').Strings }} [options]
 * @returns {Report}
 */
export function diagnostics({ root, strings } = {}) {
    return diagnose(stylesheetSide({ root }), scriptSide(), strings ?? getStrings());
}

/**
 * Render the report into an element, as a table and one sentence.
 *
 * Every side is overridable, which is how the test feeds it a pair it
 * knows to be wrong [KT6]: nothing here reaches for a value it was not
 * given or could not read from the page it was pointed at.
 *
 * @param {Element} target
 * @param {{ root?: Element, stylesheet?: Side, script?: Side, strings?: import('./strings.js').Strings }} [options]
 * @returns {Report} the report it just drew
 */
export function renderDiagnostics(target, { root, stylesheet, script, strings } = {}) {
    const s = strings ?? getStrings();
    const report = diagnose(stylesheet ?? stylesheetSide({ root }), script ?? scriptSide(), s);
    const unknown = s.diagnosticsUnknownVersion;

    const heading = document.createElement('h2');
    heading.textContent = s.diagnosticsHeading;

    const table = document.createElement('table');
    table.className = 'kp-table';
    /** @param {string} label @param {string} left @param {string} right @param {string} key */
    const row = (label, left, right, key) => {
        const tr = document.createElement('tr');
        tr.dataset.kpDiagnostic = key;
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = label;
        const a = document.createElement('td');
        a.dataset.kpSide = 'stylesheet';
        a.textContent = left;
        const b = document.createElement('td');
        b.dataset.kpSide = 'script';
        b.textContent = right;
        tr.append(th, a, b);
        return tr;
    };
    const head = document.createElement('tr');
    for (const label of ['', s.diagnosticsStylesheet, s.diagnosticsScript]) {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = label;
        head.append(th);
    }
    const thead = document.createElement('thead');
    thead.append(head);
    const tbody = document.createElement('tbody');
    tbody.append(
        row(s.diagnosticsVersion, report.stylesheet.version ?? unknown, report.script.version ?? unknown, 'version'),
        row(s.diagnosticsThemes, report.stylesheet.themes.join(' '), report.script.themes.join(' '), 'themes'),
        row(
            s.diagnosticsEffects,
            '—',
            report.script.unknownEffects?.length ? report.script.unknownEffects.join(' ') : s.diagnosticsEffectsNone,
            'effects',
        ),
    );
    table.append(thead, tbody);

    const verdict = document.createElement('p');
    verdict.className = report.status === 'match' ? 'kp-alert kp-alert--success' : 'kp-alert kp-alert--warning';
    verdict.dataset.kpDiagnostic = 'verdict';
    verdict.dataset.kpStatus = report.status;
    verdict.textContent = report.verdict;

    const detail = document.createElement('ul');
    detail.dataset.kpDiagnostic = 'detail';
    for (const [names, sentence] of /** @type {[string[], (n: string) => string][]} */ ([
        [report.onlyInStylesheet, s.diagnosticsOnlyInStylesheet],
        [report.onlyInScript, s.diagnosticsOnlyInScript],
    ])) {
        if (names.length === 0) continue;
        const li = document.createElement('li');
        li.textContent = sentence(names.join(' '));
        detail.append(li);
    }

    target.replaceChildren(heading, verdict, table, detail);
    return report;
}
