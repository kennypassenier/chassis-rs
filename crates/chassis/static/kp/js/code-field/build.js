// The code field's chrome: the gutter, the tools, the readout, the status and the mirror that measures wrapped lines, put around the textarea.

/** @typedef {import('../strings.js').Strings} Strings */

/**
 * @param {Document} doc @param {Strings} strings @param {string} id @param {boolean} wrap @param {boolean} gutterOn
 */
export function buildChrome(doc, strings, id, wrap, gutterOn) {
    const root = doc.createElement('div');
    root.className = 'kp-jsonfield kp-codefield';
    root.setAttribute('data-kp-json-wrap', String(wrap));
    root.toggleAttribute('data-kp-json-gutter', gutterOn);
    const tools = doc.createElement('div');
    tools.className = 'kp-jsonfield__tools';
    const frame = doc.createElement('div');
    frame.className = 'kp-jsonfield__frame';
    const gutter = doc.createElement('div');
    gutter.className = 'kp-jsonfield__gutter';
    gutter.setAttribute('aria-hidden', 'true');
    gutter.setAttribute('data-label', strings.jsonGutter);
    const numbers = doc.createElement('div');
    numbers.className = 'kp-jsonfield__numbers';
    gutter.append(numbers);
    const status = doc.createElement('p');
    status.className = 'kp-jsonfield__status';
    status.id = `${id}-status`;
    status.setAttribute('role', 'status');
    const readout = doc.createElement('p');
    readout.className = 'kp-codefield__readout kp-field__help';
    readout.id = `${id}-readout`;
    const help = doc.createElement('p');
    help.className = 'kp-jsonfield__help kp-field__help';
    help.id = `${id}-help`;
    help.textContent = strings.jsonTabHint;
    const mirror = doc.createElement('div');
    mirror.className = 'kp-jsonfield__mirror';
    mirror.setAttribute('aria-hidden', 'true');
    const word = fillTools(doc, strings, tools, wrap);
    return { root, tools, frame, gutter, numbers, status, readout, help, mirror, word };
}

/** The wrap and copy tools in the tools bar; returns the word of the copy tool, which says how the copy went. @param {Document} doc @param {Strings} strings @param {HTMLElement} tools @param {boolean} wrap */
function fillTools(doc, strings, tools, wrap) {
    const toolWrap = buildTool(doc, strings.jsonWrap, 'wrap');
    toolWrap.setAttribute('aria-pressed', String(wrap));
    const toolCopy = buildTool(doc, '', 'copy');
    const word = doc.createElement('span');
    word.className = 'kp-code__word';
    word.setAttribute('data-kp-code-words', [strings.jsonCopy, strings.copied, strings.copyBlocked].join('\n'));
    word.textContent = strings.jsonCopy;
    toolCopy.append(word);
    tools.append(toolWrap, toolCopy);
    return word;
}

/** @param {Document} doc @param {string} label @param {string} which */
function buildTool(doc, label, which) {
    const b = /** @type {HTMLButtonElement} */ (doc.createElement('button'));
    b.type = 'button';
    b.className = 'kp-button kp-button--sm kp-button--ghost';
    b.dataset.kpCodeTool = which;
    b.textContent = label;
    return b;
}

/**
 * Put the chrome around the textarea and describe the textarea by its readout, status and help.
 * @param {HTMLTextAreaElement} area @param {ReturnType<typeof buildChrome>} ui
 * @returns {string | null} what `aria-describedby` was before, for the undo
 */
export function mountChrome(area, ui) {
    const { root, tools, frame, gutter, mirror, readout, status, help } = ui;
    area.before(root);
    frame.append(gutter, area, mirror);
    root.append(tools, frame, readout, status, help);
    const describedBefore = area.getAttribute('aria-describedby');
    area.setAttribute('aria-describedby', [describedBefore, readout.id, status.id, help.id].filter(Boolean).join(' '));
    area.setAttribute('spellcheck', 'false');
    area.setAttribute('autocapitalize', 'off');
    area.setAttribute('autocomplete', 'off');
    area.classList.add('kp-jsonfield__input');
    return describedBefore;
}
