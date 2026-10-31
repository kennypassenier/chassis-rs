// A live sheet kept filled from the registry, and fresh each time it opens.

import { Controller } from '../controller.js';
import { renderSheet } from './sheet.js';

/** @typedef {import('./board.js').ShortcutBoard} ShortcutBoard */

export class LiveSheet extends Controller {
    connect() {
        const sheet = this.host;
        /** @type {ShortcutBoard} */
        const board = /** @type {any} */ (this.options).board;
        sheet.dataset.kpShortcutsLiveAttached = '';
        this.own(() => {
            sheet.querySelector('[data-kp-shortcuts-body]')?.remove();
            delete sheet.dataset.kpShortcutsLiveAttached;
        });
        this.listen(sheet, 'kp-palette-open', () => renderSheet(board, sheet));
        renderSheet(board, sheet);
    }
}
