// The checklist's fixed parts (the bar, the body, the voice and the empty line), made on first use, and the voice.

/** How long the voice waits before it speaks, so a second identical sentence is still heard [ms]. */
const SAY_DELAY_MS = 60;

/** An element with a class. @param {string} className @param {string} [tag] */
export const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} list @param {string} name @returns {HTMLElement} */
export function part(list, name) {
    let node = /** @type {HTMLElement | null} */ (
        list.querySelector(`:scope > .kp-checklist__${name}, :scope > .kp-checklist__body > .kp-checklist__${name}`)
    );
    if (node) return node;
    if (name === 'bar') {
        node = el('kp-checklist__bar');
        const status = el('kp-checklist__status');
        const said = el('kp-checklist__said', 'span');
        const undo = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm kp-checklist__undo', 'button'));
        undo.type = 'button';
        undo.hidden = true;
        status.append(said, undo);
        const actions = el('kp-checklist__actions');
        const all = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-button--sm kp-checklist__all', 'button'));
        all.type = 'button';
        const none = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-button--sm kp-checklist__none', 'button'));
        none.type = 'button';
        const clear = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-button--sm kp-checklist__clear', 'button'));
        clear.type = 'button';
        actions.append(all, none, clear);
        node.append(status, actions);
        list.prepend(node);
    } else if (name === 'body') {
        node = el('kp-checklist__body');
        part(list, 'bar').after(node);
    } else if (name === 'live') {
        node = el('kp-sr-only kp-checklist__live', 'span');
        node.setAttribute('role', 'status');
        list.append(node);
    } else {
        // The empty line is a plate (it holds a heading and a Retry), so a div, not a paragraph [r6r8-1019].
        node = el(`kp-checklist__${name}`, 'div');
        part(list, 'body').append(node);
    }
    return node;
}

/** @param {Element} list @param {string} message */
export function say(list, message) {
    const region = part(list, 'live');
    region.textContent = '';
    setTimeout(() => (region.textContent = message), 60);
}

