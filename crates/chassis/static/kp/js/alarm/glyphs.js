// The headline as letter cells for the stylesheet's decode, and the noise glyphs each cell carries.

import { GLYPHS } from '../effects.js';

/** Two noise glyphs for one letter cell, from the decipher set js/effects.js uses. */
export const noiseGlyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

/**
 * The headline as letter cells for the stylesheet's decode. Each cell carries
 * its place (`--i`) and two noise glyphs drawn in its pseudo-elements, so the
 * letter itself never moves and the layout never changes; a cell changes
 * three times, ever. Words stay whole (`.kp-alarm__word`), so a line breaks
 * between words and never inside one. Spaces count as a place, so the decode
 * keeps its rhythm across them.
 *
 * @param {string} text
 * @returns {{ word: string, chars: { ch: string, i: number }[] }[]} the words, and each run of spaces as `word: ' '` with no cells
 */
export function glyphCells(text) {
    /** @type {{ word: string, chars: { ch: string, i: number }[] }[]} */
    const parts = [];
    let i = 0;
    for (const part of String(text).split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
            parts.push({ word: ' ', chars: [] });
            i++;
            continue;
        }
        parts.push({ word: part, chars: [...part].map((ch) => ({ ch, i: i++ })) });
    }
    return parts;
}
