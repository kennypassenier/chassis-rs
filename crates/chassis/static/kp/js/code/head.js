// The head of a block: its title and meta, and the tools that keep their place in every state (Pretty and Raw, Wrap, Copy).

import { getStrings } from '../strings.js';
import { attachSegmented } from '../segmented.js';
import { make } from './dom.js';
import { isJson, prettyJson } from './language.js';

/** @typedef {import('./controller.js').CodeBlock} CodeBlock */
/** @typedef {import('../strings/types.js').Strings} Strings */

/** The head, made on the first draw (or again when something removed it). @param {CodeBlock} ctl */
function ensureHead(ctl) {
    let head = ctl.head;
    if (head && head.parentElement === ctl.host) return head;
    const doc = ctl.host.ownerDocument;
    head = make(doc, 'kp-code__head', 'figcaption');
    const heading = make(doc, 'kp-code__heading');
    const tools = make(doc, 'kp-code__tools', 'div');
    const status = make(doc, 'kp-sr-only');
    status.setAttribute('role', 'status');
    head.append(heading, tools, status);
    ctl.host.prepend(head);
    ctl.head = head;
    return head;
}

/** The title, and the line of language, lines and size under it. @param {CodeBlock} ctl @param {HTMLElement} head @param {string | null} pretty @param {boolean} ready */
function drawHeading(ctl, head, pretty, ready) {
    const doc = ctl.host.ownerDocument;
    const strings = getStrings();
    const { spec } = ctl;
    const heading = /** @type {HTMLElement} */ (head.querySelector('.kp-code__heading'));
    const title = make(doc, 'kp-code__title');
    title.textContent = spec.title ?? spec.language ?? strings.codeLabel;
    const meta = make(doc, 'kp-code__meta');
    const lineCount = ready ? (ctl.layout === 'pretty' && pretty !== null ? pretty : (spec.text ?? '')).split('\n').length : 0;
    meta.textContent = [spec.title ? spec.language : '', ready ? strings.codeLines(lineCount) : '', spec.size ?? ''].filter(Boolean).join(' · ');
    heading.replaceChildren(title, meta);
}

/** The Pretty and Raw choice, a segmented control made on first need. @param {CodeBlock} ctl @param {HTMLElement} tools @param {string | null} pretty */
function jsonTool(ctl, tools, pretty) {
    const doc = ctl.host.ownerDocument;
    const strings = getStrings();
    let group = /** @type {HTMLElement | null} */ (tools.querySelector('.kp-segmented'));
    if (!group) {
        group = make(doc, 'kp-segmented', 'div');
        group.setAttribute('data-kp-segmented', 'single');
        group.setAttribute('role', 'radiogroup');
        for (const value of /** @type {const} */ (['pretty', 'raw'])) {
            const item = make(doc, 'kp-segmented__item', 'button');
            item.setAttribute('type', 'button');
            item.setAttribute('role', 'radio');
            item.dataset.value = value;
            item.append(make(doc, 'kp-segmented__label'));
            group.append(item);
        }
    }
    group.setAttribute('aria-label', strings.codeFormat);
    for (const item of /** @type {NodeListOf<HTMLElement>} */ (group.querySelectorAll('.kp-segmented__item'))) {
        const value = item.dataset.value;
        /** @type {HTMLElement} */ (item.firstElementChild).textContent = value === 'pretty' ? strings.codePretty : strings.codeRaw;
        item.setAttribute('aria-checked', String(value === ctl.layout));
    }
    if (pretty === null) group.setAttribute('aria-disabled', 'true');
    else group.removeAttribute('aria-disabled');
    return group;
}

/** The Wrap toggle; a table cell has none. @param {CodeBlock} ctl @param {HTMLElement} tools @param {boolean} ready */
function wrapTool(ctl, tools, ready) {
    if (ctl.cell) return null;
    let wrap = /** @type {HTMLButtonElement | null} */ (tools.querySelector('[data-kp-code-tool="wrap"]'));
    if (!wrap) {
        wrap = /** @type {HTMLButtonElement} */ (make(ctl.host.ownerDocument, 'kp-button', 'button'));
        wrap.type = 'button';
        wrap.dataset.kpCodeTool = 'wrap';
    }
    wrap.textContent = getStrings().codeWrap;
    wrap.setAttribute('aria-pressed', String(ctl.wrap));
    wrap.disabled = !ready;
    return wrap;
}

/** The Copy button, whose word changes in the width the longest word keeps. @param {CodeBlock} ctl @param {HTMLElement} tools @param {boolean} ready */
function copyTool(ctl, tools, ready) {
    const strings = getStrings();
    let copy = /** @type {HTMLButtonElement | null} */ (tools.querySelector('[data-kp-code-tool="copy"]'));
    if (!copy) {
        copy = /** @type {HTMLButtonElement} */ (
            make(ctl.host.ownerDocument, ctl.cell ? 'kp-button kp-button--sm kp-button--ghost' : 'kp-button', 'button')
        );
        copy.type = 'button';
        copy.dataset.kpCodeTool = 'copy';
        copy.append(make(ctl.host.ownerDocument, 'kp-code__word'));
    }
    const word = /** @type {HTMLElement} */ (copy.firstElementChild);
    word.setAttribute('data-kp-code-words', [strings.copy, strings.copied, strings.copyBlocked].join('\n'));
    if (!copy.hasAttribute('data-kp-code-copied')) word.textContent = strings.copy;
    copy.disabled = !ready;
    return copy;
}

/** Draw (or redraw) the head from the block's state. @param {CodeBlock} ctl */
export function drawHead(ctl) {
    const { spec } = ctl;
    const ready = (spec.state ?? 'ready') === 'ready' && (spec.text ?? '') !== '';
    const pretty = isJson(spec.language) && ready ? prettyJson(spec.text ?? '') : null;
    const head = ensureHead(ctl);
    drawHeading(ctl, head, pretty, ready);
    const tools = /** @type {HTMLElement} */ (head.querySelector('.kp-code__tools'));
    /** @type {HTMLElement[]} */
    const wanted = [];
    if (isJson(spec.language)) wanted.push(jsonTool(ctl, tools, pretty));
    const wrap = wrapTool(ctl, tools, ready);
    if (wrap) wanted.push(wrap);
    if (spec.copy !== false) wanted.push(copyTool(ctl, tools, ready));
    for (const child of [...tools.children]) if (!wanted.includes(/** @type {HTMLElement} */ (child))) child.remove();
    tools.append(...wanted);
    if (isJson(spec.language) && !ctl.segmentedTools.has(tools)) {
        ctl.segmentedTools.add(tools);
        attachSegmented(tools);
    }
    ctl.host.toggleAttribute('data-kp-code-wrap', ctl.wrap);
}
