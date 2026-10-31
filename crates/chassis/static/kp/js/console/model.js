// What a console remembers and reads: its state, its attributes, the elapsed time and the announcement.
/** @typedef {import('./types.js').ConsoleState} ConsoleState */

/** @type {WeakMap<Element, ConsoleState>} */
export const STATE = new WeakMap();

/** @param {string} className @param {string} [tag] */
export const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} root @param {string} name @param {string} fallback */
export const attr = (root, name, fallback) => root.getAttribute(`data-kp-console-${name}`) ?? fallback;

/** @param {HTMLElement} root @returns {ConsoleState} */
export function stateOf(root) {
    let st = STATE.get(root);
    if (!st) {
        st = {
            run: null,
            complete: null,
            blocks: [],
            jobs: new Map(),
            history: [],
            at: -1,
            draft: '',
            spec: {},
            context: { options: [], value: '', state: 'ready', label: '' },
            card: null,
            tick: 0,
            pending: null,
            pendingTimer: 0,
            off: [],
            showAll: false,
            said: '',
            barState: '',
            hintHeight: 0,
        };
        STATE.set(root, st);
    }
    return st;
}

/** Whether a line is one the app wants confirmed. @param {HTMLElement} root @param {string} command */
export function needsConfirm(root, command) {
    const raw = attr(root, 'confirm', '');
    if (!raw) return false;
    const re = raw.startsWith('/') && raw.lastIndexOf('/') > 0 ? raw.slice(1, raw.lastIndexOf('/')) : null;
    if (re) {
        try {
            return new RegExp(re).test(command);
        } catch {
            return false;
        }
    }
    return raw
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean)
        .some((w) => command.includes(w));
}

/** @param {number} ms */
export function elapsed(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    if (total < 60) return `${total} s`;
    const m = Math.floor(total / 60);
    return `${m} min ${total % 60} s`;
}

/** @param {HTMLElement} root @param {string} message */
export function say(root, message) {
    if (root.getAttribute('data-kp-announce') === 'off') return;
    let region = /** @type {HTMLElement | null} */ (root.querySelector(':scope > .kp-console__live'));
    if (!region) {
        region = el('kp-sr-only kp-console__live', 'span');
        region.setAttribute('role', 'status');
        root.append(region);
    }
    const target = region;
    target.textContent = '';
    setTimeout(() => (target.textContent = message), 60);
}
