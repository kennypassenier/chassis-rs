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

import { attachOne, controllerOf } from './controller.js';
import { UploadZone } from './upload/controller.js';
import { UPLOAD, UPLOAD_INPUT, UPLOAD_LIST, UPLOAD_ZONE } from './upload/values.js';

export { FILE_EVENT, REJECT_EVENT, REMOVE_EVENT } from './upload/values.js';
export { acceptsFile } from './upload/accepts.js';
export { setProgress, setDone, setError } from './upload/item.js';

/** @typedef {'too-large' | 'too-many' | 'total-too-large' | 'wrong-type' | string} RejectReason */
/** @typedef {(file: File, accepted: File[]) => RejectReason | null} Validator */

/**
 * @typedef {object} UploadHandle
 * @property {HTMLElement} element
 * @property {() => File[]} files
 * @property {(files: File[] | FileList) => void} add
 * @property {() => void} clear
 */

/** The handle for an attached upload. @param {Element} element @returns {UploadHandle | null} */
export function upload(element) {
    return controllerOf(element, UploadZone)?.handle ?? null;
}

/**
 * @param {ParentNode} root
 * @param {import('./upload/core.js').UploadOptions} [options]
 *   Defaults; per upload as data-attributes: `data-kp-max-bytes`, `data-kp-max-files`, `data-kp-max-total`, `data-kp-drop="false"`, `data-kp-locale`, and the input's own `accept`.
 * @returns {(() => void) & { handles: UploadHandle[] }} detach
 */
export function attachUploads(root = document, options = {}) {
    // Below the root only; an upload that is wired, or that lacks its input, zone or list, is left alone.
    const made = [...root.querySelectorAll(UPLOAD)]
        .filter((node) => !node.hasAttribute('data-kp-upload-attached') && node.querySelector(UPLOAD_INPUT) && node.querySelector(UPLOAD_ZONE) && node.querySelector(UPLOAD_LIST))
        .map((node) => attachOne(/** @type {HTMLElement} */ (node), UploadZone, options))
        .filter((controller) => controller !== undefined);
    const detach = () => {
        for (const controller of made) controller.destroy();
    };
    return Object.assign(detach, { handles: made.map((controller) => controller.handle) });
}
