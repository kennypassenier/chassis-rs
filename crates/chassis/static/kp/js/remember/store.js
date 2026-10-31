// Where remembered state is kept: the defaults, the storage, an element's name, the claims on a name, a memory for one
// element, and pruning what is no longer in use.

import { getStrings } from '../strings.js';

/** @typedef {import('../remember.js').Memory} Memory */
/** @typedef {import('../remember.js').Remembered} Remembered */
/** @typedef {import('../remember.js').RememberConfig} RememberConfig */

/** The attribute an author writes to ask for a memory. A contract value [TH26]. */
export const REMEMBER_ATTRIBUTE = 'data-kp-remember';

/** Fired on the element that was refused a memory because its name was taken: `{ name, component, other }`. */
export const REMEMBER_CLASH_EVENT = 'kp-remember-clash';

/** The first segment of every key this package writes. */
export const REMEMBER_PREFIX = 'kp-remember';

/** The document-wide defaults, settable once by a consumer. */
export const config = { prefix: REMEMBER_PREFIX, storage: /** @type {Storage | null | undefined} */ (undefined) };

/**
 * Set the defaults once: the first key segment, and where the values go.
 * `storage: null` turns the whole mechanism off without touching a
 * component — the way out KT6 asks for.
 *
 * @param {RememberConfig} next
 */
export function configureRemember(next) {
    if (next.prefix !== undefined) config.prefix = next.prefix;
    if (next.storage !== undefined) config.storage = next.storage;
}

/**
 * localStorage where there is one, null where reaching it throws.
 *
 * @param {Storage | null | undefined} given what this call was handed
 * @returns {Storage | null}
 */
export function storage(given) {
    if (given !== undefined) return given;
    if (config.storage !== undefined) return config.storage;
    try {
        return globalThis.localStorage ?? null;
    } catch {
        // A browser set to refuse site data throws on the property itself.
        return null;
    }
}

/**
 * The older spelling each component accepts, so markup written before this
 * file existed keeps its memory. The name is the same; the key it composes
 * is the one above.
 *
 * @type {Partial<Record<Remembered, string>>}
 */
export const ALIASES = { sidenav: 'data-kp-sidenav-remember' };

/**
 * The name an element gave itself, or null when it asked for nothing.
 *
 * @param {Element} element
 * @param {Remembered} component
 * @returns {string | null}
 */
export function rememberedName(element, component) {
    const own = element.getAttribute(REMEMBER_ATTRIBUTE);
    if (own !== null && own !== '') return own;
    const alias = ALIASES[component];
    const older = alias === undefined ? null : element.getAttribute(alias);
    return older === null || older === '' ? null : older;
}

/** Who holds each `<component>:<name>` on this page. @type {Map<string, Element>} */
const claims = new Map();
/** Clashes already reported, so a render loop cannot shout. @type {Set<string>} */
const reported = new Set();

/**
 * Drop every claim. For a test, and for a consumer who tears a page down
 * and builds it again inside one document [KT6].
 */
export function forgetClaims() {
    claims.clear();
    reported.clear();
}

/**
 * @param {Element} element
 * @param {Remembered} component
 * @param {string} name
 * @param {Element} other
 */
function reportClash(element, component, name, other) {
    const claim = `${component}:${name}`;
    if (!reported.has(claim)) {
        reported.add(claim);
        console.warn(getStrings().rememberClash(name, component));
    }
    element.dispatchEvent(new CustomEvent(REMEMBER_CLASH_EVENT, { bubbles: true, detail: { name, component, other } }));
}

/**
 * The memory for one element, or null when it asked for none — and null
 * too when another element of the same component already answers to that
 * name, because two of them sharing one key is the fault the name prevents.
 *
 * @param {Element} element
 * @param {Remembered} component
 * @param {{ storage?: Storage | null }} [options] where the values go, for this element alone
 * @returns {Memory | null}
 */
export function memoryFor(element, component, { storage: given } = {}) {
    const name = rememberedName(element, component);
    if (name === null) return null;
    const claim = `${component}:${name}`;
    const holder = claims.get(claim);
    // A holder that has left the document releases its claim: a page that
    // rebuilds its navigation must not lose the memory to its own ghost.
    if (holder !== undefined && holder !== element && holder.isConnected) {
        reportClash(element, component, name, holder);
        return null;
    }
    claims.set(claim, element);
    const key = (/** @type {string} */ slot) => `${config.prefix}:${component}:${name}:${slot}`;
    return {
        name,
        key,
        read: (slot, fallback) => {
            const store = storage(given);
            if (store === null) return fallback;
            try {
                const raw = store.getItem(key(slot));
                if (raw === null) return fallback;
                return JSON.parse(raw);
            } catch {
                // No storage, or a value somebody else wrote: no memory is
                // a valid answer, and a broken one is the same answer.
                return fallback;
            }
        },
        write: (slot, value) => {
            const store = storage(given);
            if (store === null) return false;
            try {
                store.setItem(key(slot), JSON.stringify(value));
                return true;
            } catch {
                // A full or refused quota loses the memory, never the component.
                return false;
            }
        },
        forget: (slot) => {
            const store = storage(given);
            if (store === null) return;
            try {
                store.removeItem(key(slot));
            } catch {
                /* nothing to forget */
            }
        },
    };
}

/**
 * Forget the stored state of every element of `component` whose name starts
 * with `prefix` and is not in `names`: a page whose groups come and go
 * (named `apps-<group>`) prunes the groups that no longer exist, so its
 * memory does not grow without end.
 *
 * @param {Remembered} component
 * @param {string} prefix
 * @param {Iterable<string>} names the names still in use
 * @param {{ storage?: Storage | null }} [options]
 * @returns {number} how many stored values were removed
 */
export function forgetRememberedExcept(component, prefix, names, { storage: given } = {}) {
    const store = storage(given);
    if (store === null) return 0;
    const keep = new Set(names);
    const head = `${config.prefix}:${component}:`;
    let removed = 0;
    try {
        /** @type {string[]} */
        const doomed = [];
        for (let at = 0; at < store.length; at += 1) {
            const key = store.key(at);
            if (key === null || !key.startsWith(head)) continue;
            const rest = key.slice(head.length);
            const name = rest.slice(0, rest.lastIndexOf(':'));
            if (name.startsWith(prefix) && !keep.has(name)) doomed.push(key);
        }
        for (const key of doomed) {
            store.removeItem(key);
            removed += 1;
        }
    } catch {
        /* no storage to prune */
    }
    return removed;
}
