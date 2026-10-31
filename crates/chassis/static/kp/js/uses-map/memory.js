// What a lines view remembers: the pinned node and the view, on this device when the matrix has a `data-kp-remember` name.

/** One matrix's memory: the pinned node, the lit one, the tab stop and the undo of its wiring. @typedef {{ pin: string | null, lit: string | null, stop: string | null, off: (() => void) | null }} UsesMemory */

/** @type {WeakMap<Element, UsesMemory>} */
export const MEMORY = new WeakMap();

/** The storage key of a matrix, or null when it keeps nothing. @param {Element} el */
export const rememberKey = (el) => {
    const name = el.getAttribute('data-kp-remember');
    return name ? `kp-remember:uses:${name}` : null;
};

/** The view a matrix remembers on this device, or null. @param {Element} el @returns {'grid' | 'lines' | null} */
export function rememberedView(el) {
    const key = rememberKey(el);
    if (!key) return null;
    try {
        const v = localStorage.getItem(`${key}:view`);
        return v === 'lines' || v === 'grid' ? v : null;
    } catch {
        return null;
    }
}

/** Remember the view a matrix shows. @param {Element} el @param {'grid' | 'lines'} view */
export function rememberView(el, view) {
    const key = rememberKey(el);
    if (!key) return;
    try {
        localStorage.setItem(`${key}:view`, view);
    } catch {
        // No storage: the view lasts for this page.
    }
}

/** The memory of a matrix, made (and the stored pin read) on its first draw. @param {Element} el @returns {UsesMemory} */
export function memoryOf(el) {
    let memory = MEMORY.get(el);
    if (memory) return memory;
    memory = { pin: null, lit: null, stop: null, off: null };
    MEMORY.set(el, memory);
    const key = rememberKey(el);
    if (key) {
        try {
            memory.pin = localStorage.getItem(`${key}:pin`);
        } catch {
            // No storage.
        }
    }
    return memory;
}

/** Keep (or clear) the pinned node on this device. @param {Element} el @param {string | null} key */
export function storePin(el, key) {
    const store = rememberKey(el);
    if (!store) return;
    try {
        if (key) localStorage.setItem(`${store}:pin`, key);
        else localStorage.removeItem(`${store}:pin`);
    } catch {
        // No storage.
    }
}
