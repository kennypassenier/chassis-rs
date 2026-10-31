// One row of a ready list: its lead, its label and detail, its meter with the threshold's tick, and the exact figure.

import { setMeter } from '../kpi.js';
import { setIdmark } from '../idmark.js';
import { make } from './make.js';
import { bulletTone } from './tone.js';

/** @typedef {import('../bullets.js').BulletRow} BulletRow */
/**
 * @typedef {object} RowContext
 * @property {number} threshold
 * @property {number} max
 * @property {number} [bad]
 * @property {(value: number) => string} format
 * @property {boolean} leads whether any row of the list has a lead, so the others keep its column
 * @property {import('../strings.js').Strings} strings
 */

/** The lead: a name gives an identity mark, a node is used as it is. @param {Document} doc @param {string | Node} value */
function buildLead(doc, value) {
    const lead = make(doc, 'kp-bullets__lead');
    if (typeof value === 'string') {
        const mark = make(doc, 'kp-idmark kp-idmark--sm');
        setIdmark(mark, value);
        lead.append(mark);
    } else lead.append(value);
    return lead;
}

/** The label (a link or a button when the row is one) and the detail line. @param {Document} doc @param {BulletRow} row */
function buildWhat(doc, row) {
    const what = make(doc, 'kp-bullets__what');
    const label = make(doc, 'kp-bullets__label');
    label.title = row.label;
    if (row.href || row.pick) {
        const link = /** @type {HTMLElement} */ (make(doc, 'kp-bullets__link', row.href ? 'a' : 'button'));
        if (row.href) link.setAttribute('href', row.href);
        else link.setAttribute('type', 'button');
        link.dataset.kpBulletsKey = row.key;
        link.textContent = row.label;
        label.append(link);
    } else label.textContent = row.label;
    what.append(label);
    if (row.detail) {
        const detail = make(doc, 'kp-bullets__detail');
        detail.textContent = row.detail;
        detail.title = row.detail;
        what.append(detail);
    }
    return what;
}

/** The bar and the figure of a row; a value of null is a dash and no bar. @param {Document} doc @param {HTMLElement} li @param {BulletRow} row @param {RowContext} ctx @param {'' | 'warning' | 'destructive'} tone */
function appendMeasure(doc, li, row, ctx, tone) {
    const { strings, threshold, max, format } = ctx;
    const figure = make(doc, 'kp-bullets__figure');
    if (row.value == null || !Number.isFinite(row.value)) {
        li.setAttribute('data-kp-bullets-unknown', '');
        const none = make(doc, 'kp-meter kp-bullets__bar kp-bullets__bar-none');
        none.setAttribute('aria-hidden', 'true');
        li.append(none);
        figure.textContent = '—';
        const said = make(doc, 'kp-sr-only');
        said.textContent = strings.bulletsUnknown;
        figure.append(said);
    } else {
        const meter = make(doc, 'kp-meter kp-bullets__bar');
        setMeter(meter, { value: row.value / max, mark: threshold / max, tone: tone || null });
        meter.setAttribute('aria-valuetext', strings.bulletsValueText(row.figure ?? format(row.value), format(threshold)));
        meter.setAttribute('aria-label', row.label);
        li.append(meter);
        figure.textContent = row.figure ?? format(row.value);
    }
    li.append(figure);
}

/** @param {Document} doc @param {BulletRow} row @param {RowContext} ctx */
export function buildRow(doc, row, ctx) {
    const li = make(doc, 'kp-bullets__row', 'li');
    li.dataset.kpBulletsKey = row.key;
    const tone = bulletTone(row.value, ctx.threshold, ctx.bad);
    if (tone) li.setAttribute('data-kp-tone', tone);
    if (row.lead !== undefined) li.append(buildLead(doc, row.lead));
    else if (ctx.leads) li.append(make(doc, 'kp-bullets__lead'));
    li.append(buildWhat(doc, row));
    appendMeasure(doc, li, row, ctx, tone);
    return li;
}
