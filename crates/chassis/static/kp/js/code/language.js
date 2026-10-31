// The language of a block: JSON that parses, the languages that get colour, and `auto` resolved from the text.

/** @typedef {import('./constants.js').CodeSpec} CodeSpec */

/**
 * The JSON of `text` laid out with two-space indents, or null when it does
 * not parse.
 * @param {string} text
 */
export function prettyJson(text) {
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return null;
    }
}

/** @param {string | undefined} language */
export const isJson = (language) => (language ?? '').trim().toLowerCase() === 'json';

/** @param {string | undefined} language */
export const isToml = (language) => (language ?? '').trim().toLowerCase() === 'toml';

/** @param {string | undefined} language */
export const isShell = (language) => ['bash', 'sh', 'shell', 'zsh'].includes((language ?? '').trim().toLowerCase());

/**
 * The language whose text the block colours, or null.
 * @param {CodeSpec} spec
 * @returns {'toml' | 'shell' | null}
 */
export const highlightKind = (spec) => (spec.highlight === false ? null : isToml(spec.language) ? 'toml' : isShell(spec.language) ? 'shell' : null);

/**
 * `auto` (and no language in a cell) is JSON only when the text is an object or a list that parses.
 * @param {CodeSpec} spec
 * @returns {CodeSpec}
 */
export function withLanguage(spec) {
    const asked = (spec.language ?? '').trim().toLowerCase();
    if (asked !== 'auto' && !(asked === '' && spec.cell)) return spec;
    const text = (spec.text ?? '').trim();
    let json = false;
    if (text.startsWith('{') || text.startsWith('[')) json = prettyJson(text) !== null;
    return { ...spec, language: json ? 'JSON' : '' };
}
