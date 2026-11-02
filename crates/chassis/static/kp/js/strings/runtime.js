// The current strings and the functions that read, replace and publish them.
import { DEFAULT_STRINGS } from './defaults.js';
/** @typedef {import('./types.js').Strings} Strings */

// STRINGS_NL was removed in 4.0.0 [D3]. Kenny decided that on
// 2026-09-05: the Dutch set left js/strings.js and index.js. It was a
// bridge for the three consumers who read Dutch until 2.0.0, and
// removing an export is a breaking change, so it waited for a major.
// S20 keeps it reachable: the v2.0.0 and v3.0.0 tags still carry the
// seventy-two lines verbatim, and MIGRATION.md says where.

/** @type {Strings} */
let current = DEFAULT_STRINGS;

/**
 * What the app handed to `setStrings()`, kept apart from the dictionary so
 * a change of language never wipes the app's own words: they always win.
 *
 * @type {Partial<Strings>}
 */
let fromApp = {};

/** @typedef {Partial<Strings> | (() => Promise<Partial<Strings>>)} DictionarySource */

/**
 * The dictionaries by language tag, lowercase: an object once loaded, a
 * loader until then [habits-1101].
 *
 * @type {Map<string, DictionarySource>}
 */
const dictionaries = new Map();

/** Loads running now, one per tag. @type {Map<string, {source: DictionarySource, promise: Promise<void>}>} */
const loading = new Map();

/** The loader that failed last, per tag; a failed loader is kept and tried again on the next follow. @type {Map<string, DictionarySource>} */
const failed = new Map();

/** The dictionary object the current strings were laid out from, if any. @type {Partial<Strings> | undefined} */
let published;

/** A language chosen with `setLanguage()`; it wins over the root's attributes. @type {string | null} */
let chosen = null;

/** The language the current strings speak, `en` when no dictionary matched. */
let language = 'en';

/** Settles once the strings speak the language the root asks for. @type {Promise<void>} */
let ready = Promise.resolve();

/** @type {MutationObserver | null} */
let observer = null;

/**
 * Replace some or all of the strings, for the framework-free channel and
 * for anything that reads them outside React.
 *
 * Merged rather than replaced: a consumer that wants one word does not
 * have to restate the other seventy, and a key added in a later version
 * keeps working instead of becoming `undefined` on their page.
 *
 * @param {Partial<Strings>} next
 * @returns {Strings} the merged result
 */
export function setStrings(next) {
    fromApp = { ...fromApp, ...next };
    return publish();
}

/**
 * Lay the strings out again: the English, the dictionary of the language in
 * use, then the app's own words. Writes the CSS words onto the root and,
 * when the language moved, tells the page with `kp-strings-change`.
 *
 * @returns {Strings}
 */
function publish() {
    current = Object.freeze({ ...DEFAULT_STRINGS, ...published, ...fromApp });
    if (typeof document !== 'undefined') applyStringProperties(document.documentElement, current);
    return current;
}

/** @param {unknown} tag @returns {string} lowercase, `_` as `-`, empty when absent */
const normaliseTag = (tag) => String(tag ?? '').trim().toLowerCase().replace(/_/g, '-');

/**
 * The language tag the page asks for: `setLanguage()`, else `data-kp-lang`
 * on the root, else its `lang`; an empty one counts as absent. Matched to a
 * registered dictionary by the whole tag first (`nl-be`), then by ever
 * shorter prefixes (`zh-hant-tw`, `zh-hant`, `zh`); `nl_BE` reads as `nl-be`.
 *
 * @returns {string} a registered tag, or `en`
 */
function wantedLanguage() {
    const root = typeof document === 'undefined' ? null : document.documentElement;
    const asked = [chosen, root?.getAttribute('data-kp-lang'), root?.getAttribute('lang')].map(normaliseTag).find((tag) => tag !== '') ?? 'en';
    const parts = asked.split('-');
    while (parts.length > 0) {
        const tag = parts.join('-');
        if (dictionaries.has(tag)) return tag;
        parts.pop();
    }
    return 'en';
}

/**
 * Load a dictionary once at a time per tag. A loader that throws or rejects
 * is kept and marked failed (the next follow retries it); the result is
 * stored only while the tag still holds this very loader.
 *
 * @param {string} tag
 * @param {() => Promise<Partial<Strings>>} source
 * @returns {Promise<void>} never rejects
 */
function load(tag, source) {
    const running = loading.get(tag);
    if (running?.source === source) return running.promise;
    const promise = Promise.resolve()
        .then(source)
        .then((loaded) => {
            if (dictionaries.get(tag) === source) dictionaries.set(tag, Object.freeze({ ...loaded }));
        })
        .catch((error) => {
            failed.set(tag, source);
            console.error(`kp-themes: the "${tag}" dictionary could not be loaded; the strings stay in English.`, error);
        })
        .finally(() => {
            if (loading.get(tag)?.source === source) loading.delete(tag);
        });
    loading.set(tag, { source, promise });
    return promise;
}

/**
 * Publish the dictionary of `wanted`, and tell the page when the language
 * or the active dictionary object changed; do nothing when neither did.
 *
 * @param {string} wanted
 * @param {DictionarySource | undefined} source
 */
function settle(wanted, source) {
    const dictionary = typeof source === 'object' ? source : undefined;
    const moved = wanted !== language;
    if (!moved && dictionary === published) return;
    const swapped = dictionary !== published;
    language = wanted;
    published = dictionary;
    publish();
    if (moved || swapped) announce();
}

/**
 * Follow the page's language: load its dictionary when it is a loader, then
 * publish. A load that finishes after the page moved on is dropped.
 *
 * @param {boolean} [retry] false right after a load, so a failed one is not tried again at once
 * @returns {Promise<void>}
 */
function follow(retry = true) {
    const wanted = wantedLanguage();
    const source = dictionaries.get(wanted);
    if (typeof source === 'function' && retry && failed.get(wanted) === source) failed.delete(wanted);
    if (typeof source !== 'function' || failed.get(wanted) === source) {
        settle(typeof source === 'function' ? 'en' : wanted, typeof source === 'function' ? undefined : source);
        ready = Promise.resolve();
        return ready;
    }
    ready = load(wanted, source)
        .then(() => (wantedLanguage() === wanted ? follow(false) : undefined))
        .catch((error) => {
            failed.set(wanted, source);
            if (dictionaries.get(wanted) !== source) dictionaries.set(wanted, source);
            console.error(`kp-themes: the "${wanted}" dictionary could not be applied; the strings stay in English.`, error);
            return follow(false);
        });
    return ready;
}

/** Tell the page the strings changed language, for parts that redraw their words. */
function announce() {
    if (typeof document === 'undefined') return;
    document.dispatchEvent(new CustomEvent('kp-strings-change', { detail: { language } }));
}

/** Watch the root's `lang` and `data-kp-lang`, once, from the first dictionary on. */
function watchRoot() {
    if (observer !== null || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    observer = new MutationObserver(() => void follow());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'data-kp-lang'] });
}

/**
 * Register a dictionary for a language [habits-1101]. Its words sit between
 * the English and the app's own `setStrings()`; a key it leaves out stays
 * English. The source is the words, or a function that loads them, so a
 * page that never speaks the language never downloads them.
 *
 * @param {string} tag a language tag, `nl` (matches `nl`, `nl-BE`, `nl-NL`) or a whole one
 * @param {DictionarySource} source
 * @returns {Promise<void>} settles once the strings follow the page again
 */
export function registerDictionary(tag, source) {
    dictionaries.set(normaliseTag(tag), typeof source === 'function' ? source : Object.freeze({ ...source }));
    watchRoot();
    return follow();
}

/**
 * Choose the language yourself, over the root's `data-kp-lang` and `lang`;
 * `null` hands the choice back to the root.
 *
 * @param {string | null} tag
 * @returns {Promise<void>} settles once the strings speak it
 */
export function setLanguage(tag) {
    chosen = tag === null ? null : String(tag);
    watchRoot();
    return follow();
}

/** @returns {string} the language the strings speak now, a registered tag or `en` */
export function getLanguage() {
    return language;
}

/** @returns {Promise<void>} settles once the strings speak the language the page asks for */
export function languageReady() {
    return ready;
}

/** The noise a deciphered word starts from, seven glyphs. */
const CIPHER = '#&$?%@/';

/**
 * The words the stylesheets draw themselves, as custom properties
 * [scope-143]. A keyframe cannot read this module, so the word a busy
 * picture spells reaches it as `--kp-loading-word-0` to `-7`: the eight
 * ticks of cyberpunk's decipher, from all noise to the whole word. The
 * register keeps the English as each property's fallback, so a page that
 * never calls `setStrings()` draws what it always drew.
 *
 * @param {Strings} [strings] the strings to draw from, the current ones by default
 * @returns {Record<string, string>} property name to a CSS string value
 */
export function stringProperties(strings = current) {
    const word = strings.loadingWord;
    /** @type {Record<string, string>} */
    const out = {};
    for (let tick = 0; tick <= 7; tick++) {
        const shown = Math.round((tick * word.length) / 7);
        const turn = (tick * 5) % CIPHER.length;
        const noise = (CIPHER.slice(turn) + CIPHER.slice(0, turn)).repeat(Math.ceil(word.length / CIPHER.length) + 1);
        out[`--kp-loading-word-${tick}`] = JSON.stringify(word.slice(0, shown) + noise.slice(0, word.length - shown));
    }
    return out;
}

/**
 * Write `stringProperties()` onto an element, so every stylesheet under it
 * draws the consumer's words. `setStrings()` does this on the document
 * root; call it yourself for a subtree that speaks another language.
 *
 * @param {HTMLElement} root
 * @param {Strings} [strings]
 */
export function applyStringProperties(root, strings = current) {
    for (const [name, value] of Object.entries(stringProperties(strings))) root.style.setProperty(name, value);
}

/** @returns {Partial<Strings>} the dictionary of the language in use, without the app's own words; empty for English [habits-1101] */
export function getLanguageDictionary() {
    return published ?? {};
}

/** @returns {Strings} the strings as they stand */
export function getStrings() {
    return current;
}

/**
 * The strings a component should use: the global ones, with anything the
 * caller passed layered on top.
 *
 * @param {Partial<Strings>} [overrides]
 * @returns {Strings}
 */
export function resolveStrings(overrides) {
    return overrides === undefined ? current : { ...current, ...overrides };
}
