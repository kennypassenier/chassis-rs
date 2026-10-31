// Draws the options as a searchable combobox: the input, the list of two-line options, the live status and the hidden value.

import { attachComboboxes, combobox } from '../combobox.js';
import { hintOf, metaOf, nameLine, titleOf } from './rows.js';

/** One option of the list. @param {import('./controller.js').DatedController} c @param {import('./constants.js').DatedOption} o @param {number} i */
function listItem(c, o, i) {
    const doc = c.host.ownerDocument;
    const li = doc.createElement('li');
    li.className = 'kp-combobox__option kp-dated__item';
    li.id = `${c.settings.id}-option-${i}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.dataset.kpOption = '';
    li.dataset.value = o.value;
    li.dataset.kpLabel = titleOf(c, o);
    if (o.disabled) li.setAttribute('aria-disabled', 'true');
    const first = doc.createElement('span');
    first.className = 'kp-dated__item-name';
    nameLine(c, first, o);
    li.append(first);
    const subText = hintOf(c, o);
    if (subText) {
        const sub = doc.createElement('span');
        sub.className = 'kp-dated__item-hint';
        sub.textContent = subText;
        li.append(sub);
    } else li.dataset.kpNoHint = '';
    const meta = metaOf(doc, o);
    if (meta) li.append(meta);
    return li;
}

/** The input of the combobox. @param {Document} doc @param {import('./controller.js').DatedController} c */
function comboInput(doc, c) {
    const { id, label } = c.settings;
    const input = doc.createElement('input');
    input.className = 'kp-combobox__input';
    input.type = 'text';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', `${id}-list`);
    input.setAttribute('aria-label', label);
    input.setAttribute('autocomplete', 'off');
    input.placeholder = c.strings.datedSearch;
    return input;
}

/** Draw the options as a combobox in the body, and wire it. @param {import('./controller.js').DatedController} c */
export function drawCombobox(c) {
    const doc = c.host.ownerDocument;
    const box = doc.createElement('div');
    box.className = 'kp-combobox kp-dated__combobox';
    box.dataset.kpCombobox = '';
    box.dataset.kpMatch = 'substring';
    const input = comboInput(doc, c);
    const list = doc.createElement('ul');
    list.className = 'kp-combobox__list kp-dated__list';
    list.id = `${c.settings.id}-list`;
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    for (const [i, o] of c.shown.entries()) list.append(listItem(c, o, i));
    const status = doc.createElement('p');
    status.className = 'kp-combobox__status';
    status.dataset.kpComboboxStatus = '';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const hidden = doc.createElement('input');
    hidden.type = 'hidden';
    hidden.name = c.settings.name;
    hidden.className = 'kp-dated__value';
    box.append(input, list, status, hidden);
    c.body.replaceChildren(box);
    c.detachCombobox = attachComboboxes(c.body);
    const handle = combobox(box);
    if (c.chosen !== null) handle?.set([c.chosen]);
    hidden.value = c.chosen ?? '';
}
