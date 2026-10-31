// A document shown without downloading it, and the small page that means "a document" [kpadopt6-media; JobTracker's dossier Files tab and CV viewer].
//
// Two pieces:
//   kp-docpreview   a PDF (or a picture, or text) opened in the viewer shell (js/viewer.js): the browser's own PDF viewer in a frame, the
//                   stage a busy card while it opens, a plate with the way out when it cannot be shown, and "Open in a new tab" and
//                   Download always in the foot (Kenny, 2026-10-17: show both buttons).
//   kp-docglyph     the page with a folded corner, a few text lines and a small mark for its kind.
//
//   <a href="/files/cv.pdf" data-kp-preview="/files/cv.pdf" data-kp-preview-title="CV Developer NL">CV Developer NL</a>
//   <span class="kp-docglyph" data-kp-doc-kind="pdf" data-kp-size="md"></span>
//
// Options on the opener (markup, each with a default [KT6]; the same names are the options of `openDocPreview(options)`):
//   data-kp-preview            the file's address; empty: the opener is off, with the reason "No file yet"
//   data-kp-preview-type       auto | pdf | image | text                                    auto (by extension, then by Content-Type)
//   data-kp-preview-engine     native | none: the browser's own PDF viewer, or none (then the plate with Open and Download)   native
//   data-kp-preview-size       wide | full                                                    wide
//   data-kp-preview-actions    open download print copy-link                                  open download
//   data-kp-preview-title      the dialog's title                                             the file's plain name
//   data-kp-preview-page       open at this page of a PDF                                     1
//   data-kp-preview-sandbox    strict | off: text is shown with scripts removed               strict for text, off for a PDF and a picture
//   data-kp-preview-group      a name: openers that share it are previous / next in the same shell, with "2 of 5"
//   data-kp-preview-name       the file name a download is saved as
//
// Glyph: `data-kp-size` sm | md | lg, `data-kp-doc-kind` pdf | doc | sheet | image | text | unknown, `data-kp-state` ready | missing,
// `data-kp-doc-lines` 3 to 7 (4; 7 for lg). Keys while a preview is open (the shortcut engine, listed in the `?` sheet): o, d, p, and
// Left / Right between the documents of a group. The facts line (kind, size, made on) comes from a HEAD request when the server
// answers one. Fires `kp-preview-open`, `kp-preview-failed` `{ url, reason }` and `kp-preview-close`. Nothing runs on import.
//
// Each opener is a DocOpener and each glyph a DocGlyph controller; an open preview is one PreviewRun (js/docpreview/run.js over js/docpreview/core.js, on
// js/controller.js; the viewer's dialog is its host). The parts are listed in js/README.md.

import { attachAll } from './controller.js';
import { DocGlyph } from './docpreview/glyph.js';
import { DocOpener } from './docpreview/opener.js';
import { GLYPH_HOSTS, PREVIEW } from './docpreview/values.js';

export { PREVIEW, DOC_GLYPH, DOC_KINDS, PREVIEW_TIMEOUT_MS } from './docpreview/values.js';
export { docKindOf, plainFileName, previewTypeOf } from './docpreview/kinds.js';
export { docGlyph } from './docpreview/glyph.js';
export { openDocPreview } from './docpreview/open.js';

/**
 * @typedef {object} PreviewOptions
 * @property {string} url
 * @property {'auto' | 'pdf' | 'image' | 'text'} [type]
 * @property {'native' | 'none'} [engine]
 * @property {'wide' | 'full'} [size]
 * @property {readonly string[]} [actions] open, download, print, copy-link
 * @property {string} [title]
 * @property {number} [page]
 * @property {'strict' | 'off'} [sandbox]
 * @property {string} [name] the saved file name
 * @property {Element | null} [opener]
 * @property {readonly { url: string, title?: string, name?: string }[]} [group] documents the viewer can step through
 * @property {number} [index] where in the group this one is
 * @property {Document} [doc]
 */

/**
 * Draw every glyph under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachDocGlyphs(root = document) {
    return attachAll(root, GLYPH_HOSTS, DocGlyph);
}

/**
 * Wire every opener under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachDocPreviews(root = document) {
    const stopGlyphs = attachDocGlyphs(root);
    const stopOpeners = attachAll(root, PREVIEW, DocOpener);
    return () => {
        stopGlyphs();
        stopOpeners();
    };
}
