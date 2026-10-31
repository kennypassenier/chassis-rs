// The command history, kept in storage per console.
import { CONSOLE_HISTORY } from './constants.js';
import { attr, stateOf } from './model.js';

/** @param {HTMLElement} root @returns {string | null} the key history is kept under, when it is kept */
function storeKey(root) {
    const name = root.getAttribute('data-kp-remember') ?? root.getAttribute('data-kp-name');
    const mode = attr(root, 'remember', 'session');
    if (!name || mode === 'off') return null;
    return `kp-remember:console:${name}:history`;
}

/** @param {HTMLElement} root @returns {Storage | null} */
function storeOf(root) {
    try {
        return attr(root, 'remember', 'session') === 'device' ? localStorage : sessionStorage;
    } catch {
        return null;
    }
}

/** @param {HTMLElement} root */
export function loadHistory(root) {
    const key = storeKey(root);
    const store = storeOf(root);
    if (!key || !store) return [];
    try {
        const raw = JSON.parse(store.getItem(key) ?? '[]');
        return Array.isArray(raw)
            ? raw.filter((x) => typeof x === 'string').slice(-(Number(attr(root, 'history', String(CONSOLE_HISTORY))) || CONSOLE_HISTORY))
            : [];
    } catch {
        return [];
    }
}

/** @param {HTMLElement} root */
export function saveHistory(root) {
    const key = storeKey(root);
    const store = storeOf(root);
    if (!key || !store) return;
    try {
        store.setItem(key, JSON.stringify(stateOf(root).history));
    } catch {
        // Storage full or refused: the recall lasts for this page.
    }
}
