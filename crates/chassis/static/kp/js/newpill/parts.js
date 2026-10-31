// The pill and the status line it speaks through, built but not yet placed.

/**
 * @param {Document} doc
 * @param {string} placement `top` or `bottom`
 */
export function buildPill(doc, placement) {
    const pill = /** @type {HTMLButtonElement} */ (doc.createElement('button'));
    pill.type = 'button';
    pill.className = 'kp-newpill kp-button';
    pill.setAttribute('data-kp-pill-placement', placement);
    pill.hidden = true;
    const number = doc.createElement('span');
    number.className = 'kp-newpill__count';
    const back = doc.createElement('span');
    back.className = 'kp-newpill__back';
    pill.append(number, back);
    const live = doc.createElement('div');
    live.className = 'kp-sr-only';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    return { pill, number, back, live };
}
