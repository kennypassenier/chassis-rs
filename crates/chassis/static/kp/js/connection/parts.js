// The elements of one banner, built but not yet placed: the band with its mark, its words and its Retry, and the spoken status.

/** @param {Document} doc @param {string} tag @param {string} className */
export function make(doc, tag, className) {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
}

/** @param {Document} doc */
export function buildBanner(doc) {
    const band = make(doc, 'div', 'kp-alert kp-connection__band');
    const mark = make(doc, 'span', 'kp-connection__mark');
    mark.setAttribute('aria-hidden', 'true');
    const body = make(doc, 'div', 'kp-alert__body kp-connection__body');
    const title = make(doc, 'strong', 'kp-connection__title');
    const why = make(doc, 'span', 'kp-connection__why');
    const meta = make(doc, 'span', 'kp-connection__meta');
    body.append(title, why, meta);
    const retry = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-connection__retry'));
    retry.type = 'button';
    band.append(mark, body, retry);
    const voice = make(doc, 'span', 'kp-sr-only');
    voice.setAttribute('role', 'status');
    return { band, mark, title, why, meta, retry, voice };
}
