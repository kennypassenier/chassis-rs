// The selectors, the kinds, the extension table and the fixed numbers of the document preview and the document glyph.

/** An opener. */
export const PREVIEW = '[data-kp-preview]';
/** A glyph. */
export const DOC_GLYPH = '.kp-docglyph';
/** The kinds of a document glyph. */
export const DOC_KINDS = /** @type {const} */ (['pdf', 'doc', 'sheet', 'image', 'text', 'unknown']);
/** How long a frame may take before the preview is called failed, in ms. */
export const PREVIEW_TIMEOUT_MS = 15000;

/** The glyph's text lines: the least, the most, and the default for a large and for any other size. */
export const GLYPH_LINES = { min: 3, max: 7, large: 7, normal: 4 };
/** The buttons a preview's foot has when `data-kp-preview-actions` does not say. */
export const DEFAULT_ACTIONS = /** @type {const} */ (['open', 'download']);
/** The glyphs to draw: one with a kind or a state. */
export const GLYPH_HOSTS = `${DOC_GLYPH}[data-kp-doc-kind], ${DOC_GLYPH}[data-kp-state]`;

/** What each file extension is drawn as. */
export const EXTENSIONS = /** @type {Record<string, 'pdf' | 'image' | 'text'>} */ ({
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
