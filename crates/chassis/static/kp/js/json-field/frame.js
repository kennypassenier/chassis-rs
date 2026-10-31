// Builds a JSON field's frame: the tools, the gutter, the status and help lines, the wrap mirror, and the four tool buttons.

/** An element with a class. @param {Document} doc @param {string} tag @param {string} className */
function make(doc, tag, className) {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
}

/** One tool button. @param {Document} doc @param {string} label @param {string} which */
function tool(doc, label, which) {
    const b = /** @type {HTMLButtonElement} */ (doc.createElement('button'));
    b.type = 'button';
    b.className = 'kp-button kp-button--sm kp-button--ghost';
    b.dataset.kpJsonTool = which;
    b.textContent = label;
    return b;
}

/** The four tools: Format, Minify, Wrap and Copy with its three words. @param {Document} doc @param {import('../strings.js').Strings} strings @param {boolean} wrap */
function buildTools(doc, strings, wrap) {
    const tools = make(doc, 'div', 'kp-jsonfield__tools');
    const toolFormat = tool(doc, strings.jsonFormat, 'format');
    const toolMinify = tool(doc, strings.jsonMinify, 'minify');
    const toolWrap = tool(doc, strings.jsonWrap, 'wrap');
    toolWrap.setAttribute('aria-pressed', String(wrap));
    const toolCopy = tool(doc, '', 'copy');
    const word = make(doc, 'span', 'kp-code__word');
    word.setAttribute('data-kp-code-words', [strings.jsonCopy, strings.copied, strings.copyBlocked].join('\n'));
    word.textContent = strings.jsonCopy;
    toolCopy.append(word);
    tools.append(toolFormat, toolMinify, toolWrap, toolCopy);
    return { tools, toolFormat, toolMinify, toolWrap, word };
}

/**
 * The frame of a field: the gutter, the textarea's place, and under them the status and the help.
 * @param {Document} doc
 * @param {string} id the field's id, the stem of its status and help ids
 * @param {import('../strings.js').Strings} strings
 * @param {{ wrap: boolean, gutter: boolean }} look
 */
export function buildFrame(doc, id, strings, { wrap, gutter: gutterOn }) {
    const root = make(doc, 'div', 'kp-jsonfield');
    root.setAttribute('data-kp-json-wrap', String(wrap));
    root.toggleAttribute('data-kp-json-gutter', gutterOn);
    const tools = buildTools(doc, strings, wrap);
    const frame = make(doc, 'div', 'kp-jsonfield__frame');
    const gutter = make(doc, 'div', 'kp-jsonfield__gutter');
    gutter.setAttribute('aria-hidden', 'true');
    gutter.setAttribute('data-label', strings.jsonGutter);
    const numbers = make(doc, 'div', 'kp-jsonfield__numbers');
    gutter.append(numbers);
    const status = make(doc, 'p', 'kp-jsonfield__status');
    status.id = `${id}-status`;
    status.setAttribute('role', 'status');
    const help = make(doc, 'p', 'kp-jsonfield__help kp-field__help');
    help.id = `${id}-help`;
    help.textContent = strings.jsonTabHint;
    const mirror = make(doc, 'div', 'kp-jsonfield__mirror');
    mirror.setAttribute('aria-hidden', 'true');
    return { root, frame, gutter, numbers, status, help, mirror, ...tools };
}
