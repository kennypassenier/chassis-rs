// The anchors' selectors, events and times, and the pure helpers: slugs, unique ids, what an element is called, and
// copying text with the clipboard or the old way.

/** A container whose headings or rows get anchors. */
export const ANCHORS = '[data-kp-anchors]';
/** One element that says its own id. */
export const ANCHOR = '[data-kp-anchor]';
/** Fired on the mark when a link was copied: `{ id, url, text, markdown, ok }`. */
export const ANCHOR_COPY_EVENT = 'kp-anchor-copy';
/** Fired (cancelable) on the container before a link lands in a place that may be folded or on another page: `{ id, target }`. */
export const ANCHOR_REVEAL_EVENT = 'kp-anchor-reveal';
/** Fired on the container when a hash has no place to land: `{ id }`. */
export const ANCHOR_MISSING_EVENT = 'kp-anchor-missing';
/** How long a place a link landed on stays marked, in ms. */
export const ANCHOR_HIT_MS = 2000;
/** The longest a hash that has no row yet is waited for, in ms. */
export const ANCHOR_WAIT_MS = 10000;
/** How long a container must have been still, with nothing in it drawing, before a hash without a place is given up, in ms. */
export const ANCHOR_QUIET_MS = 1000;
/** How long "Copied" stays on the mark, in ms. */
export const ANCHOR_COPIED_MS = 1500;

/**
 * A slug of some text: lower case, accents folded, anything else a dash. Pure.
 * @param {string} text
 */
export function anchorSlug(text) {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * An id that no element of the document has yet: the slug, then `-2`, `-3`. Pure over the document.
 * @param {Document} doc @param {string} slug @param {string} [fallback]
 */
export function uniqueAnchorId(doc, slug, fallback = 'section') {
    const base = slug || fallback;
    let id = base;
    let n = 2;
    while (doc.getElementById(id)) id = `${base}-${n++}`;
    return id;
}

/** @param {Element} el @param {string} name @param {string} fallback */
export const attr = (el, name, fallback) => el.getAttribute(name) ?? fallback;

/** A heading: an h1 to h6, or the heading of a form grid's group. @param {Element} el */
export const isHeading = (el) => /^h[1-6]$/i.test(el.tagName) || el.matches('legend, .kp-formgrid__heading');

/** Rows that carry a key the page already writes. */
export const KEYED_ROWS = 'tr[data-kp-row-key], [role="row"][data-kp-row-key], li[data-kp-row-key]';

/** The words of an element without the marks this module added. @param {Element} el */
export function plainText(el) {
    const copy = /** @type {Element} */ (el.cloneNode(true));
    for (const mark of copy.querySelectorAll('.kp-anchor')) mark.remove();
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** What the row or heading is called, for the mark's name. @param {HTMLElement} el */
export function nameOf(el) {
    const own = el.getAttribute('data-kp-anchor-label');
    if (own) return own;
    if (isHeading(el)) return plainText(el);
    const cell = el.querySelector('th, td, [role="cell"], [role="gridcell"], .kp-action-list__title') ?? el;
    return plainText(cell) || el.id;
}

/** Copy text, with the old way when the clipboard is not offered. @param {Document} doc @param {string} text */
export async function copyText(doc, text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const area = doc.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;inset-block-start:0;inset-inline-start:-9999px;opacity:0';
        doc.body.append(area);
        area.select();
        let ok = false;
        try {
            ok = doc.execCommand('copy');
        } catch {
            ok = false;
        }
        area.remove();
        return ok;
    }
}

