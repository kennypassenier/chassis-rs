// What the lightbox shows beside the picture: its caption and facts, and the buttons in the foot.

import { openConfirmation } from '../components.js';
import { agoMoment } from '../freshness.js';
import { formatBytes } from '../locale.js';
import { make } from './dom.js';

/** @typedef {import('./lightbox.js').Lightbox} Lightbox */
/** @typedef {import('./constants.js').GalleryItem} GalleryItem */

/** The caption, uploader, date and (in `details`) size of the picture. @param {Lightbox} lb @param {GalleryItem} item */
export function drawInfo(lb, item) {
    const { info, doc, infoMode } = lb;
    info.replaceChildren();
    info.hidden = infoMode === 'off';
    if (infoMode === 'off') return;
    if (item.caption) {
        const caption = make(doc, 'p', 'kp-gallery__text');
        caption.textContent = item.caption;
        info.append(caption);
    }
    const meta = [item.uploader, item.at ? agoMoment(item.at) : ''];
    if (infoMode === 'details') {
        if (item.width && item.height) meta.push(`${item.width} × ${item.height}`);
        if (item.bytes) meta.push(formatBytes(item.bytes, lb.locale));
    }
    const line = meta.filter(Boolean).join(' · ');
    if (line) {
        const facts = make(doc, 'p', 'kp-gallery__meta');
        facts.textContent = line;
        info.append(facts);
    }
    if (!item.caption && !line) info.hidden = true;
}

/** The buttons in the foot: the page's own (asking first when they say to), and the named kinds. @param {Lightbox} lb @param {GalleryItem} item @returns {import('../viewer.js').ViewerAction[]} */
export function actionsFor(lb, item) {
    const { doc } = lb;
    /** @type {import('../viewer.js').ViewerAction[]} */
    const list = lb.extraActions.map((kind) => ({ kind, href: item.src, name: item.src.split('/').pop() ?? '' }));
    for (const action of lb.gallery.spec.actions?.(item) ?? []) {
        list.push({
            kind: 'custom',
            label: action.label,
            ...(action.tone ? { tone: action.tone } : {}),
            run: () => {
                const pressed = doc.activeElement;
                if (action.confirm && pressed instanceof HTMLElement) {
                    openConfirmation(pressed, { phrase: action.confirm, acceptLabel: action.label, onAccept: action.run });
                } else action.run();
            },
        });
    }
    return list;
}
