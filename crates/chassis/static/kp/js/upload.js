// File drop and upload, framework-free [TH44].
//
// The appearance and the states; the sending stays the consumer's. What
// this owns is the drop zone, the list, and the per-file state — what it
// deliberately does not own is the request, because every application
// sends files differently and a component that also owned that would have
// to know the endpoint, the auth and the retry policy.
//
//   <div class="kp-upload" data-kp-upload data-kp-max-bytes="5000000" data-kp-max-files="5">
//     <input type="file" multiple accept="image/*" data-kp-upload-input class="kp-sr-only" id="files" />
//     <label class="kp-upload__zone" for="files" data-kp-upload-zone>
//       Drop files here or choose them
//     </label>
//     <ul class="kp-upload__list" data-kp-upload-list></ul>
//   </div>
//
// The zone is a <label> pointing at a real file input, which is the whole
// accessibility story: Tab reaches the input, Enter opens the picker, and
// a screen reader announces a file field rather than a mysterious box.
// The dropping is added on top and is nobody's only route in.
//
// Each file becomes a row the consumer drives: setProgress(), setDone()
// and setError() are exported because the consumer owns the request and
// therefore owns the numbers and the outcome. Progress is written as a
// percentage on `--kp-progress`, so the bar needs no second element.
//
// Since 3.0.0 [KT6]: the input's own `accept` is honoured, a file count
// and a total size can be capped, a validator can refuse anything else,
// the row can be the consumer's own (`renderRow`), removal is an event
// that can be cancelled, sizes print in the page's locale, and detach
// removes the rows attach created.

import { getStrings } from './strings.js';
import { formatBytes, resolveLocale } from './locale.js';

const UPLOAD = '[data-kp-upload]';

/** Fired for each accepted file. A contract value [TH26]: the detail carries the File and its row. */
export const FILE_EVENT = 'kp-upload-file';
/** Fired for a file the zone refused: `{ file, reason, item }`. */
export const REJECT_EVENT = 'kp-upload-reject';
/** Fired on the row before it is removed, cancelable: `{ file, item }`. */
export const REMOVE_EVENT = 'kp-upload-remove';

/** @typedef {'too-large' | 'too-many' | 'total-too-large' | 'wrong-type' | string} RejectReason */
/** @typedef {(file: File, accepted: File[]) => RejectReason | null} Validator */

/** Does a file satisfy an `accept` list? Same rules as the file picker's own. @param {File} file @param {string} accept */
export function acceptsFile(file, accept) {
    const rules = accept
        .split(',')
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean);
    if (rules.length === 0) return true;
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return rules.some((rule) => {
        if (rule.startsWith('.')) return name.endsWith(rule);
        if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
        return type === rule;
    });
}

/**
 * @typedef {object} UploadHandle
 * @property {HTMLElement} element
 * @property {() => File[]} files
 * @property {(files: File[] | FileList) => void} add
 * @property {() => void} clear
 */

/** @type {WeakMap<Element, UploadHandle>} */
const handles = new WeakMap();

/** The handle for an attached upload. @param {Element} element */
export function upload(element) {
    return handles.get(element) ?? null;
}

/**
 * @param {ParentNode} root
 * @param {{ locale?: string, validate?: Validator, renderRow?: (file: File) => HTMLElement, drop?: boolean, removeLabel?: string, removeClassName?: string }} [options]
 *   Defaults; per upload as data-attributes: `data-kp-max-bytes`, `data-kp-max-files`, `data-kp-max-total`, `data-kp-drop="false"`, `data-kp-locale`, and the input's own `accept`.
 * @returns {(() => void) & { handles: UploadHandle[] }} detach
 */
export function attachUploads(
    root = document,
    { locale: localeOption, validate, renderRow, drop = true, removeLabel, removeClassName = 'kp-button kp-button--ghost' } = {},
) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    /** @type {UploadHandle[]} */
    const created = [];

    for (const element of root.querySelectorAll(UPLOAD)) {
        const upload = /** @type {HTMLElement} */ (element);
        if (upload.dataset.kpUploadAttached !== undefined) continue;
        const input = /** @type {HTMLInputElement | null} */ (upload.querySelector('[data-kp-upload-input]'));
        const zone = /** @type {HTMLElement | null} */ (upload.querySelector('[data-kp-upload-zone]'));
        const list = /** @type {HTMLElement | null} */ (upload.querySelector('[data-kp-upload-list]'));
        if (input === null || zone === null || list === null) continue;
        upload.dataset.kpUploadAttached = '';

        const locale = resolveLocale(upload.dataset.kpLocale ?? localeOption, upload);
        const maxBytes = Number.parseInt(upload.dataset.kpMaxBytes ?? '', 10) || Infinity;
        const maxFiles = Number.parseInt(upload.dataset.kpMaxFiles ?? '', 10) || Infinity;
        const maxTotal = Number.parseInt(upload.dataset.kpMaxTotal ?? '', 10) || Infinity;
        const dropping = upload.dataset.kpDrop === undefined ? drop : upload.dataset.kpDrop !== 'false';
        /** @type {Map<HTMLElement, File>} */
        const rows = new Map();

        /** @param {File} file */
        const row = (file) => {
            if (renderRow !== undefined) return renderRow(file);
            const s = getStrings();
            const item = document.createElement('li');
            item.className = 'kp-upload__file';
            item.dataset.kpUploadFile = file.name;
            item.dataset.state = 'waiting';

            const name = document.createElement('span');
            name.className = 'kp-upload__name';
            name.textContent = file.name;

            const size = document.createElement('span');
            size.className = 'kp-upload__size';
            size.textContent = formatBytes(file.size, locale);

            // A progress bar that is also a number: a bar alone tells a
            // screen reader nothing, and aria-valuenow is what makes it
            // a measurement rather than a decoration.
            const bar = document.createElement('span');
            bar.className = 'kp-upload__bar';
            bar.setAttribute('role', 'progressbar');
            bar.setAttribute('aria-valuemin', '0');
            bar.setAttribute('aria-valuemax', '100');
            bar.setAttribute('aria-valuenow', '0');
            bar.setAttribute('aria-label', s.uploadProgress(file.name));

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = removeClassName;
            // Named, not a bare glyph: a column of identical buttons is
            // useless to anyone who cannot see which row they are in.
            remove.setAttribute('aria-label', s.removeNamed(file.name));
            remove.textContent = upload.dataset.kpRemoveGlyph ?? removeLabel ?? '×';
            remove.dataset.kpUploadRemove = '';

            const message = document.createElement('span');
            message.className = 'kp-upload__message';
            message.setAttribute('role', 'status');
            message.setAttribute('aria-live', 'polite');

            item.append(name, size, bar, message, remove);
            return item;
        };

        /** @param {File} file @param {RejectReason} reason @param {string} text */
        const reject = (file, reason, text) => {
            // Refused per file, with the reason on the row rather than in
            // one message about "some files": a list that says which one
            // is wrong is the whole point of a list.
            const item = row(file);
            setError(item, text);
            list.append(item);
            rows.set(item, file);
            upload.dispatchEvent(new CustomEvent(REJECT_EVENT, { bubbles: true, detail: { file, reason, item } }));
        };

        /** @param {FileList | File[]} files */
        const take = (files) => {
            const s = getStrings();
            for (const file of files) {
                const accepted = [...rows.entries()].filter(([item]) => item.dataset.state !== 'error').map(([, f]) => f);
                if (accepted.length >= maxFiles) {
                    reject(file, 'too-many', s.uploadTooMany(maxFiles));
                    continue;
                }
                if (file.size > maxBytes) {
                    reject(file, 'too-large', s.uploadTooLarge(formatBytes(maxBytes, locale)));
                    continue;
                }
                if (accepted.reduce((sum, f) => sum + f.size, 0) + file.size > maxTotal) {
                    reject(file, 'total-too-large', s.uploadTotalTooLarge(formatBytes(maxTotal, locale)));
                    continue;
                }
                if (input.accept && !acceptsFile(file, input.accept)) {
                    reject(file, 'wrong-type', s.uploadWrongType(input.accept));
                    continue;
                }
                const custom = validate?.(file, accepted) ?? null;
                if (custom !== null) {
                    reject(file, custom, custom);
                    continue;
                }
                const item = row(file);
                list.append(item);
                rows.set(item, file);
                upload.dispatchEvent(new CustomEvent(FILE_EVENT, { bubbles: true, detail: { file, item } }));
            }
        };

        const onChange = () => {
            if (input.files !== null) take(input.files);
            // Cleared so the same file can be chosen twice: without this,
            // picking a file, removing it, and picking it again does
            // nothing at all.
            input.value = '';
        };
        /** @param {Event} event */
        const onListClick = (event) => {
            const button = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-kp-upload-remove]'));
            if (button === null) return;
            const item = /** @type {HTMLElement | null} */ (button.closest('li, [data-kp-upload-file]'));
            if (item === null) return;
            // Cancelable: a consumer whose request is in flight aborts it
            // here, or keeps the row.
            const ask = new CustomEvent(REMOVE_EVENT, { bubbles: true, cancelable: true, detail: { file: rows.get(item), item } });
            if (!item.dispatchEvent(ask)) return;
            rows.delete(item);
            item.remove();
        };

        /** @param {DragEvent} event */
        const onDragOver = (event) => {
            event.preventDefault();
            zone.dataset.kpDragging = '';
        };
        /**
         * The zone takes the drag at its first event. Before, only dragover was
         * answered: dragenter went uncancelled and set nothing, and the HTML
         * drag-and-drop model then makes the body the drop target, so the zone
         * need never see a dragover — Kenny dragged a real file over the live
         * zone and saw no change (second nostromo pass, 2026-09-13).
         *
         * @param {DragEvent} event
         */
        const onDragEnter = (event) => {
            event.preventDefault();
            zone.dataset.kpDragging = '';
        };
        /**
         * Leaving for a child of the zone is not leaving: an icon inside a
         * consumer's zone would otherwise switch the state off under the pointer.
         *
         * @param {DragEvent} event
         */
        const onDragLeave = (event) => {
            const to = event.relatedTarget;
            if (to instanceof Node && zone.contains(to)) return;
            delete zone.dataset.kpDragging;
        };
        /** @param {DragEvent} event */
        const onDrop = (event) => {
            event.preventDefault();
            delete zone.dataset.kpDragging;
            const files = event.dataTransfer?.files;
            if (files !== undefined && files.length > 0) take(files);
        };

        input.addEventListener('change', onChange);
        list.addEventListener('click', onListClick);
        if (dropping) {
            zone.addEventListener('dragenter', onDragEnter);
            zone.addEventListener('dragover', onDragOver);
            zone.addEventListener('dragleave', onDragLeave);
            zone.addEventListener('drop', onDrop);
        }

        /** @type {UploadHandle} */
        const handle = {
            element: upload,
            files: () => [...rows.values()],
            add: take,
            clear: () => {
                for (const item of rows.keys()) item.remove();
                rows.clear();
            },
        };
        handles.set(upload, handle);
        created.push(handle);

        cleanups.push(() => {
            input.removeEventListener('change', onChange);
            list.removeEventListener('click', onListClick);
            zone.removeEventListener('dragenter', onDragEnter);
            zone.removeEventListener('dragover', onDragOver);
            zone.removeEventListener('dragleave', onDragLeave);
            zone.removeEventListener('drop', onDrop);
            delete zone.dataset.kpDragging;
            handle.clear();
            handles.delete(upload);
            delete upload.dataset.kpUploadAttached;
        });
    }

    const detach = () => {
        for (const c of cleanups) c();
    };
    return Object.assign(detach, { handles: created });
}

/**
 * Set a file row's progress. Exported because the consumer owns the
 * request and therefore owns the numbers.
 *
 * @param {HTMLElement} item
 * @param {number} percent
 */
export function setProgress(item, percent) {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    item.dataset.state = value >= 100 ? 'done' : 'uploading';
    delete item.dataset.error;
    item.style.setProperty('--kp-progress', `${value}%`);
    /** @type {HTMLElement | null} */ (item.querySelector('[role="progressbar"]'))?.setAttribute('aria-valuenow', String(value));
}

/** Mark a row done, with an optional message. @param {HTMLElement} item @param {string} [message] */
export function setDone(item, message = '') {
    setProgress(item, 100);
    /** @type {HTMLElement | null} */ (item.querySelector('.kp-upload__message'))?.replaceChildren(message);
}

/**
 * Mark a row failed, with the reason where a screen reader will read it.
 *
 * @param {HTMLElement} item
 * @param {string} message
 */
export function setError(item, message) {
    item.dataset.state = 'error';
    item.dataset.error = message;
    /** @type {HTMLElement | null} */ (item.querySelector('.kp-upload__message'))?.replaceChildren(message);
}
