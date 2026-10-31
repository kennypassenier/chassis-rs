// An opener: a link or a button that opens its document in the preview, off with a reason when it has no file yet.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { openDocPreview } from './open.js';

/** @typedef {import('../docpreview.js').PreviewOptions} PreviewOptions */

export class DocOpener extends Controller {
    connect() {
        const el = this.host;
        // An opener that already carries the mark (a copy of a wired one) is left alone, as it always was.
        if (el.hasAttribute('data-kp-preview-attached')) return;
        el.dataset.kpPreviewAttached = '';
        if ((el.getAttribute('data-kp-preview') ?? '') === '') {
            // No file yet: off, and it says why.
            el.setAttribute('aria-disabled', 'true');
            if (el instanceof HTMLButtonElement) el.disabled = true;
            if (!el.hasAttribute('data-kp-disabled-reason')) el.setAttribute('data-kp-disabled-reason', getStrings().previewNoFile);
        }
        this.listen(el, 'click', (event) => this.onClick(event));
        this.own(() => {
            delete el.dataset.kpPreviewAttached;
        });
    }

    /** @param {Event} event */
    onClick(event) {
        const el = this.host;
        const url = el.getAttribute('data-kp-preview') ?? '';
        if (url === '' || el.getAttribute('aria-disabled') === 'true') {
            event.preventDefault();
            return;
        }
        // A modified click on a link keeps the browser's own meaning (a new tab).
        if (event instanceof MouseEvent && (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0)) return;
        event.preventDefault();
        openDocPreview(this.previewOptions(url));
    }

    /** What the opener's attributes ask for. @param {string} url @returns {PreviewOptions} */
    previewOptions(url) {
        const el = this.host;
        const type = /** @type {'auto' | 'pdf' | 'image' | 'text'} */ (el.getAttribute('data-kp-preview-type') ?? 'auto');
        const sandbox = el.getAttribute('data-kp-preview-sandbox');
        const title = el.getAttribute('data-kp-preview-title') || undefined;
        const name = el.getAttribute('data-kp-preview-name') || undefined;
        return {
            url,
            type,
            engine: el.getAttribute('data-kp-preview-engine') === 'none' ? 'none' : 'native',
            size: el.getAttribute('data-kp-preview-size') === 'full' ? 'full' : 'wide',
            actions: (el.getAttribute('data-kp-preview-actions') ?? 'open download').split(/[\s,]+/).filter(Boolean),
            ...(title ? { title } : {}),
            ...(name ? { name } : {}),
            page: Number(el.getAttribute('data-kp-preview-page')) || 1,
            ...(sandbox === 'strict' || sandbox === 'off' ? { sandbox } : {}),
            opener: el,
            ...this.groupOptions(),
        };
    }

    /** The openers that share this one's group, as the documents the viewer steps through. @returns {Pick<PreviewOptions, 'group' | 'index'>} */
    groupOptions() {
        const el = this.host;
        const list = el.getAttribute('data-kp-preview-group');
        /** @type {HTMLElement[]} */
        const peers = list
            ? /** @type {HTMLElement[]} */ (
                  [...el.ownerDocument.querySelectorAll(`[data-kp-preview-group="${CSS.escape(list)}"]`)].filter(
                      (n) => n instanceof HTMLElement && (n.getAttribute('data-kp-preview') ?? '') !== '',
                  )
              )
            : [];
        if (peers.length < 2) return {};
        return {
            group: peers.map((n) => {
                const title = n.getAttribute('data-kp-preview-title') || undefined;
                const name = n.getAttribute('data-kp-preview-name') || undefined;
                return { url: n.getAttribute('data-kp-preview') ?? '', ...(title ? { title } : {}), ...(name ? { name } : {}) };
            }),
            index: Math.max(0, peers.indexOf(el)),
        };
    }
}
