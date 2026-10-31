// One wired upload: its change, remove and drag-and-drop handling, its handle, and the way it is taken down.

import { leave, leavesState } from '../motion.js';
import { UploadCore } from './core.js';
import { REMOVE_EVENT } from './values.js';

export class UploadZone extends UploadCore {
    /**
     * @param {HTMLElement} host
     * @param {import('./core.js').UploadOptions} [options]
     */
    constructor(host, options) {
        super(host, options);
        /** What the page gets back, the same object every time. @type {import('../upload.js').UploadHandle} */
        this.handle = {
            element: host,
            files: () => [...this.rows.values()],
            add: (files) => this.take(files),
            clear: () => this.clear(),
        };
    }

    connect() {
        const { host, input, list, zone } = this;
        host.dataset.kpUploadAttached = '';
        // Registered first, so they run last on detach: the rows go, then the mark.
        this.own(() => delete host.dataset.kpUploadAttached);
        this.own(() => this.clear());
        this.own(() => delete zone.dataset.kpDragging);
        this.listen(input, 'change', () => this.onChange());
        this.listen(list, 'click', (event) => this.onListClick(event));
        if (!this.dropping) return;
        this.listen(zone, 'dragenter', (event) => this.onDragEnter(/** @type {DragEvent} */ (event)));
        this.listen(zone, 'dragover', (event) => this.onDragOver(/** @type {DragEvent} */ (event)));
        this.listen(zone, 'dragleave', (event) => this.onDragLeave(/** @type {DragEvent} */ (event)));
        this.listen(zone, 'drop', (event) => this.onDrop(/** @type {DragEvent} */ (event)));
    }

    onChange() {
        if (this.input.files !== null) this.take(this.input.files);
        // Cleared so the same file can be chosen twice: without this, picking a file, removing it, and picking it again does
        // nothing at all.
        this.input.value = '';
    }

    /** @param {Event} event */
    onListClick(event) {
        const button = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-kp-upload-remove]'));
        if (button === null) return;
        const item = /** @type {HTMLElement | null} */ (button.closest('li, [data-kp-upload-file]'));
        if (item === null || item.hasAttribute('data-kp-leaving')) return;
        // Cancelable: a consumer whose request is in flight aborts it here, or keeps the row.
        const ask = new CustomEvent(REMOVE_EVENT, { bubbles: true, cancelable: true, detail: { file: this.rows.get(item), item } });
        if (!item.dispatchEvent(ask)) return;
        this.rows.delete(item);
        // A theme that lets a removed part leave first (leavesState()) plays its leave and takes the row out when that is over.
        if (leavesState(item)) {
            item.inert = true;
            void leave(item);
        } else item.remove();
    }

    /**
     * The zone takes the drag at its first event. Before, only dragover was
     * answered: dragenter went uncancelled and set nothing, and the HTML
     * drag-and-drop model then makes the body the drop target, so the zone
     * need never see a dragover — Kenny dragged a real file over the live
     * zone and saw no change (second nostromo pass, 2026-09-13).
     *
     * @param {DragEvent} event
     */
    onDragEnter(event) {
        event.preventDefault();
        this.zone.dataset.kpDragging = '';
    }

    /** @param {DragEvent} event */
    onDragOver(event) {
        event.preventDefault();
        this.zone.dataset.kpDragging = '';
    }

    /**
     * Leaving for a child of the zone is not leaving: an icon inside a
     * consumer's zone would otherwise switch the state off under the pointer.
     *
     * @param {DragEvent} event
     */
    onDragLeave(event) {
        const to = event.relatedTarget;
        if (to instanceof Node && this.zone.contains(to)) return;
        delete this.zone.dataset.kpDragging;
    }

    /** @param {DragEvent} event */
    onDrop(event) {
        event.preventDefault();
        delete this.zone.dataset.kpDragging;
        const files = event.dataTransfer?.files;
        if (files !== undefined && files.length > 0) this.take(files);
    }
}
