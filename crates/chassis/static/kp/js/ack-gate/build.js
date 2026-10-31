// The gate's markup: the notes link, the tick, the problem line with its Retry, and the frame that holds the words and the side. Nothing here touches the host.

/** @typedef {import('../strings.js').Strings} Strings */

/**
 * @param {Document} doc @param {string} className @param {string} [tag]
 * @returns {HTMLElement}
 */
export function make(doc, className, tag = 'div') {
    const el = doc.createElement(tag);
    el.className = className;
    return el;
}

/**
 * The parts of one gate, not yet in it.
 * @param {Document} doc @param {HTMLElement} gate @param {Strings} s @param {string} id
 */
export function buildParts(doc, gate, s, id) {
    const side = make(doc, 'kp-ack__side');
    const link = gate.getAttribute('data-kp-ack-link');
    /** @type {HTMLAnchorElement | null} */
    let anchor = null;
    if (link) {
        anchor = /** @type {HTMLAnchorElement} */ (make(doc, 'kp-ack__link', 'a'));
        anchor.href = link;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = gate.getAttribute('data-kp-ack-link-label') ?? s.ackLink;
        side.append(anchor);
    }
    const tick = /** @type {HTMLLabelElement} */ (make(doc, 'kp-ack__tick', 'label'));
    const box = /** @type {HTMLInputElement} */ (make(doc, 'kp-field__check', 'input'));
    box.type = 'checkbox';
    box.id = `${id}-box`;
    const words = make(doc, 'kp-ack__label', 'span');
    tick.append(box, words);
    side.append(tick);
    const live = make(doc, 'kp-sr-only', 'span');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    const problem = make(doc, 'kp-ack__problem');
    problem.hidden = true;
    const problemText = make(doc, 'kp-ack__problem-text', 'span');
    const retry = /** @type {HTMLButtonElement} */ (make(doc, 'kp-button kp-ack__retry', 'button'));
    retry.type = 'button';
    retry.textContent = s.ackRetry;
    retry.hidden = true;
    problem.append(problemText, retry);
    return { side, anchor, tick, box, words, live, problem, problemText, retry, frame: make(doc, 'kp-ack__frame') };
}

/**
 * Put the parts into the gate: the words and the side stand in one frame, so a container query can lay the frame out (it cannot lay out its own container).
 * @param {HTMLElement} gate @param {ReturnType<typeof buildParts>} ui
 * @returns {() => void} undo: gives the authored nodes back
 */
export function mountParts(gate, ui) {
    const authored = [...gate.childNodes];
    ui.side.prepend(ui.problem);
    ui.frame.append(...authored, ui.side);
    gate.append(ui.frame, ui.live);
    return () => {
        gate.prepend(...authored);
        ui.frame.remove();
        ui.live.remove();
    };
}
