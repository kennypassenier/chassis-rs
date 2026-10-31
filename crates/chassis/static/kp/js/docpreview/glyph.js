// The document glyph: its name for a screen reader and its number of text lines, wired by DocGlyph or built by docGlyph().

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { DOC_KINDS, GLYPH_LINES } from './values.js';

/** Give a glyph its name for a screen reader and its number of text lines (the picture itself is the stylesheet's). @param {HTMLElement} el */
function drawGlyph(el) {
    const strings = getStrings();
    const kind = /** @type {typeof DOC_KINDS[number]} */ (
        DOC_KINDS.includes(/** @type {any} */ (el.getAttribute('data-kp-doc-kind'))) ? el.getAttribute('data-kp-doc-kind') : 'unknown'
    );
    const size = el.getAttribute('data-kp-size') ?? 'md';
    const missing = el.getAttribute('data-kp-state') === 'missing';
    const lines = Math.min(
        GLYPH_LINES.max,
        Math.max(GLYPH_LINES.min, Number(el.getAttribute('data-kp-doc-lines')) || (size === 'lg' ? GLYPH_LINES.large : GLYPH_LINES.normal)),
    );
    el.classList.add('kp-docglyph');
    el.setAttribute('data-kp-doc-kind', kind);
    el.style.setProperty('--kp-doc-lines', String(lines));
    if (!el.hasAttribute('role') && !el.hasAttribute('aria-hidden')) {
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', missing ? strings.docMissing : strings.docKindName(kind));
    }
}

/** One glyph on the page: marked as drawn, drawn, and unmarked on detach. */
export class DocGlyph extends Controller {
    connect() {
        const el = this.host;
        // A glyph that is already drawn (built by docGlyph(), or a copy of a drawn one) is left alone, as it always was.
        if (el.hasAttribute('data-kp-glyph-drawn')) return;
        el.dataset.kpGlyphDrawn = '';
        drawGlyph(el);
        this.own(() => {
            delete el.dataset.kpGlyphDrawn;
        });
    }
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
