// The small DOM helpers of the lines view: element making, attribute reads and the words of a line.

/** The SVG namespace the lines are drawn in. */
export const SVG_NS = 'http://www.w3.org/2000/svg';

/** The mark each tone puts before its label (never colour alone). */
export const TONE_GLYPH = Object.freeze({ ok: '✓', warn: '!', bad: '×', muted: '–' });

/** @typedef {import('../uses-map.js').UsesLine} UsesLine */

/** @param {Document} doc @param {string} tag @param {string} cls */
export const make = (doc, tag, cls) => {
    const node = doc.createElement(tag);
    node.className = cls;
    return node;
};

/** @param {Element} el @param {string} name @param {string} fallback */
export const attr = (el, name, fallback) => el.getAttribute(name) ?? fallback;

/**
 * The words of a line: the tone's mark and the label, in one span [r3r5-1019 line-tone].
 * @param {Document} doc @param {string} cls @param {UsesLine} line
 */
export function tagOf(doc, cls, line) {
    const tag = make(doc, 'span', cls);
    if (line.tone) {
        tag.setAttribute('data-kp-tone', line.tone);
        const mark = make(doc, 'span', 'kp-uses__tag-mark');
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = TONE_GLYPH[line.tone];
        tag.append(mark);
    }
    tag.append(make(doc, 'span', 'kp-uses__tag-text'));
    /** @type {HTMLElement} */ (tag.lastElementChild).textContent = line.label ?? '';
    return tag;
}
