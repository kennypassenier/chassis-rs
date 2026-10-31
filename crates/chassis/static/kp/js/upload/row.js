// The default row of one file: its name, its size, a progress bar that is also a number, a message and a named remove button.

import { getStrings } from '../strings.js';
import { formatBytes } from '../locale.js';
import { PERCENT } from './values.js';

/** A progress bar that is also a number: a bar alone tells a screen reader nothing, and aria-valuenow is what makes it a measurement rather than a decoration. @param {File} file @param {import('../strings.js').Strings} s */
function buildBar(file, s) {
    const bar = document.createElement('span');
    bar.className = 'kp-upload__bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(PERCENT));
    bar.setAttribute('aria-valuenow', '0');
    bar.setAttribute('aria-label', s.uploadProgress(file.name));
    return bar;
}

/**
 * @param {File} file
 * @param {{ locale: string, removeClassName: string, glyph: string }} look
 */
export function buildRow(file, { locale, removeClassName, glyph }) {
    const s = getStrings();
    const item = document.createElement('li');
    item.className = 'kp-upload__file';
    item.dataset.kpUploadFile = file.name;
    item.dataset.state = 'waiting';

    const name = document.createElement('span');
    name.className = 'kp-upload__name';
    name.textContent = file.name;

    const size = document.createElement('span');
    size.className = 'kp-upload__size';
    size.textContent = formatBytes(file.size, locale);

    const bar = buildBar(file, s);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = removeClassName;
    // Named, not a bare glyph: a column of identical buttons is
    // useless to anyone who cannot see which row they are in.
    remove.setAttribute('aria-label', s.removeNamed(file.name));
    remove.textContent = glyph;
    remove.dataset.kpUploadRemove = '';

    const message = document.createElement('span');
    message.className = 'kp-upload__message';
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');

    item.append(name, size, bar, message, remove);
    return item;
}
