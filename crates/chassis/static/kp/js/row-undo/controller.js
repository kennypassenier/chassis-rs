// The listener of one attach [ux-1101]: a press on a `[data-kp-row-delete]` control under the root deletes its row with Undo.

import { Controller } from '../controller.js';
import { ROW, ROW_DELETE } from './constants.js';
import { deleteRowWithUndo } from './delete.js';

export class RowUndoRoot extends Controller {
    connect() {
        this.listen(this.host, 'click', (event) => {
            const control = event.target instanceof Element ? /** @type {HTMLElement | null} */ (event.target.closest(ROW_DELETE)) : null;
            if (!control || !this.host.contains(control) || control.matches(':disabled, [aria-disabled="true"]')) return;
            const row = /** @type {HTMLElement | null} */ (control.closest(ROW));
            if (!row) {
                console.warn('kp-row-delete: the control stands in no row (a [data-kp-row-key], a tr or an li)', control);
                return;
            }
            event.preventDefault();
            deleteRowWithUndo(row, { control });
        });
    }
}
