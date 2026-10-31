// The field's measure: line heights (wrapped lines measured in the mirror), the gutter's numbers and the height the box grows to [kpadopt5-r3].

import { FALLBACK_LINE_HEIGHT, JSON_MAX_ROWS } from './constants.js';

/** The line height of the box in px. @param {import('./controller.js').JsonFieldController} c */
export function lineHeight(c) {
    const cs = c.view?.getComputedStyle(c.area);
    const n = Number.parseFloat(cs?.lineHeight ?? '');
    return Number.isFinite(n) ? n : FALLBACK_LINE_HEIGHT;
}

/**
 * The height of each line: one line height, or with wrapping what the line wraps to, measured in the box's own mirror.
 * @param {import('./controller.js').JsonFieldController} c
 * @param {string[]} lines
 * @returns {number[]}
 */
export function lineHeights(c, lines) {
    const lh = lineHeight(c);
    if (!c.wrap) return lines.map(() => lh);
    const { area, doc } = c;
    const { mirror } = c.parts;
    const cs = c.view?.getComputedStyle(area);
    mirror.style.width = `${area.clientWidth}px`;
    mirror.style.font = cs?.font ?? '';
    mirror.style.letterSpacing = cs?.letterSpacing ?? '';
    mirror.style.tabSize = cs?.tabSize ?? '';
    mirror.style.paddingInline = cs?.paddingInline ?? '';
    mirror.replaceChildren(
        ...lines.map((line) => {
            const row = doc.createElement('div');
            row.textContent = line === '' ? ' ' : line;
            return row;
        }),
    );
    return [...mirror.children].map((row) => row.getBoundingClientRect().height || lh);
}

/** Rows of the gutter: one number per line; with wrapping, as tall as the line wraps. @param {import('./controller.js').JsonFieldController} c */
export function drawGutter(c) {
    if (!c.gutterWanted()) return;
    const { area, doc } = c;
    const { numbers, root } = c.parts;
    const lines = area.value.split('\n');
    const heights = lineHeights(c, lines);
    const nodes = lines.map((_, i) => {
        const n = doc.createElement('span');
        n.className = 'kp-jsonfield__number';
        if (i + 1 === c.errorLine) n.classList.add('is-error');
        n.style.blockSize = `${heights[i]}px`;
        n.textContent = String(i + 1);
        return n;
    });
    numbers.replaceChildren(...nodes);
    root.style.setProperty('--kp-json-digits', String(String(lines.length).length));
    numbers.style.transform = `translateY(${-area.scrollTop}px)`;
}

/**
 * The box grows with its text up to JSON_MAX_ROWS lines, then scrolls inside itself (wheel, keys and scrollbar). Its height
 * comes from the lines it holds and the mirror, never from a measuring twin in the page's body: a twin there is hidden by
 * a host that shows only part of the page (the review dialog), measures 0 and left the box at its least height with
 * `overflow: hidden`, so Long could not be scrolled [kpadopt5-r3].
 * @param {import('./controller.js').JsonFieldController} c
 */
export function grow(c) {
    const area = c.area;
    const cs = c.view?.getComputedStyle(area);
    if (!cs) return;
    const lh = lineHeight(c);
    const px = (/** @type {string} */ v) => Number.parseFloat(v) || 0;
    const chrome = px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
    const text = lineHeights(c, area.value.split('\n')).reduce((sum, h) => sum + h, 0);
    // A horizontal scrollbar takes room from the lines: count it, or the last line sits under it.
    const bar = Math.max(0, area.offsetHeight - area.clientHeight - px(cs.borderTopWidth) - px(cs.borderBottomWidth));
    const content = text + chrome + bar;
    const least = c.minRows * lh + chrome;
    const most = Math.max(JSON_MAX_ROWS, c.minRows) * lh + chrome;
    const height = Math.ceil(Math.min(most, Math.max(least, content)));
    area.style.blockSize = `${height}px`;
    area.style.overflowY = content > height + 1 ? 'auto' : 'hidden';
}
