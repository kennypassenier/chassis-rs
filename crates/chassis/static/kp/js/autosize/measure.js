// How a growing text box measures: the browser's own sizing with the least and the most set, or the package's sizing from a twin, and the height event.

import { AUTOSIZE_EVENT } from './constants.js';
import { chromeOf, fitTextarea, lineHeightOf } from './fit.js';

// --- Measure. ---
/** Size the box for its text, with the engine in use, and report the height. @param {import('./controller.js').AutosizeController} c */
export function measureArea(c) {
    const area = c.area;
    if (c.state === 'loading') {
        const cs = c.view.getComputedStyle(area);
        area.style.blockSize = `${Math.ceil(c.minRows() * lineHeightOf(cs) + chromeOf(cs))}px`;
        area.style.overflowY = 'hidden';
        return;
    }
    const engine = c.engineInUse();
    area.setAttribute('data-kp-autosize-engine-used', engine);
    if (engine === 'css') measureCss(c);
    else measureJs(c);
}

/** The browser sizes the field; the package says the least and the most, and measures to report. @param {import('./controller.js').AutosizeController} c */
function measureCss(c) {
    const area = c.area;
    const cs = c.view.getComputedStyle(area);
    const lh = lineHeightOf(cs);
    const chrome = chromeOf(cs);
    const rows = c.maxRows();
    const cap = c.phoneCap();
    area.style.blockSize = '';
    area.style.overflowY = '';
    area.style.setProperty('--kp-autosize-min', `${Math.ceil(c.minRows() * lh + chrome)}px`);
    const most = rows === null ? 'none' : `${Math.ceil(Math.min(rows * lh + chrome, cap ?? Number.POSITIVE_INFINITY))}px`;
    area.style.setProperty('--kp-autosize-max', most);
    const result = fitTextarea(area, { minRows: c.minRows(), maxRows: rows, ...(cap !== undefined ? { maxPx: cap } : {}), apply: false });
    report(c, result.height, result.lines, result.capped);
}

/** The package sizes the field itself, from the twin's measure. @param {import('./controller.js').AutosizeController} c */
function measureJs(c) {
    const area = c.area;
    const cap = c.phoneCap();
    area.style.removeProperty('--kp-autosize-min');
    area.style.removeProperty('--kp-autosize-max');
    const result = fitTextarea(area, {
        minRows: c.minRows(),
        maxRows: c.maxRows(),
        ...(cap !== undefined ? { maxPx: cap } : {}),
        keepPx: c.shrinks() ? 0 : c.tallest,
    });
    c.tallest = Math.max(c.tallest, result.height);
    report(c, result.height, result.lines, result.capped);
}

/** Mark the cap, and fire the event when the height changed. @param {import('./controller.js').AutosizeController} c @param {number} height @param {number} lines @param {boolean} capped */
function report(c, height, lines, capped) {
    c.area.toggleAttribute('data-kp-autosize-capped', capped);
    if (height === c.lastHeight) return;
    c.lastHeight = height;
    c.area.dispatchEvent(new CustomEvent(AUTOSIZE_EVENT, { bubbles: true, detail: { height, lines, capped } }));
}
