// The theme state, owned by the document rather than by either channel
// [AR5, AR6, TH26].
//
// The React hook used to keep the current theme and its subscriber list in
// module state. A plain <script> cannot reach a React module's closure, so
// on the comparison page the two pickers would each set the theme
// correctly and each fail to update the other's selection mark — on the
// very surface built to compare them.
//
// So: the truth is `document.documentElement.dataset.theme`, and a change
// is announced as one DOM event both channels listen to. Cross-tab
// following rides the same bus, because a `storage` event is translated
// into the same announcement.
//
// This file is plain ESM with no dependencies. React sits on top of it,
// not underneath.
//
// Since 3.0.0 [KT6]: where the theme lives is a choice — the root
// element, the class that marks a dark theme and the storage key are
// settable once with configureTheme() or per call; a change can be
// refused by a listener on BEFORE_THEME_EVENT; the change event bubbles
// from the root so a scoped listener can catch it; a strict apply
// reports an unknown name instead of silently substituting the default;
// and the cross-tab subscription can be declined.

import { THEMES, DEFAULT_THEME, STORAGE_KEY } from './theme-registry.js';
import { getStrings } from './strings.js';

/**
 * A theme name, as a union of the eleven that exist [KT4].
 *
 * Only the OUTPUTS of this module narrowed to it. What a function accepts
 * stays lenient — `storeTheme` and `initializeTheme` still take a plain
 * string — because narrowing an input breaks a consumer that reads a theme
 * out of config or a database, which is exactly what JobTracker and
 * kp-soft do. Narrowing a return value cannot break anyone.
 *
 * @typedef {import('./theme-registry.js').ThemeName} ThemeName
 */

/**
 * The event both channels listen to. A contract value: a consumer may
 * listen for it too, so it does not get renamed casually [TH26]. It
 * bubbles from the root, so `document.addEventListener` sees it as it
 * always did, and so does a listener on the root itself.
 */
export const THEME_EVENT = 'kp-theme-change';
/** Fired before a change, cancelable: `{ theme, previous }`. preventDefault() keeps the current theme. */
export const BEFORE_THEME_EVENT = 'kp-theme-before-change';
/**
 * Fired when a name was dropped: `{ requested, applied, source }` [TH97].
 *
 * `source` is one of `stored`, `current`, `apply` or `cross-tab` — the
 * four places a name can be dropped (AR25). A consumer listening to this
 * learns what its page asked for and what it got, which is the whole of
 * what the silence used to cost.
 */
export const UNKNOWN_THEME_EVENT = 'kp-theme-unknown';

/** @typedef {{ root?: Element, darkClass?: string | null, storageKey?: string }} ThemeConfig */

/** The document-wide defaults, settable once by a consumer. */
const config = { root: /** @type {Element | null} */ (null), darkClass: /** @type {string | null} */ ('dark'), storageKey: STORAGE_KEY };

/**
 * Set the defaults once: which element wears the theme (default: the
 * document element), which class marks a dark theme (default `dark`; null
 * for none), and the storage key.
 *
 * @param {ThemeConfig} next
 */
export function configureTheme(next) {
    if (next.root !== undefined) config.root = next.root;
    if (next.darkClass !== undefined) config.darkClass = next.darkClass;
    if (next.storageKey !== undefined) config.storageKey = next.storageKey;
}

/** @param {Element | undefined} root */
const rootOf = (root) => root ?? config.root ?? document.documentElement;

// Widened back to string on purpose: this array is what the runtime check
// searches, and `includes` on a ThemeName[] refuses the unknown string we
// are asking about. The narrowing happens in the guard's return type,
// where it is earned rather than assumed.
const NAMES = /** @type {readonly string[]} */ (THEMES.map((t) => t.name));
const DARK = new Set(THEMES.filter((t) => t.dark).map((t) => t.name));

/** @param {unknown} value @returns {value is ThemeName} */
export const isTheme = (value) => typeof value === 'string' && NAMES.includes(value);

/** @param {unknown} value @returns {ThemeName | null} */
const asTheme = (value) => (isTheme(value) ? value : null);

/**
 * Where "already said this" is remembered [AR25].
 *
 * **sessionStorage, not a module-level flag, and that is the decision.**
 * In a server-rendered dashboard — almanac, kyu, kp-soft — every click is
 * a page load, so the module is evaluated again and a module-level flag
 * is a fresh flag. The warning would then fire on every click, and the
 * event with it, which is precisely what AR25 forbids: a consumer
 * listening to `kp-theme-unknown` would get one per navigation and have
 * to build its own throttle. sessionStorage survives a navigation inside
 * the tab and dies with the tab, which is what "a session" means here.
 *
 * The module-level Set in front of it is a cache, not the mechanism, and
 * it is also the fallback where sessionStorage throws — private mode, a
 * blocked cookie policy, a sandboxed iframe. There the warning lasts as
 * long as the document, which is the best a page with no storage can do,
 * and it is still better than silence.
 *
 * Kept per NAME rather than as one boolean: a page whose stored choice
 * and whose markup name two different unknown themes has two faults, and
 * hearing about one of them is how the second one stays hidden. No name
 * is ever reported twice, which is the property AR25 is about.
 *
 * Its own key. `STORAGE_KEY` is never written here: persisting the
 * fallback would destroy a preference that starts working again the day
 * the consumer copies a newer stylesheet.
 */
const REPORT_KEY = 'kp-themes-unknown-reported';

/** @type {Set<string>} */
const reported = new Set();

/** @param {string} name @returns {boolean} */
function alreadyReported(name) {
    if (reported.has(name)) return true;
    try {
        const raw = sessionStorage.getItem(REPORT_KEY);
        if (raw !== null && raw.split(' ').includes(name)) {
            reported.add(name);
            return true;
        }
    } catch {
        // No session storage: the Set above is all there is.
    }
    return false;
}

/** @param {string} name */
function remember(name) {
    reported.add(name);
    try {
        const raw = sessionStorage.getItem(REPORT_KEY);
        const names = raw === null || raw === '' ? [] : raw.split(' ');
        if (!names.includes(name)) sessionStorage.setItem(REPORT_KEY, [...names, name].join(' '));
    } catch {
        // See above.
    }
}

/**
 * Say once, out loud, that a name was dropped [TH97, AR25].
 *
 * The console for a developer reading the page, the event for code that
 * wants to do something about it — a health banner, a log line, a fetch
 * to the server that served the wrong name. Both are behind the same
 * once-per-session gate: an event nobody can afford to listen to is not
 * an improvement on silence.
 *
 * @param {unknown} requested the name that was asked for
 * @param {ThemeName} applied the name that was used instead
 * @param {'stored' | 'current' | 'apply' | 'cross-tab'} source which of the four places dropped it
 * @param {Element} [root] where the event is dispatched from
 * @returns {boolean} whether this call was the one that reported it
 */
function reportUnknown(requested, applied, source, root) {
    const name = String(requested);
    if (alreadyReported(name)) return false;
    remember(name);
    console.warn(getStrings().themeUnknown(name, applied));
    if (typeof document === 'undefined') return true;
    const element = root ?? rootOf(undefined);
    element.dispatchEvent(new CustomEvent(UNKNOWN_THEME_EVENT, { bubbles: true, detail: { requested: name, applied, source } }));
    return true;
}

/**
 * A value that was actually there and is not a theme.
 *
 * An absent attribute and an empty one are not faults: `data-theme=""` is
 * what a server writes when it has no preference to write.
 *
 * @param {string | null} raw
 * @returns {raw is string}
 */
const isDropped = (raw) => raw !== null && raw !== '' && !isTheme(raw);

/**
 * @param {{ root?: Element }} [options]
 * @returns {ThemeName} the theme the root is currently wearing
 */
export function currentTheme({ root } = {}) {
    if (typeof document === 'undefined') return DEFAULT_THEME;
    const element = rootOf(root);
    const raw = element.getAttribute('data-theme');
    // Site 2 of 4 [AR25]. The name was already gone by the time
    // applyTheme could have seen it: `?? DEFAULT_THEME` below is the
    // silence this exists to break.
    if (isDropped(raw)) reportUnknown(raw, DEFAULT_THEME, 'current', element);
    return asTheme(raw) ?? DEFAULT_THEME;
}

/**
 * Put a theme on the root and tell everyone.
 *
 * Validation lives here rather than in each caller: this is the exported
 * entry point and was the only one that did not validate, which is how an
 * unknown value used to reach the DOM through `applyTheme` while the same
 * value was rejected by the hook (AR6, adopted from the critic).
 *
 * @param {unknown} theme
 * @param {{ root?: Element, darkClass?: string | null, strict?: boolean, announce?: boolean }} [options]
 *   strict: throw on an unknown name instead of substituting the default; announce: dispatch the events (default true)
 * @returns {ThemeName} the theme actually applied — DEFAULT_THEME for anything unknown
 */
export function applyTheme(theme, { root, darkClass, strict = false, announce = true } = {}) {
    const known = asTheme(theme);
    if (known === null && strict) throw new RangeError(`kp-themes: "${String(theme)}" is not a theme`);
    const next = known ?? DEFAULT_THEME;
    const element = rootOf(root);
    // Site 3 of 4 [AR25]. Only where the name is actually dropped: the
    // strict branch above threw, and a thrown RangeError is as loud as
    // this package gets. `undefined` is the caller passing nothing, not a
    // name that failed.
    if (known === null && theme !== null && theme !== undefined && theme !== '') reportUnknown(theme, next, 'apply', element);
    const previous = asTheme(element.getAttribute('data-theme'));
    if (announce && previous !== next) {
        const ask = new CustomEvent(BEFORE_THEME_EVENT, { bubbles: true, cancelable: true, detail: { theme: next, previous } });
        if (!element.dispatchEvent(ask)) return previous ?? DEFAULT_THEME;
    }
    element.setAttribute('data-theme', next);
    // The `dark` class is what a consumer's existing `dark:` variants key
    // on. Kept as a contract value [TH26], derived from the token source
    // rather than from a hand-kept list: kyu believed in four dark themes
    // where there are three.
    const cls = darkClass === undefined ? config.darkClass : darkClass;
    if (cls) element.classList.toggle(cls, DARK.has(next));
    if (announce && previous !== next) {
        element.dispatchEvent(new CustomEvent(THEME_EVENT, { bubbles: true, detail: { theme: next, previous, root: element } }));
    }
    return next;
}

/**
 * Remember the choice. Returns false when storage refused — private mode,
 * blocked storage, a full quota. The caller shows that; it is not swallowed
 * [AR6], because in a server-rendered dashboard a preference that silently
 * fails to save is indistinguishable from a broken picker.
 *
 * @param {string} theme
 * @param {{ key?: string, storage?: Storage }} [options]
 * @returns {boolean} whether the choice will survive a reload
 */
export function storeTheme(theme, { key, storage } = {}) {
    try {
        (storage ?? localStorage).setItem(key ?? config.storageKey, theme);
        return true;
    } catch {
        return false;
    }
}

/**
 * @param {{ key?: string, storage?: Storage }} [options]
 * @returns {ThemeName | null} the stored choice, or null if there is none or storage is unreadable
 */
export function storedTheme({ key, storage } = {}) {
    /** @type {string | null} */
    let raw = null;
    try {
        raw = (storage ?? localStorage).getItem(key ?? config.storageKey);
    } catch {
        // Unreadable storage is not an unknown name; it is no name.
        return null;
    }
    // Site 1 of 4, and the one almanac actually hit [AR25, S29]: a
    // preference stored while the page knew twenty-four themes, read back
    // by a build that knows eleven. The stored value stays exactly as it
    // is — it will be right again the day that page gets a newer js/.
    if (isDropped(raw)) reportUnknown(raw, DEFAULT_THEME, 'stored');
    return asTheme(raw);
}

/**
 * Before anything renders: wear the last known choice. Six lines in a
 * consumer's <head>, deliberately ignorant of which themes are dark —
 * that knowledge lives in the generated registry [TH23].
 *
 * @param {string} [fallback]
 * @param {{ root?: Element, key?: string }} [options]
 * @returns {ThemeName}
 */
export function initializeTheme(fallback = DEFAULT_THEME, { root, key } = {}) {
    return applyTheme(storedTheme({ key }) ?? fallback, { root });
}

/**
 * Listen for theme changes, whoever made them: this tab's React picker,
 * this tab's framework-free picker, or — unless declined — another tab.
 *
 * @param {(theme: ThemeName, detail: { previous: ThemeName | null, root: Element }) => void} listener
 * @param {{ crossTab?: boolean, root?: Element, key?: string }} [options]
 * @returns {() => void} unsubscribe
 */
export function onThemeChange(listener, { crossTab = true, root, key } = {}) {
    if (typeof document === 'undefined') return () => {};
    const target = root ?? document;
    /** @param {Event} e */
    const onEvent = (e) => {
        const detail = /** @type {CustomEvent} */ (e).detail;
        listener(detail.theme, { previous: detail.previous, root: detail.root });
    };
    /** @param {StorageEvent} e */
    const onStorage = (e) => {
        // Another tab changed the choice. Translate it into the same
        // announcement rather than a second mechanism, so a subscriber
        // never has to know which tab a change came from.
        if (e.key !== (key ?? config.storageKey)) return;
        // Site 4 of 4 [AR25]. The other tab may be a newer deployment of
        // the same app, which is how this one gets a name it does not
        // have. Nothing is applied and nothing is stored; this tab keeps
        // what it is wearing and says so.
        if (isDropped(e.newValue)) {
            reportUnknown(e.newValue, currentTheme({ root }), 'cross-tab', rootOf(root));
            return;
        }
        const next = asTheme(e.newValue);
        if (next && next !== currentTheme({ root })) applyTheme(next, { root });
    };
    target.addEventListener(THEME_EVENT, onEvent);
    if (crossTab) window.addEventListener('storage', onStorage);
    return () => {
        target.removeEventListener(THEME_EVENT, onEvent);
        if (crossTab) window.removeEventListener('storage', onStorage);
    };
}

export { THEMES, DEFAULT_THEME, STORAGE_KEY };
