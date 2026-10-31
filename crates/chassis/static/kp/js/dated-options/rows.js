// What each option says: its name, its age line, the newest, and the meta column and name line that both drawings share.

import { rangeMoment } from '../range.js';
import { datedAge } from './time.js';

/** The moment of an option in ms, or NaN. @param {import('./constants.js').DatedOption} o */
export const stamp = (o) => (o.when === undefined ? NaN : new Date(o.when).getTime());

/** The option's first line: its name, or its date. @param {import('./controller.js').DatedController} c @param {import('./constants.js').DatedOption} o */
export const titleOf = (c, o) => o.label ?? (Number.isNaN(stamp(o)) ? o.value : rangeMoment(stamp(o), c.settings.zone));

/** The second line: how long ago, with the date when the first line is a name. @param {import('./controller.js').DatedController} c @param {import('./constants.js').DatedOption} o */
export function hintOf(c, o) {
    if (o.disabled) return o.disabled;
    const t = stamp(o);
    if (Number.isNaN(t)) return '';
    const age = datedAge(t, c.settings.now(), c.strings);
    return o.label ? `${age} · ${rangeMoment(t, c.settings.zone)}` : age;
}

/** The newest dated option shown, or null. @param {import('./constants.js').DatedOption[]} shown */
export function newestOf(shown) {
    const dated = shown.filter((o) => !Number.isNaN(stamp(o)));
    return dated.length ? dated.reduce((a, b) => (stamp(b) > stamp(a) ? b : a)) : null;
}

/** The meta column's node: one text is one span, several are one box of spans; none is nothing [wish-1120, homelab 101]. @param {Document} doc @param {import('./constants.js').DatedOption} o */
export function metaOf(doc, o) {
    const texts = (Array.isArray(o.meta) ? o.meta : [o.meta]).filter((t) => typeof t === 'string' && t !== '');
    if (!texts.length) return null;
    const one = (/** @type {string} */ text) => {
        const span = doc.createElement('span');
        span.className = 'kp-dated__meta';
        span.textContent = text;
        return span;
    };
    if (texts.length === 1) return one(texts[0]);
    const box = doc.createElement('span');
    box.className = 'kp-dated__meta kp-dated__metas';
    box.append(...texts.map((t) => one(t)));
    return box;
}

/** The name, and the "Latest" badge on the newest. @param {import('./controller.js').DatedController} c @param {HTMLElement} parent @param {import('./constants.js').DatedOption} o */
export function nameLine(c, parent, o) {
    const doc = c.host.ownerDocument;
    const text = doc.createElement('span');
    text.className = 'kp-dated__name';
    text.textContent = titleOf(c, o);
    parent.append(text);
    if (c.settings.latestOn && newestOf(c.shown) === o) {
        const badge = doc.createElement('span');
        badge.className = 'kp-badge kp-badge--info kp-dated__latest';
        badge.textContent = c.strings.datedLatest;
        parent.append(badge);
    }
}
