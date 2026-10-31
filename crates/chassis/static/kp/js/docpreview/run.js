// One running preview: it asks the server about the file, then shows it as a frame or a picture, or says why it cannot.

import { agoMoment } from '../freshness.js';
import { formatBytes } from '../locale.js';
import { PREVIEW_TIMEOUT_MS } from './values.js';
import { plainFileName, previewTypeOf } from './kinds.js';
import { PreviewCore } from './core.js';

/** @typedef {import('./core.js').PreviewLoad} PreviewLoad */

/** The bytes in a kilobyte for the facts line. */
const FACTS_BASE = 1024;

export class PreviewRun extends PreviewCore {
    connect() {
        this.own(() => this.stopLoad());
        this.load();
        this.doc.dispatchEvent(new CustomEvent('kp-preview-open', { bubbles: true, detail: { url: this.entry().url } }));
    }

    /** Show the document at `at`: title, buttons and position first, then the loading state, then what the server says. */
    load() {
        this.stopLoad();
        const { viewer } = this;
        const entry = this.entry();
        const url = entry.url;
        const name = entry.name ?? this.preview.name ?? plainFileName(url);
        const page = Math.max(1, Math.floor(this.preview.page ?? 1));
        viewer.setTitle(this.titleOf(entry));
        viewer.setActions(this.actionsFor(url, name));
        viewer.setPosition(this.group ? { index: this.at + 1, total: this.group.length } : null);
        viewer.setFacts('');
        viewer.setContent();
        viewer.setState('loading');
        this.setFrame(null);
        const load = this.beginLoad();
        load.timer = window.setTimeout(() => this.fail(load, url, 'timeout', this.strings.previewTimeout), PREVIEW_TIMEOUT_MS);
        void this.settle(load, url, page);
    }

    /**
     * The load failed: say so, unless a later load made this one stale.
     * @param {PreviewLoad} load
     * @param {string} url
     * @param {string} reason
     * @param {string} message
     */
    fail(load, url, reason, message) {
        if (!load.live) return;
        load.stop();
        this.viewer.setContent();
        this.viewer.setState('error', { message, retry: () => this.load() });
        this.doc.dispatchEvent(new CustomEvent('kp-preview-failed', { bubbles: true, detail: { url, reason } }));
    }

    /**
     * Ask the server, then show the file.
     * @param {PreviewLoad} load
     * @param {string} url
     * @param {number} page
     */
    async settle(load, url, page) {
        const contentType = await this.probe(load, url);
        if (contentType === null || !load.live) return;
        this.show(load, url, page, contentType);
    }

    /**
     * What the server says about the file: a missing one is said before a frame shows an error page.
     * @param {PreviewLoad} load
     * @param {string} url
     * @returns {Promise<string | null>} the Content-Type ('' when unknown), or null when there is nothing left to show
     */
    async probe(load, url) {
        const strings = this.strings;
        let contentType = '';
        try {
            const head = await fetch(url, { method: 'HEAD' });
            if (!load.live) return null;
            if (!head.ok) {
                this.fail(load, url, `status-${head.status}`, head.status === 404 ? strings.previewGone : strings.previewServer(head.status));
                return null;
            }
            contentType = head.headers.get('content-type') ?? '';
            this.writeFacts(head, url, contentType);
        } catch {
            // A server that refuses HEAD, or another origin: the frame will say it.
        }
        return contentType;
    }

    /** The facts line: kind, size and when it was made, from the HEAD answer. @param {Response} head @param {string} url @param {string} contentType */
    writeFacts(head, url, contentType) {
        const strings = this.strings;
        const bytes = Number(head.headers.get('content-length'));
        const made = Date.parse(head.headers.get('last-modified') ?? '');
        const kindWords = { pdf: 'PDF', image: strings.docKindImage, text: strings.docKindText }[previewTypeOf(url, contentType)];
        const size = Number.isFinite(bytes) && bytes > 0 ? formatBytes(bytes, this.locale, { base: FACTS_BASE }) : '';
        this.viewer.setFacts([kindWords, size, Number.isFinite(made) ? agoMoment(made) : ''].filter(Boolean).join(' · '));
    }

    /**
     * Show the file as a picture or a frame, or say that the browser cannot show a PDF.
     * @param {PreviewLoad} load
     * @param {string} url
     * @param {number} page
     * @param {string} contentType
     */
    show(load, url, page, contentType) {
        const { viewer, preview, strings } = this;
        const wanted = preview.type && preview.type !== 'auto' ? preview.type : previewTypeOf(url, contentType);
        if (wanted === 'pdf' && (preview.engine === 'none' || /** @type {any} */ (navigator).pdfViewerEnabled === false)) {
            load.stop();
            viewer.setDesc('');
            viewer.setState('unsupported', { message: strings.previewNoPdf });
            return;
        }
        viewer.setDesc(wanted === 'pdf' ? strings.previewShownByBrowser : '');
        if (wanted === 'image') {
            viewer.setContent(this.imageFor(load, url));
            return;
        }
        const frame = this.frameFor(load, url, page, wanted);
        this.setFrame(frame);
        viewer.setContent(frame);
    }

    /** @param {PreviewLoad} load @param {string} url */
    imageFor(load, url) {
        const img = this.doc.createElement('img');
        img.className = 'kp-docpreview__image';
        img.alt = this.viewer.dialog.querySelector('.kp-viewer__title')?.textContent ?? '';
        img.addEventListener('load', () => {
            if (!load.live) return;
            load.stop();
            this.viewer.setState('ready');
        });
        img.addEventListener('error', () => this.fail(load, url, 'image', this.strings.previewImage));
        img.src = url;
        return img;
    }

    /** @param {PreviewLoad} load @param {string} url @param {number} page @param {'pdf' | 'image' | 'text'} wanted */
    frameFor(load, url, page, wanted) {
        const frame = this.doc.createElement('iframe');
        frame.className = 'kp-docpreview__frame';
        frame.title = this.viewer.dialog.querySelector('.kp-viewer__title')?.textContent ?? '';
        const sandbox = this.preview.sandbox ?? (wanted === 'text' ? 'strict' : 'off');
        if (sandbox === 'strict') frame.setAttribute('sandbox', '');
        frame.addEventListener('load', () => {
            if (!load.live) return;
            load.stop();
            this.viewer.setState('ready');
        });
        frame.src = wanted === 'pdf' && page > 1 ? `${url}#page=${page}` : url;
        return frame;
    }
}
