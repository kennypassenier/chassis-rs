// The keys themselves: reading "g s" into steps, spelling them for the sheet, and asking whether an event presses a step.

/** @typedef {import('../shortcuts.js').Step} Step */

const MODIFIERS = new Set(['mod', 'ctrl', 'control', 'alt', 'shift', 'meta', 'cmd']);

/**
 * Read "g s" or "Mod K" into steps.
 * @param {string} keys
 * @returns {Step[]}
 */
export function parseShortcutKeys(keys) {
    /** @type {Step[]} */
    const steps = [];
    /** @type {Set<string>} */
    let mods = new Set();
    for (const token of keys.trim().split(/\s+/)) {
        if (token === '') continue;
        const lower = token.toLowerCase();
        if (MODIFIERS.has(lower)) {
            mods.add(lower === 'ctrl' || lower === 'control' || lower === 'meta' || lower === 'cmd' ? 'mod' : lower);
            continue;
        }
        // "Space" is the Space key, which `KeyboardEvent.key` spells " " [wish-1120, homelab 122].
        steps.push({ mods: [...mods].sort(), key: lower === 'space' ? ' ' : token });
        mods = new Set();
    }
    if (mods.size > 0) throw new RangeError(`The keys "${keys}" end on a modifier.`);
    if (steps.length === 0) throw new RangeError('A shortcut needs keys.');
    return steps;
}

/** The steps in one comparable string. @param {Step[]} steps */
export const normal = (steps) => steps.map((s) => [...s.mods, s.key === ' ' ? 'space' : s.key.toLowerCase()].join('+')).join(' ');

/** Whether this is a Mac, where `Mod` is ⌘. */
function isMac() {
    if (typeof navigator === 'undefined') return false;
    const platform = /** @type {any} */ (navigator).userAgentData?.platform ?? navigator.platform ?? '';
    return /mac|iphone|ipad/i.test(platform);
}

/** The keys as the sheet spells them. @param {string} keys */
export function displayShortcutKeys(keys) {
    return keys
        .trim()
        .split(/\s+/)
        .map((t) => (t.toLowerCase() === 'mod' ? (isMac() ? '⌘' : 'Ctrl') : t))
        .join(' ');
}

/**
 * Does this event press this step?
 * @param {Step} step @param {KeyboardEvent} event
 */
export function matches(step, event) {
    const wantsMod = step.mods.includes('mod');
    if (wantsMod !== (event.ctrlKey || event.metaKey)) return false;
    if (step.mods.includes('alt') !== event.altKey) return false;
    const key = event.key;
    const letter = key.length === 1 && key.toLowerCase() !== key.toUpperCase();
    // A symbol such as "?" is typed with Shift on most keyboards; a letter must say it.
    if (letter && step.mods.includes('shift') !== event.shiftKey) return false;
    if (!letter && step.mods.includes('shift') && !event.shiftKey) return false;
    return key.toLowerCase() === step.key.toLowerCase();
}

/** The keys that are never a shortcut's own: composing, repeating, dead keys and the modifiers alone. @param {KeyboardEvent} event */
export function ignoredKey(event) {
    return (
        event.isComposing ||
        event.repeat ||
        event.key === 'Dead' ||
        event.key === 'Shift' ||
        event.key === 'Control' ||
        event.key === 'Alt' ||
        event.key === 'Meta'
    );
}
