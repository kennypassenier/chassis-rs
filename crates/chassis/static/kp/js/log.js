// A name's own colour, and the log line that wears it [gap-14, gap-15].
//
// kp-tui hashes a source name into the register's five chart colours so a
// stack keeps one colour across a terminal session (`source_colour`, FNV-1a).
// The web had the same five colours per theme and no rule at all, so a page
// showing the same sources would have picked by hand and drifted from the
// terminal by the second name. This is that rule, in the same arithmetic.
//
// The colours themselves stay the register's: this writes a custom property
// naming `--chart-1` to `--chart-5`, never a colour of its own.

import { presentUnder, asOf } from './as-of.js';

/** The custom property a source's colour is written to. */
export const SOURCE_PROPERTY = '--kp-source-colour';

/**
 * FNV-1a over the name's bytes, as kp-tui hashes it: the same offset basis
 * and the same prime, so `media` is the third chart colour in a terminal and
 * the third here. A `DefaultHasher` (or any seeded one) would not be stable
 * between two runs, let alone between two languages.
 *
 * @param {string} name
 * @returns {number} 1 to 5, the chart colour the name takes
 */
export function sourceIndex(name) {
    let hash = 0x811c_9dc5;
    for (const byte of new TextEncoder().encode(name)) {
        hash ^= byte;
        hash = Math.imul(hash, 0x0100_0193) >>> 0;
    }
    return (hash % 5) + 1;
}

/**
 * The value to give a colour property for `name`: the register's own chart
 * colour, by reference, so a theme switch moves it without this running
 * again.
 * @param {string} name
 */
export const sourceColour = (name) => `var(--chart-${sourceIndex(name)})`;

/**
 * Give every `[data-kp-source]` under `root` its name's colour.
 *
 * The attribute's value is the name where it has one, so a shortened label on
 * screen ("prom" for "prometheus") can still hash the full name; where it is
 * empty the element's own text is the name.
 *
 * @param {ParentNode} [root]
 * @returns {Element[]} the elements coloured
 */
export function attachLogs(root = document) {
    const present = presentUnder(root);
    return asOf(root, present, () => {
        const marked = [...root.querySelectorAll('[data-kp-source]')];
        for (const el of marked) {
            const name = el.getAttribute('data-kp-source') || el.textContent?.trim() || '';
            if (name) /** @type {HTMLElement} */ (el).style.setProperty(SOURCE_PROPERTY, sourceColour(name));
        }
        return marked;
    });
}
