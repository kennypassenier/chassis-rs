// A code's selector, events and numbers, its per-element state, and the small helpers every part shares. The state is a
// registry and not controller state on purpose: setQr() may give a code its link before (or without) wiring it.

/** The codes this module looks after. */
export const QR = '[data-kp-qr]';
/** Fired when the link was copied: `{ value }`. */
export const QR_COPY_EVENT = 'kp-qr-copy';
/** Fired when a hidden code is shown or hidden: `{ shown }`. */
export const QR_REVEAL_EVENT = 'kp-qr-reveal';
/** Fired once when the link's time ran out. */
export const QR_EXPIRED_EVENT = 'kp-qr-expired';
/** Fired by the Retry of a code that could not be made. */
export const QR_RETRY_EVENT = 'kp-qr-retry';
/** The characters of a link shown before it is folded behind "Show all". */
export const QR_FOLD = 160;
/** The error correction levels, lowest first. */
export const QR_LEVELS = Object.freeze(['L', 'M', 'Q', 'H']);
/** The plate's colours: dark modules on a light plate, whatever the theme (see the header). */
export const QR_PLATE = Object.freeze({ ground: '#ffffff', ink: '#000000' });

/** @typedef {import('../qr.js').QrSpec} QrSpec */
/** @typedef {{ open: boolean, spec: QrSpec, mode: string, timer: number, shown: boolean, said: string, card: import('../busy-card.js').BusyCard | null, expired: boolean }} QrState */
/** @type {WeakMap<Element, QrState>} */
const STATE = new WeakMap();

/** How long the voice waits before it speaks, so a second identical sentence is still heard [ms]. */
const SAY_DELAY_MS = 60;

/** @param {string} className @param {string} [tag] */
export const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} root @param {string} name @param {string} fallback */
export const attr = (root, name, fallback) => root.getAttribute(`data-kp-qr-${name}`) ?? fallback;

/** @param {HTMLElement} root */
export function stateOf(root) {
    let st = STATE.get(root);
    if (!st) {
        st = { open: false, spec: {}, mode: attr(root, 'reveal', 'shown'), timer: 0, shown: attr(root, 'reveal', 'shown') !== 'click', said: '', card: null, expired: false };
        STATE.set(root, st);
    }
    return st;
}

/** @param {HTMLElement} root */
export const valueOf = (root) => stateOf(root).spec.value ?? root.getAttribute('data-kp-qr-value') ?? '';

/** @param {HTMLElement} root @param {string} message */
export function say(root, message) {
    if (root.getAttribute('data-kp-announce') === 'off') return;
    let region = /** @type {HTMLElement | null} */ (root.querySelector(':scope > .kp-qr__live'));
    if (!region) {
        region = el('kp-sr-only kp-qr__live', 'span');
        region.setAttribute('role', 'status');
        root.append(region);
    }
    const target = region;
    target.textContent = '';
    setTimeout(() => (target.textContent = message), 60);
}

