// The keyboard of the field: Esc then Tab leaves it, Tab indents, Shift+Tab takes an indent off, Mod+Shift+F formats.

import { INDENT_WIDE } from './constants.js';

/** Shift+Tab: take one indent off the line the caret is on. @param {import('./controller.js').JsonFieldController} c */
function outdent(c) {
    const area = c.area;
    const { selectionStart: a, selectionEnd: b, value } = area;
    const from = value.lastIndexOf('\n', a - 1) + 1;
    const lineText = value.slice(from);
    const indent = c.indent();
    const strip = lineText.startsWith(indent) ? indent.length : lineText.startsWith('\t') ? 1 : (lineText.match(new RegExp(`^ {1,${INDENT_WIDE}}`))?.[0].length ?? 0);
    if (strip <= 0) return;
    area.setRangeText('', from, from + strip, 'preserve');
    area.setSelectionRange(Math.max(from, a - strip), Math.max(from, b - strip));
    area.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Tab: put one indent at the caret, over the selection. @param {import('./controller.js').JsonFieldController} c */
function indentHere(c) {
    const area = c.area;
    area.setRangeText(c.indent(), area.selectionStart, area.selectionEnd, 'end');
    area.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * The keys of the field.
 * @param {import('./controller.js').JsonFieldController} c
 * @param {KeyboardEvent} event
 */
export function handleKey(c, event) {
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === 'Escape') {
        c.escaped = true;
        return;
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'f' && c.formatOption() !== 'off') {
        event.preventDefault();
        c.format();
        return;
    }
    if (event.key === 'Tab' && !mod && !event.altKey) {
        // Esc, then Tab, leaves the field: the keyboard is never trapped.
        if (c.escaped) {
            c.escaped = false;
            return;
        }
        event.preventDefault();
        if (event.shiftKey) outdent(c);
        else indentHere(c);
        return;
    }
    c.escaped = false;
}
