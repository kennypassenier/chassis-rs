// The page's one `y l` shortcut, shared by every anchored container of a document, and when a container last changed.

/** @typedef {ReturnType<typeof import('../strings.js').getStrings>} Strings */

/** Per document: when a container last changed, for the quiet a missing hash waits for. @type {WeakMap<Document, number>} */
export const LAST_CHANGE = new WeakMap();

/**
 * The page's one `y l` entry, which asks every container in turn whether a row of its own is focused. One entry per document,
 * not one per container: with anchors on `main` (headings) and on a table (rows) the shortcut sheet listed the key twice.
 * @type {WeakMap<Document, { providers: Set<() => (() => void) | null>, off: (() => void) | null }>}
 */
const COPY_KEY = new WeakMap();

/**
 * @param {Document} doc
 * @param {Strings} strings
 * @param {() => (() => void) | null} provider the container's way to copy its focused row, or null when none is focused
 * @returns {() => void} release
 */
export function serveCopyKey(doc, strings, provider) {
    let shared = COPY_KEY.get(doc);
    if (!shared) {
        const made = { providers: new Set(), off: /** @type {(() => void) | null} */ (null) };
        shared = made;
        COPY_KEY.set(doc, made);
        void import('../shortcuts.js').then(({ registerShortcuts }) => {
            if (made.providers.size === 0 || COPY_KEY.get(doc) !== made) return;
            made.off = registerShortcuts(
                doc.body,
                [
                    {
                        keys: 'y l',
                        what: strings.anchorKeyCopy,
                        group: strings.anchorKeyGroup,
                        when: () => [...made.providers].some((p) => p() !== null),
                        run: () => {
                            for (const p of made.providers) {
                                const go = p();
                                if (go) return go();
                            }
                        },
                    },
                ],
                { dev: false },
            );
        });
    }
    const mine = shared;
    mine.providers.add(provider);
    return () => {
        mine.providers.delete(provider);
        if (mine.providers.size === 0) {
            mine.off?.();
            if (COPY_KEY.get(doc) === mine) COPY_KEY.delete(doc);
        }
    };
}

