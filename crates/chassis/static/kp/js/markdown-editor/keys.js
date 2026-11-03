// The keys of the Markdown editor's tools: the attribute and the default of each, read through the one key-spec parser [keys-1103].

import { matchesKeySpec, resolveKeySpec } from '../key-spec.js';
import { MD_BOLD_KEY, MD_BOLD_KEY_ATTRIBUTE, MD_ITALIC_KEY, MD_ITALIC_KEY_ATTRIBUTE, MD_LINK_KEY, MD_LINK_KEY_ATTRIBUTE } from './constants.js';

/** The tools that have a key: attribute and default. */
const TOOL_KEYS = /** @type {const} */ ({
    bold: [MD_BOLD_KEY_ATTRIBUTE, MD_BOLD_KEY],
    italic: [MD_ITALIC_KEY_ATTRIBUTE, MD_ITALIC_KEY],
    link: [MD_LINK_KEY_ATTRIBUTE, MD_LINK_KEY],
});

/** The key spec of a tool in an editor; empty for a tool that has no key. @param {Element | null} host @param {string} id */
export function toolKey(host, id) {
    const pair = /** @type {Record<string, readonly [string, string]>} */ (TOOL_KEYS)[id];
    return pair ? resolveKeySpec(host, pair[0], undefined, pair[1]) : [];
}

/** The tool whose key this keydown presses, or undefined. @param {Element | null} host @param {KeyboardEvent} event */
export function toolPressed(host, event) {
    return Object.keys(TOOL_KEYS).find((id) => matchesKeySpec(event, toolKey(host, id)));
}
