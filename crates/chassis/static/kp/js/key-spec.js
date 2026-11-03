// The one key-spec format and its parser [keys-1103].
//
// A component's own shortcut is an option with a default in one named constant, never a literal in a handler
// (Kenny, 2026-11-03). Every such option is a key spec, read here:
//
//   "Mod+Z"          Ctrl or Command, then Z          "Alt+U"        Alt, then U
//   "Ctrl+Shift+U"   a modifier is named or it is up  "j"            the key alone, no modifier held
//   "Enter"  "Space" a named key (event.key)          "none"         no key: the shortcut is off
//   "+ or ="         several keys for one action, separated by " or "
//
// `Mod` (also `Ctrl`, `Cmd`, `Meta`) is Ctrl or Command: either one counts. A letter matches whichever case is typed
// unless `Shift` is named; with `anyShift` (a shortcut that always took both cases) Shift is not looked at. `off`,
// `false` and an empty value mean `none`. Nothing runs on import.
//
//   const key = resolveKeySpec(host, 'data-kp-addrow-submit-key', options.submitKey, DEFAULT_SUBMIT_KEY);
//   if (matchesKeySpec(event, key)) …

/** The words that switch a shortcut off. */
export const KEY_NONE = 'none';
const OFF = new Set(['none', 'off', 'false', '']);
const MODS = { mod: 'mod', ctrl: 'mod', control: 'mod', cmd: 'mod', meta: 'mod', alt: 'alt', option: 'alt', shift: 'shift' };

/** @typedef {{ mod: boolean, alt: boolean, shift: boolean, key: string, cap: string }} KeyChord `cap` is the key as the spec wrote it, for the key caps */
/** @typedef {readonly KeyChord[]} KeySpec the keys that do one thing; empty is off */

/** @param {string} part @returns {KeyChord} */
function parseChord(part) {
    const trimmed = part.trim();
    // A trailing "+" is the plus key itself ("Mod++", "+").
    const keyPart = trimmed.endsWith('+') ? '+' : (trimmed.split('+').pop() ?? '').trim();
    const head = trimmed.endsWith('+') ? trimmed.slice(0, -1) : trimmed.split('+').slice(0, -1).join('+');
    const chord = { mod: false, alt: false, shift: false, cap: keyPart, key: keyPart.toLowerCase() === 'space' ? ' ' : keyPart.toLowerCase() };
    for (const word of head.split('+').map((w) => w.trim().toLowerCase()).filter(Boolean)) {
        const mod = /** @type {Record<string, 'mod' | 'alt' | 'shift'>} */ (MODS)[word];
        if (!mod) throw new RangeError(`Unknown modifier "${word}" in the key "${part}"; use Mod, Alt or Shift.`);
        chord[mod] = true;
    }
    if (chord.key === '') throw new RangeError(`The key "${part}" names no key.`);
    return chord;
}

/**
 * Read a key spec; null or an off word gives the empty spec.
 * @param {string | false | null | undefined | readonly string[]} spec
 * @returns {KeySpec}
 */
export function parseKeySpec(spec) {
    if (spec === false || spec === null || spec === undefined) return [];
    const parts = typeof spec === 'string' ? spec.split(/\s+or\s+/) : spec;
    return parts.filter((p) => !OFF.has(p.trim().toLowerCase())).map(parseChord);
}

/**
 * The key an element, a JS option and a default give, in that order of weight: the option, then the attribute, then the default.
 * @param {Element | null} host @param {string} attribute @param {string | false | readonly string[] | undefined} option @param {string | false | readonly string[]} fallback
 * @returns {KeySpec}
 */
export function resolveKeySpec(host, attribute, option, fallback) {
    const attr = host?.getAttribute(attribute) ?? null;
    return parseKeySpec(option ?? attr ?? fallback);
}

/**
 * Does this keydown press one of the spec's keys? A modifier the spec does not name must be up.
 * @param {KeyboardEvent} event @param {KeySpec} spec @param {{ anyShift?: boolean }} [how]
 */
export function matchesKeySpec(event, spec, how = {}) {
    return spec.some((c) => chordPressed(event, c, how.anyShift === true));
}

/** @param {KeyboardEvent} event @param {KeyChord} c @param {boolean} anyShift */
function chordPressed(event, c, anyShift) {
    if (c.mod !== (event.ctrlKey || event.metaKey) || c.alt !== event.altKey) return false;
    const typed = event.key.toLowerCase();
    // Alt changes what a letter types on a Mac (Alt+U is a dead key): the key's place decides there.
    const placed = c.alt && /^[a-z]$/.test(c.key) && event.code === `Key${c.key.toUpperCase()}`;
    if (typed !== c.key && !placed) return false;
    // A symbol (`+`, `0`, `?`) is typed with Shift on some layouts, so only a letter or a named key is exact about it.
    const symbol = c.key.length === 1 && !/^[a-z]$/.test(c.key) && !c.shift;
    return anyShift || symbol || c.shift === event.shiftKey;
}

/** The first key of a spec as the caps of a `setKeys` pair (`['Mod', 'A']`, `'j'`), or null when it is off. @param {KeySpec} spec @returns {string | readonly string[] | null} */
export function keyCaps(spec) {
    const c = spec[0];
    if (!c) return null;
    const caps = [c.mod ? 'Mod' : '', c.alt ? 'Alt' : '', c.shift ? 'Shift' : '', c.key === ' ' ? 'Space' : c.cap].filter(Boolean);
    return caps.length === 1 ? (caps[0] ?? null) : caps;
}

/** The spec with Shift held as well (the "undo" twin of a key, as Ctrl+Shift+A is of Ctrl+A). @param {KeySpec} spec @returns {KeySpec} */
export const withShift = (spec) => spec.map((c) => ({ ...c, shift: true }));

/**
 * The first key of a spec in the shortcut engine's own spelling ("Shift C", "Mod K"), for `registerShortcuts`; null when the spec is off.
 * @param {KeySpec} spec
 * @returns {string | null}
 */
export function engineKeys(spec) {
    const c = spec[0];
    if (!c) return null;
    // A named key keeps its capitals (`Enter`), as the shortcut sheet prints it; a letter is lower case, as the engine always took it.
    return [c.mod ? 'Mod' : '', c.alt ? 'Alt' : '', c.shift ? 'Shift' : '', c.key === ' ' ? 'Space' : c.key.length > 1 ? c.cap : c.key].filter(Boolean).join(' ');
}

/** The first key of a spec as a person reads it, `Ctrl+B` or `⌘+B`; empty when it is off. @param {KeySpec} spec */
export function keyLabel(spec) {
    const caps = keyCaps(spec);
    if (caps === null) return '';
    return [caps].flat().map((cap) => (cap === 'Mod' ? (isMac() ? '⌘' : 'Ctrl') : cap)).join('+');
}

/** The first key of a spec for `aria-keyshortcuts` (`Control+B`, `Meta+B`); empty when it is off. @param {KeySpec} spec */
export function ariaKeyShortcut(spec) {
    const caps = keyCaps(spec);
    if (caps === null) return '';
    return [caps].flat().map((cap) => (cap === 'Mod' ? (isMac() ? 'Meta' : 'Control') : cap.length === 1 ? cap.toUpperCase() : cap)).join('+');
}

/** Whether this is a Mac, where `Mod` is the Command key. */
const isMac = () =>
    typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(/** @type {any} */ (navigator).userAgentData?.platform ?? navigator.platform ?? '');

/** A key spec as a person reads it (⌘ or Ctrl, ⌥ or Alt). @param {string} key `Mod+Z`, `Alt+Z` */
export const keyName = (key) => key.replace(/\bmod\+/i, isMac() ? '⌘' : 'Ctrl+').replace(/\balt\+/i, isMac() ? '⌥' : 'Alt+');

/** Whether a value is written as a key spec (`Mod+K`, `+ or =`) rather than in the older spellings (`k`, `Mod K`, `mod-enter`). @param {string} text */
export const isKeySpecText = (text) => /\s+or\s+/.test(text) || (text.length > 1 && text.includes('+'));

/**
 * The keys for the shortcut engine (js/shortcuts.js) from an option, an attribute and a default. A key spec is converted; a value
 * in the engine's own spelling (`:`, `Mod K`, `g s`), which pages used before key specs, is passed through unchanged.
 * @param {Element | null} host @param {string} attribute @param {string | false | undefined} option @param {string | false} fallback
 * @returns {string | null} null when the shortcut is off
 */
export function resolveEngineKeys(host, attribute, option, fallback) {
    const raw = option ?? host?.getAttribute(attribute) ?? fallback;
    if (raw === false) return null;
    const text = raw.trim();
    if (OFF.has(text.toLowerCase())) return null;
    return isKeySpecText(text) ? engineKeys(parseKeySpec(text)) : text;
}

/** The engine's spelling of keys (`Mod e`, `g s`) for `aria-keyshortcuts` (`Control+e`, `g s`). @param {string} keys */
export function ariaFromEngineKeys(keys) {
    let prefix = '';
    /** @type {string[]} */
    const out = [];
    for (const token of keys.trim().split(/\s+/)) {
        const mod = /** @type {Record<string, string>} */ (MODS)[token.toLowerCase()];
        if (mod) {
            prefix += `${mod === 'mod' ? 'Control' : mod === 'alt' ? 'Alt' : 'Shift'}+`;
            continue;
        }
        out.push(prefix + token);
        prefix = '';
    }
    return out.join(' ');
}
