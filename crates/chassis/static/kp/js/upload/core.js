// One upload's state and its rows: the limits it read, the rows and the files they stand for, and the taking of files (refusing each with its reason on its own row).

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { formatBytes, resolveLocale } from '../locale.js';
import { acceptsFile } from './accepts.js';
import { setError } from './item.js';
import { buildRow } from './row.js';
import { FILE_EVENT, REJECT_EVENT, REMOVE_CLASS, REMOVE_GLYPH, UPLOAD_INPUT, UPLOAD_LIST, UPLOAD_ZONE } from './values.js';

/**
 * @typedef {object} UploadOptions
 * @property {string} [locale]
 * @property {import('../upload.js').Validator} [validate]
 * @property {(file: File) => HTMLElement} [renderRow]
 * @property {boolean} [drop]
 * @property {string} [removeLabel]
 * @property {string} [removeClassName]
 */

export class UploadCore extends Controller {
    /**
     * @param {HTMLElement} host the upload
     * @param {UploadOptions} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        this.cfg = options;
        this.input = /** @type {HTMLInputElement} */ (host.querySelector(UPLOAD_INPUT));
        this.zone = /** @type {HTMLElement} */ (host.querySelector(UPLOAD_ZONE));
        this.list = /** @type {HTMLElement} */ (host.querySelector(UPLOAD_LIST));
        this.locale = resolveLocale(host.dataset.kpLocale ?? options.locale, host);
        this.maxBytes = Number.parseInt(host.dataset.kpMaxBytes ?? '', 10) || Infinity;
        this.maxFiles = Number.parseInt(host.dataset.kpMaxFiles ?? '', 10) || Infinity;
        this.maxTotal = Number.parseInt(host.dataset.kpMaxTotal ?? '', 10) || Infinity;
        this.dropping = host.dataset.kpDrop === undefined ? (options.drop ?? true) : host.dataset.kpDrop !== 'false';
        /** The rows and the files they stand for. @type {Map<HTMLElement, File>} */
        this.rows = new Map();
    }

    /** @param {File} file */
    row(file) {
        const { renderRow, removeLabel, removeClassName = REMOVE_CLASS } = this.cfg;
        if (renderRow !== undefined) return renderRow(file);
        return buildRow(file, { locale: this.locale, removeClassName, glyph: this.host.dataset.kpRemoveGlyph ?? removeLabel ?? REMOVE_GLYPH });
    }

    /** @param {File} file @param {string} reason @param {string} text */
    reject(file, reason, text) {
        // Refused per file, with the reason on the row rather than in one message about "some files": a list that says which one
        // is wrong is the whole point of a list.
        const item = this.row(file);
        setError(item, text);
        this.list.append(item);
        this.rows.set(item, file);
        this.host.dispatchEvent(new CustomEvent(REJECT_EVENT, { bubbles: true, detail: { file, reason, item } }));
    }

    /**
     * Why a file is refused, or null: too many, too large, too large with the others, the wrong type, or the page's own validator.
     * @param {File} file @param {File[]} accepted the files already taken
     * @returns {{ reason: string, text: string } | null}
     */
    refusal(file, accepted) {
        const s = getStrings();
        const { maxFiles, maxBytes, maxTotal, locale } = this;
        if (accepted.length >= maxFiles) return { reason: 'too-many', text: s.uploadTooMany(maxFiles) };
        if (file.size > maxBytes) return { reason: 'too-large', text: s.uploadTooLarge(formatBytes(maxBytes, locale)) };
        if (accepted.reduce((sum, f) => sum + f.size, 0) + file.size > maxTotal) return { reason: 'total-too-large', text: s.uploadTotalTooLarge(formatBytes(maxTotal, locale)) };
        if (this.input.accept && !acceptsFile(file, this.input.accept)) return { reason: 'wrong-type', text: s.uploadWrongType(this.input.accept) };
        const custom = this.cfg.validate?.(file, accepted) ?? null;
        return custom === null ? null : { reason: custom, text: custom };
    }

    /** @param {FileList | File[]} files */
    take(files) {
        for (const file of files) {
            const accepted = [...this.rows.entries()].filter(([item]) => item.dataset.state !== 'error').map(([, f]) => f);
            const refused = this.refusal(file, accepted);
            if (refused) {
                this.reject(file, refused.reason, refused.text);
                continue;
            }
            const item = this.row(file);
            this.list.append(item);
            this.rows.set(item, file);
            this.host.dispatchEvent(new CustomEvent(FILE_EVENT, { bubbles: true, detail: { file, item } }));
        }
    }

    /** Take every row out. */
    clear() {
        for (const item of this.rows.keys()) item.remove();
        this.rows.clear();
    }
}
