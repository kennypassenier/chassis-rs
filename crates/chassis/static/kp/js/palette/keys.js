// Keyboard facts: the platform, the matchers of a hotkey and whether the focus is typing.
import { subsequence } from '../listbox.js';
import { matchIntent } from '../intent.js';
/** @typedef {import('./types.js').Matcher} Matcher */

/** Whether this is a Mac, where the modifier is ⌘ rather than Ctrl. */
export function isMac() {
    if (typeof navigator === 'undefined') return false;
    const platform = /** @type {any} */ (navigator).userAgentData?.platform ?? navigator.platform ?? '';
    return /mac|iphone|ipad/i.test(platform);
}

/** @type {Record<string, Matcher>} */
export const MATCHERS = {
    // Words in any order, each starting a word of the command [kpadopt6-ops]: the default since then, drawn by the
    // palette itself (ranking, marks, the cap), so this entry is for a consumer that asks a single yes or no.
    intent: (text, query) => matchIntent(text, query),
    // Literal [scope-56]: a subsequence let "read" find "Report
    // an incident", which reads as a wrong answer rather than a clever
    // one. `data-kp-match="subsequence"` keeps "thm" finding "Theme" for
    // a palette that wants it.
    subsequence: (text, query) => subsequence(text, query),
    substring: (text, query) => text.toLowerCase().includes(query.toLowerCase()),
    prefix: (text, query) => text.toLowerCase().startsWith(query.toLowerCase()),
};

/**
 * Is this keystroke the palette's? ⌘+key on a Mac, Ctrl+key everywhere
 * else. Checked rather than assumed: a page that binds Ctrl+K on a Mac
 * steals nothing, but a page that binds ⌘K on Windows binds nothing at
 * all.
 *
 * @param {KeyboardEvent} event
 * @param {string} key
 */
export function isHotkey(event, key) {
    return event.key.toLowerCase() === key.toLowerCase() && (event.metaKey || event.ctrlKey);
}

/**
 * Is the event coming from somewhere that a bare `?` means a question
 * mark rather than a shortcut?
 *
 * @param {EventTarget | null} target
 * @param {string} typingSelector
 */
export function isTyping(target, typingSelector) {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || target.matches(typingSelector);
}
