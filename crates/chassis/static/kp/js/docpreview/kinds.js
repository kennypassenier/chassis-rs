// Pure: the kind of glyph a name means, the plain name of a file, and what a preview draws a file as.

import { EXTENSIONS } from './values.js';

/** The kind of glyph a file name or type means. Pure. @param {string} nameOrType */
export function docKindOf(nameOrType) {
    const t = nameOrType.toLowerCase();
    const ext = t.includes('/') ? t : (t.split('?')[0].split('#')[0].split('.').pop() ?? '');
    if (/pdf/.test(ext)) return 'pdf';
    if (/^(docx?|odt|rtf)$|msword|wordprocessing/.test(ext)) return 'doc';
    if (/^(xlsx?|ods|csv)$|spreadsheet|ms-excel/.test(ext)) return 'sheet';
    if (/^(png|jpe?g|gif|webp|avif|svg)$|^image\//.test(ext)) return 'image';
    if (/^(txt|md|log|json|html?)$|^text\//.test(ext)) return 'text';
    return 'unknown';
}

/** The plain name of a file: the last part of the address, decoded, no query. Pure. @param {string} url */
export function plainFileName(url) {
    const last = url.split('#')[0].split('?')[0].split('/').filter(Boolean).pop() ?? url;
    try {
        return decodeURIComponent(last);
    } catch {
        return last;
    }
}

/** What the preview should draw a file as. Pure over the extension. @param {string} url @param {string} [contentType] */
export function previewTypeOf(url, contentType = '') {
    const ext = (url.split('#')[0].split('?')[0].split('.').pop() ?? '').toLowerCase();
    if (EXTENSIONS[ext]) return EXTENSIONS[ext];
    if (/pdf/i.test(contentType)) return 'pdf';
    if (/^image\//i.test(contentType)) return 'image';
    if (/^text\//i.test(contentType)) return 'text';
    return 'pdf';
}
