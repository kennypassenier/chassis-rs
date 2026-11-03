// The Markdown editor's toolbar: six tools as the package's small ghost buttons, one tab stop (← → Home End walk it, APG toolbar),
// each named with its shortcut.

import { ariaKeyShortcut, keyLabel } from '../key-spec.js';
import { toolKey } from './keys.js';

/** The tools, in order: the dictionary word of each (its key, for three of them, is in js/markdown-editor/constants.js). */
export const TOOLS = /** @type {const} */ ([
    { id: 'bold', word: 'mdBold' },
    { id: 'italic', word: 'mdItalic' },
    { id: 'heading', word: 'mdHeading' },
    { id: 'list', word: 'mdList' },
    { id: 'task', word: 'mdChecklist' },
    { id: 'link', word: 'mdLink' },
]);

/** The pictures: a letter for bold, italic and heading; a small line drawing in the ink for the rest. */
const SVG = {
    list: '<circle cx="5" cy="7" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="5" cy="17" r="1.5"/><path d="M9.5 7h10M9.5 12h10M9.5 17h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    task: '<rect x="3" y="4.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4.5 7.6l1.3 1.3 2.4-2.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><rect x="3" y="13.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5h8M12 16.5h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    link: '<path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};
const LETTERS = { bold: 'B', italic: 'I', heading: 'H' };
const SVG_NS = 'http://www.w3.org/2000/svg';

/** One tool's picture. @param {Document} doc @param {string} id */
function picture(doc, id) {
    const letter = /** @type {Record<string, string>} */ (LETTERS)[id];
    if (letter) {
        const span = doc.createElement('span');
        span.className = `kp-md-editor__glyph kp-md-editor__glyph--${id}`;
        span.textContent = letter;
        span.setAttribute('aria-hidden', 'true');
        return span;
    }
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'kp-md-editor__icon');
    svg.setAttribute('fill', 'currentColor');
    // A fixed drawing of the package's own, never text from a page.
    svg.innerHTML = /** @type {Record<string, string>} */ (SVG)[id] ?? '';
    return svg;
}

/**
 * The toolbar for a text area.
 * @param {HTMLTextAreaElement} area @param {import('../strings.js').Strings} strings
 * @returns {HTMLElement}
 */
export function buildToolbar(area, strings) {
    const doc = area.ownerDocument;
    const bar = doc.createElement('div');
    bar.className = 'kp-md-editor__toolbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', strings.mdToolbar);
    bar.setAttribute('aria-controls', area.id);
    TOOLS.forEach((tool, index) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'kp-button kp-button--ghost kp-button--sm kp-md-editor__tool';
        button.dataset.kpMdTool = tool.id;
        const name = /** @type {string} */ (strings[tool.word]);
        button.setAttribute('aria-label', name);
        const key = toolKey(area.closest('[data-kp-md-editor]') ?? area, tool.id);
        button.title = key.length > 0 ? strings.mdWithKeys(name, keyLabel(key)) : name;
        if (key.length > 0) button.setAttribute('aria-keyshortcuts', ariaKeyShortcut(key));
        button.tabIndex = index === 0 ? 0 : -1;
        button.append(picture(doc, tool.id));
        bar.append(button);
    });
    return bar;
}

/**
 * ← → Home End move the one tab stop along the toolbar (mirrored right to left).
 * @param {HTMLElement} bar @param {KeyboardEvent} event
 */
export function walkToolbar(bar, event) {
    const tools = /** @type {HTMLElement[]} */ ([...bar.querySelectorAll('[data-kp-md-tool]')]);
    const at = tools.indexOf(/** @type {HTMLElement} */ (event.target));
    if (at < 0) return;
    const rtl = getComputedStyle(bar).direction === 'rtl';
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key];
    const to = step !== undefined ? (at + step + tools.length) % tools.length : event.key === 'Home' ? 0 : event.key === 'End' ? tools.length - 1 : -1;
    if (to < 0) return;
    event.preventDefault();
    for (const tool of tools) tool.tabIndex = -1;
    const next = /** @type {HTMLElement} */ (tools[to]);
    next.tabIndex = 0;
    next.focus();
}
