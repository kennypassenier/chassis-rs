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

import { getStrings } from './strings.js';
import { openViewer } from './viewer.js';
import { agoMoment } from './freshness.js';
import { formatBytes, resolveLocale } from './locale.js';

/** An opener. */
export const PREVIEW = '[data-kp-preview]';
/** A glyph. */
export const DOC_GLYPH = '.kp-docglyph';
/** The kinds of a document glyph. */
export const DOC_KINDS = /** @type {const} */ (['pdf', 'doc', 'sheet', 'image', 'text', 'unknown']);
/** How long a frame may take before the preview is called failed, in ms. */
export const PREVIEW_TIMEOUT_MS = 15000;

const EXTENSIONS = /** @type {Record<string, 'pdf' | 'image' | 'text'>} */ ({
    pdf: 'pdf',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    webp: 'image',
    avif: 'image',
    svg: 'image',
    txt: 'text',
    md: 'text',
    log: 'text',
    csv: 'text',
    json: 'text',
    html: 'text',
});

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
 * Open a document in the viewer.
 * @param {PreviewOptions} options
 * @returns {import('./viewer.js').ViewerHandle}
 */
export function openDocPreview(options) {
    const doc = options.doc ?? document;
    const strings = getStrings();
    const locale = resolveLocale(undefined, doc.documentElement);
    const group = options.group && options.group.length > 1 ? options.group : null;
    let at = Math.max(0, Math.min(options.index ?? 0, (group?.length ?? 1) - 1));
    /** @type {() => void} */
    let stopLoad = () => {};

    /** @param {string} url @param {string} name @returns {import('./viewer.js').ViewerAction[]} */
    const actionsFor = (url, name) =>
        (options.actions ?? ['open', 'download']).map((kind) => ({
            kind,
            href: url,
            name,
            ...(kind === 'print' ? { run: () => printFrame() } : {}),
        }));

    /** @type {HTMLIFrameElement | null} */
    let frame = null;
    const printFrame = () => {
        try {
            frame?.contentWindow?.focus();
            frame?.contentWindow?.print();
        } catch {
            // A frame from another origin cannot be printed from here; "Open in a new tab" is the way.
        }
    };

    const first = group ? group[at] : { url: options.url, title: options.title, name: options.name };
    const viewer = openViewer({
        title: first.title ?? options.title ?? plainFileName(first.url),
        size: options.size ?? 'wide',
        actions: actionsFor(first.url, first.name ?? plainFileName(first.url)),
        className: 'kp-docpreview',
        ...(options.opener !== undefined ? { opener: options.opener } : {}),
        doc,
        keys: [
            {
                keys: 'o',
                what: strings.previewKeyOpen,
                group: strings.previewKeyGroup,
                run: () => {
                    /** @type {HTMLElement | null} */ (viewer.foot.querySelector('[data-kp-viewer-action="open"]'))?.click();
                },
                when: () => viewer.foot.querySelector('[data-kp-viewer-action="open"]') !== null,
            },
            {
                keys: 'd',
                what: strings.previewKeyDownload,
                group: strings.previewKeyGroup,
                run: () => {
                    /** @type {HTMLElement | null} */ (viewer.foot.querySelector('[data-kp-viewer-action="download"]'))?.click();
                },
                when: () => viewer.foot.querySelector('[data-kp-viewer-action="download"]') !== null,
            },
            {
                keys: 'p',
                what: strings.previewKeyPrint,
                group: strings.previewKeyGroup,
                run: () => printFrame(),
                when: () => frame !== null && (options.actions ?? []).includes('print'),
            },
            ...(group
                ? [
                      { keys: 'ArrowLeft', what: strings.previewKeyPrevious, group: strings.previewKeyGroup, run: () => step(-1), when: () => at > 0 },
                      { keys: 'ArrowRight', what: strings.previewKeyNext, group: strings.previewKeyGroup, run: () => step(1), when: () => at < (group?.length ?? 1) - 1 },
                  ]
                : []),
        ],
        onClose: () => {
            stopLoad();
            doc.dispatchEvent(new CustomEvent('kp-preview-close', { bubbles: true, detail: { url: group ? group[at].url : options.url } }));
        },
    });

    /** @param {number} by */
    function step(by) {
        if (!group) return;
        const next = at + by;
        if (next < 0 || next >= group.length) return;
        at = next;
        load();
    }

    function load() {
        stopLoad();
        const entry = group ? group[at] : { url: options.url, title: options.title, name: options.name };
        const url = entry.url;
        const name = entry.name ?? options.name ?? plainFileName(url);
        const page = Math.max(1, Math.floor(options.page ?? 1));
        viewer.setTitle(entry.title ?? options.title ?? plainFileName(url));
        viewer.setActions(actionsFor(url, name));
        viewer.setPosition(group ? { index: at + 1, total: group.length } : null);
        viewer.setFacts('');
        viewer.setContent();
        viewer.setState('loading');
        frame = null;
        let live = true;
        /** @type {number} */
        let timer = 0;
        stopLoad = () => {
            live = false;
            window.clearTimeout(timer);
        };
        const fail = (/** @type {string} */ reason, /** @type {string} */ message) => {
            if (!live) return;
            stopLoad();
            viewer.setContent();
            viewer.setState('error', { message, retry: load });
            doc.dispatchEvent(new CustomEvent('kp-preview-failed', { bubbles: true, detail: { url, reason } }));
        };
        timer = window.setTimeout(() => fail('timeout', strings.previewTimeout), PREVIEW_TIMEOUT_MS);

        void (async () => {
            // What the server says about the file: a missing one is said before a frame shows an error page.
            let contentType = '';
            try {
                const head = await fetch(url, { method: 'HEAD' });
                if (!live) return;
                if (!head.ok) {
                    fail(`status-${head.status}`, head.status === 404 ? strings.previewGone : strings.previewServer(head.status));
                    return;
                }
                contentType = head.headers.get('content-type') ?? '';
                const bytes = Number(head.headers.get('content-length'));
                const made = Date.parse(head.headers.get('last-modified') ?? '');
                const kindWords = { pdf: 'PDF', image: strings.docKindImage, text: strings.docKindText }[previewTypeOf(url, contentType)];
                viewer.setFacts(
                    [kindWords, Number.isFinite(bytes) && bytes > 0 ? formatBytes(bytes, locale, { base: 1024 }) : '', Number.isFinite(made) ? agoMoment(made) : '']
                        .filter(Boolean)
                        .join(' · '),
                );
            } catch {
                // A server that refuses HEAD, or another origin: the frame will say it.
            }
            if (!live) return;
            const wanted = options.type && options.type !== 'auto' ? options.type : previewTypeOf(url, contentType);
            if (wanted === 'pdf' && (options.engine === 'none' || /** @type {any} */ (navigator).pdfViewerEnabled === false)) {
                stopLoad();
                viewer.setDesc('');
                viewer.setState('unsupported', { message: strings.previewNoPdf });
                return;
            }
            viewer.setDesc(wanted === 'pdf' ? strings.previewShownByBrowser : '');
            if (wanted === 'image') {
                const img = doc.createElement('img');
                img.className = 'kp-docpreview__image';
                img.alt = viewer.dialog.querySelector('.kp-viewer__title')?.textContent ?? '';
                img.addEventListener('load', () => {
                    if (!live) return;
                    stopLoad();
                    viewer.setState('ready');
                });
                img.addEventListener('error', () => fail('image', strings.previewImage));
                img.src = url;
                viewer.setContent(img);
                return;
            }
            const frameEl = doc.createElement('iframe');
            frameEl.className = 'kp-docpreview__frame';
            frameEl.title = viewer.dialog.querySelector('.kp-viewer__title')?.textContent ?? '';
            const sandbox = options.sandbox ?? (wanted === 'text' ? 'strict' : 'off');
            if (sandbox === 'strict') frameEl.setAttribute('sandbox', '');
            frameEl.addEventListener('load', () => {
                if (!live) return;
                stopLoad();
                viewer.setState('ready');
            });
            frameEl.src = wanted === 'pdf' && page > 1 ? `${url}#page=${page}` : url;
            frame = frameEl;
            viewer.setContent(frameEl);
        })();
    }

    load();
    doc.dispatchEvent(new CustomEvent('kp-preview-open', { bubbles: true, detail: { url: first.url } }));
    return viewer;
}

/** Give a glyph its name for a screen reader and its number of text lines (the picture itself is the stylesheet's). @param {HTMLElement} el */
function drawGlyph(el) {
    const strings = getStrings();
    const kind = /** @type {typeof DOC_KINDS[number]} */ (DOC_KINDS.includes(/** @type {any} */ (el.getAttribute('data-kp-doc-kind'))) ? el.getAttribute('data-kp-doc-kind') : 'unknown');
    const size = el.getAttribute('data-kp-size') ?? 'md';
    const missing = el.getAttribute('data-kp-state') === 'missing';
    const lines = Math.min(7, Math.max(3, Number(el.getAttribute('data-kp-doc-lines')) || (size === 'lg' ? 7 : 4)));
    el.classList.add('kp-docglyph');
    el.setAttribute('data-kp-doc-kind', kind);
    el.style.setProperty('--kp-doc-lines', String(lines));
    if (!el.hasAttribute('role') && !el.hasAttribute('aria-hidden')) {
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', missing ? strings.docMissing : strings.docKindName(kind));
    }
}

/**
 * Draw every glyph under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachDocGlyphs(root = document) {
    /** @type {HTMLElement[]} */
    const done = [];
    for (const found of root.querySelectorAll(`${DOC_GLYPH}[data-kp-doc-kind], ${DOC_GLYPH}[data-kp-state]`)) {
        const el = /** @type {HTMLElement} */ (found);
        if (el.dataset.kpGlyphDrawn !== undefined) continue;
        el.dataset.kpGlyphDrawn = '';
        drawGlyph(el);
        done.push(el);
    }
    return () => {
        for (const el of done) delete el.dataset.kpGlyphDrawn;
    };
}

/**
 * Build a glyph.
 * @param {Document} doc @param {'pdf' | 'doc' | 'sheet' | 'image' | 'text' | 'unknown'} kind @param {{ size?: 'sm' | 'md' | 'lg', lines?: number, state?: 'ready' | 'missing' }} [options]
 */
export function docGlyph(doc, kind, options = {}) {
    const el = doc.createElement('span');
    el.className = 'kp-docglyph';
    el.setAttribute('data-kp-doc-kind', kind);
    if (options.size) el.setAttribute('data-kp-size', options.size);
    if (options.lines) el.setAttribute('data-kp-doc-lines', String(options.lines));
    if (options.state) el.setAttribute('data-kp-state', options.state);
    drawGlyph(el);
    el.dataset.kpGlyphDrawn = '';
    return el;
}

/**
 * Wire every opener under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachDocPreviews(root = document) {
    /** @type {(() => void)[]} */
    const cleanups = [attachDocGlyphs(root)];
    const strings = getStrings();
    for (const found of root.querySelectorAll(PREVIEW)) {
        const el = /** @type {HTMLElement} */ (found);
        if (el.dataset.kpPreviewAttached !== undefined) continue;
        el.dataset.kpPreviewAttached = '';
        if ((el.getAttribute('data-kp-preview') ?? '') === '') {
            // No file yet: off, and it says why.
            el.setAttribute('aria-disabled', 'true');
            if (el instanceof HTMLButtonElement) el.disabled = true;
            if (!el.hasAttribute('data-kp-disabled-reason')) el.setAttribute('data-kp-disabled-reason', strings.previewNoFile);
        }
        /** @param {Event} event */
        const onClick = (event) => {
            const url = el.getAttribute('data-kp-preview') ?? '';
            if (url === '' || el.getAttribute('aria-disabled') === 'true') {
                event.preventDefault();
                return;
            }
            // A modified click on a link keeps the browser's own meaning (a new tab).
            if (event instanceof MouseEvent && (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0)) return;
            event.preventDefault();
            const list = el.getAttribute('data-kp-preview-group');
            /** @type {HTMLElement[]} */
            const peers = list
                ? /** @type {HTMLElement[]} */ ([...el.ownerDocument.querySelectorAll(`[data-kp-preview-group="${CSS.escape(list)}"]`)].filter(
                      (n) => n instanceof HTMLElement && (n.getAttribute('data-kp-preview') ?? '') !== '',
                  ))
                : [];
            const type = /** @type {'auto' | 'pdf' | 'image' | 'text'} */ (el.getAttribute('data-kp-preview-type') ?? 'auto');
            const sandbox = el.getAttribute('data-kp-preview-sandbox');
            openDocPreview({
                url,
                type,
                engine: el.getAttribute('data-kp-preview-engine') === 'none' ? 'none' : 'native',
                size: el.getAttribute('data-kp-preview-size') === 'full' ? 'full' : 'wide',
                actions: (el.getAttribute('data-kp-preview-actions') ?? 'open download').split(/[\s,]+/).filter(Boolean),
                ...(el.getAttribute('data-kp-preview-title') ? { title: /** @type {string} */ (el.getAttribute('data-kp-preview-title')) } : {}),
                ...(el.getAttribute('data-kp-preview-name') ? { name: /** @type {string} */ (el.getAttribute('data-kp-preview-name')) } : {}),
                page: Number(el.getAttribute('data-kp-preview-page')) || 1,
                ...(sandbox === 'strict' || sandbox === 'off' ? { sandbox } : {}),
                opener: el,
                ...(peers.length > 1
                    ? {
                          group: peers.map((n) => ({
                              url: n.getAttribute('data-kp-preview') ?? '',
                              ...(n.getAttribute('data-kp-preview-title') ? { title: /** @type {string} */ (n.getAttribute('data-kp-preview-title')) } : {}),
                              ...(n.getAttribute('data-kp-preview-name') ? { name: /** @type {string} */ (n.getAttribute('data-kp-preview-name')) } : {}),
                          })),
                          index: Math.max(0, peers.indexOf(el)),
                      }
                    : {}),
            });
        };
        el.addEventListener('click', onClick);
        cleanups.push(() => {
            el.removeEventListener('click', onClick);
            delete el.dataset.kpPreviewAttached;
        });
    }
    return () => {
        for (const clean of cleanups) clean();
    };
}
