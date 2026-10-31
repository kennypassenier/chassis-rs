// What a mark is, from its name alone: the hash, the letters, the palette slot, the glyph and the pattern, and palette slots shared out over a list. Pure.

import { identityCells } from '../facets.js';

/** A mark the module fills from its name. */
export const IDMARK = '[data-kp-idmark]';
/** How many colours the theme's chart palette has. */
export const IDMARK_SLOTS = 5;
/** The corner glyphs, in the order the hash picks them. */
export const IDMARK_GLYPHS = Object.freeze(['circle', 'square', 'triangle', 'diamond']);

/** The 32-bit FNV-1a offset basis and prime. */
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
/** The hues of a free-hue mark, in degrees. */
const HUE_STEPS = 360;
/** The hash bits the glyph is picked from, so it does not move with the colour slot. */
const GLYPH_SHIFT = 3;

/** FNV-1a over a name, as js/facets.js hashes a pattern's seed. @param {string} name */
function hashOf(name) {
    let hash = FNV_OFFSET;
    for (const ch of name) hash = Math.imul(hash ^ (ch.codePointAt(0) ?? 0), FNV_PRIME);
    return hash >>> 0;
}

/**
 * The letters of a name: the initials of its first two words, or its first
 * two letters when it is one word. Letters and digits only.
 * @param {string} name @param {number} [count]
 */
export function idmarkLetters(name, count = 2) {
    const words = name
        .normalize('NFKC')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);
    if (words.length === 0) return '';
    const letters = words.length > 1 ? words.slice(0, count).map((word) => [...word][0]) : [...words[0]].slice(0, count);
    return letters.join('').toLocaleUpperCase();
}

/**
 * Everything a mark is, from its name. Pure: the same name gives the same
 * mark in node and in every browser.
 * @param {string} name
 * @returns {{ name: string, empty: boolean, slot: number, hue: number, letters: string, glyph: string, cells: [number, number][] }}
 *   `slot` 1 to 5 (the chart colour), `hue` 0 to 359 (the free hue)
 */
export function idmarkFor(name) {
    const clean = (name ?? '').trim();
    if (clean === '') return { name: '', empty: true, slot: 0, hue: 0, letters: '', glyph: IDMARK_GLYPHS[0], cells: [] };
    const hash = hashOf(clean.toLocaleLowerCase());
    return {
        name: clean,
        empty: false,
        slot: (hash % IDMARK_SLOTS) + 1,
        hue: hash % HUE_STEPS,
        letters: idmarkLetters(clean),
        glyph: IDMARK_GLYPHS[(hash >>> GLYPH_SHIFT) % IDMARK_GLYPHS.length],
        cells: identityCells(clean),
    };
}

/**
 * Palette slots for names read together: each name keeps its own slot where
 * no other name took it; a collision moves the later name to the nearest
 * slot still free, and only when all five are taken do names share.
 * The order of `names` decides who keeps a contested slot.
 * @param {readonly string[]} names
 * @returns {Map<string, number>} name to slot, 1 to 5
 */
export function idmarkColours(names) {
    /** @type {Map<string, number>} */
    const out = new Map();
    /** @type {Map<number, number>} */
    const used = new Map();
    for (const raw of names) {
        const name = (raw ?? '').trim();
        if (name === '' || out.has(name)) continue;
        const own = idmarkFor(name).slot;
        let slot = own;
        const least = Math.min(...Array.from({ length: IDMARK_SLOTS }, (_, i) => used.get(i + 1) ?? 0));
        if ((used.get(own) ?? 0) > least)
            for (let step = 1; step < IDMARK_SLOTS; step += 1) {
                const next = ((own - 1 + step) % IDMARK_SLOTS) + 1;
                if ((used.get(next) ?? 0) === least) {
                    slot = next;
                    break;
                }
            }
        used.set(slot, (used.get(slot) ?? 0) + 1);
        out.set(name, slot);
    }
    return out;
}
