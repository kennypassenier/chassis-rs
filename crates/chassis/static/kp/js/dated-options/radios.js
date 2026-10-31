// Draws the options as radio rows: one group, two lines per option and the meta values in one column.

import { hintOf, metaOf, nameLine } from './rows.js';

/** One radio row. @param {import('./controller.js').DatedController} c @param {import('./constants.js').DatedOption} o @param {number} i */
function radioRow(c, o, i) {
    const doc = c.host.ownerDocument;
    const { id, name } = c.settings;
    const row = doc.createElement('label');
    row.className = 'kp-field__option kp-dated__option';
    const input = doc.createElement('input');
    input.type = 'radio';
    input.className = 'kp-field__check';
    input.name = name;
    input.value = o.value;
    input.checked = o.value === c.chosen;
    if (o.disabled) {
        input.disabled = true;
        input.setAttribute('aria-describedby', `${id}-hint-${i}`);
    }
    const title = doc.createElement('span');
    title.className = 'kp-field__option-title';
    nameLine(c, title, o);
    const hintText = hintOf(c, o);
    row.append(input, title);
    // No date, no age line, and no empty row left under the name [wish-1120, homelab 101].
    if (hintText) {
        const hint = doc.createElement('span');
        hint.className = 'kp-field__option-hint kp-dated__hint';
        hint.id = `${id}-hint-${i}`;
        hint.textContent = hintText;
        row.append(hint);
    } else row.dataset.kpNoHint = '';
    const meta = metaOf(doc, o);
    if (meta) row.append(meta);
    return row;
}

/** Draw the options as radio rows in the body. @param {import('./controller.js').DatedController} c */
export function drawRadios(c) {
    const doc = c.host.ownerDocument;
    const group = doc.createElement('fieldset');
    group.className = 'kp-fieldset kp-dated__group';
    group.dataset.kpLayout = 'dated';
    const legend = doc.createElement('legend');
    legend.className = 'kp-sr-only';
    legend.textContent = c.settings.label;
    group.append(legend);
    for (const [i, o] of c.shown.entries()) group.append(radioRow(c, o, i));
    c.body.replaceChildren(group);
}
