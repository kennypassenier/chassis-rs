// The report drawn into an element, as a table and one sentence.

import { getStrings } from '../strings.js';
import { diagnose } from './report.js';
import { scriptSide, stylesheetSide } from './sides.js';

/** @typedef {import('../diagnostics.js').Side} Side */
/** @typedef {import('../diagnostics.js').Report} Report */
/** @typedef {import('../strings.js').Strings} Strings */

/** @param {string} label @param {string} left @param {string} right @param {string} key */
function tableRow(label, left, right, key) {
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
}

/** @param {Strings} s */
function tableHead(s) {
    const head = document.createElement('tr');
    for (const label of ['', s.diagnosticsStylesheet, s.diagnosticsScript]) {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = label;
        head.append(th);
    }
    const thead = document.createElement('thead');
    thead.append(head);
    return thead;
}

/** @param {Strings} s @param {Report} report */
function tableBody(s, report) {
    const unknown = s.diagnosticsUnknownVersion;
    const tbody = document.createElement('tbody');
    tbody.append(
        tableRow(s.diagnosticsVersion, report.stylesheet.version ?? unknown, report.script.version ?? unknown, 'version'),
        tableRow(s.diagnosticsThemes, report.stylesheet.themes.join(' '), report.script.themes.join(' '), 'themes'),
        tableRow(
            s.diagnosticsEffects,
            '—',
            report.script.unknownEffects?.length ? report.script.unknownEffects.join(' ') : s.diagnosticsEffectsNone,
            'effects',
        ),
    );
    return tbody;
}

/** @param {Report} report */
function verdictLine(report) {
    const verdict = document.createElement('p');
    verdict.className = report.status === 'match' ? 'kp-alert kp-alert--success' : 'kp-alert kp-alert--warning';
    verdict.dataset.kpDiagnostic = 'verdict';
    verdict.dataset.kpStatus = report.status;
    verdict.textContent = report.verdict;
    return verdict;
}

/** @param {Strings} s @param {Report} report */
function detailList(s, report) {
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
    return detail;
}

/**
 * Render the report into an element, as a table and one sentence.
 *
 * Every side is overridable, which is how the test feeds it a pair it
 * knows to be wrong [KT6]: nothing here reaches for a value it was not
 * given or could not read from the page it was pointed at.
 *
 * @param {Element} target
 * @param {{ root?: Element, stylesheet?: Side, script?: Side, strings?: Strings }} [options]
 * @returns {Report} the report it just drew
 */
export function renderDiagnostics(target, { root, stylesheet, script, strings } = {}) {
    const s = strings ?? getStrings();
    const report = diagnose(stylesheet ?? stylesheetSide({ root }), script ?? scriptSide(), s);
    const heading = document.createElement('h2');
    heading.textContent = s.diagnosticsHeading;
    const table = document.createElement('table');
    table.className = 'kp-table';
    table.append(tableHead(s), tableBody(s, report));
    target.replaceChildren(heading, verdictLine(report), table, detailList(s, report));
    return report;
}
