// The waiting rows of the loading state: the rows' geometry kept as placeholders.

import { setMeter } from '../kpi.js';
import { make } from './make.js';

/** A line one text line high with the theme's waiting line on its foot. @param {Document} doc @param {string} className */
function waitLine(doc, className) {
    const box = make(doc, `kp-bullets__wait ${className}`);
    box.append(make(doc, 'kp-skeleton'));
    return box;
}

/** One waiting row. @param {Document} doc @param {boolean} leads */
function waitRow(doc, leads) {
    const row = make(doc, 'kp-bullets__row', 'li');
    if (leads) row.append(make(doc, 'kp-idmark kp-idmark--sm kp-skeleton kp-skeleton--block kp-bullets__wait--lead'));
    const what = make(doc, 'kp-bullets__wait--what');
    what.append(waitLine(doc, ''), waitLine(doc, ''));
    const meter = make(doc, 'kp-meter kp-bullets__bar');
    setMeter(meter, { loading: true });
    meter.removeAttribute('role');
    row.append(what, meter, waitLine(doc, 'kp-bullets__wait--figure'));
    return row;
}

/** @param {Document} doc @param {number} count @param {boolean} leads */
export function waitingList(doc, count, leads) {
    const list = make(doc, 'kp-bullets__list', 'ul');
    list.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < count; i += 1) list.append(waitRow(doc, leads));
    return list;
}
