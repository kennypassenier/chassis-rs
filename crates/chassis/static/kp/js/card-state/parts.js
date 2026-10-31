// The card's stage, its data area and its note, made where they are missing.

/** @param {Document} doc @param {string} className @param {string} [tag] */
export const el = (doc, className, tag = 'div') => {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
};

/** @param {HTMLElement} card @returns {HTMLElement} the stage, placed before the footer or at the end */
function stageOf(card) {
    let stage = /** @type {HTMLElement | null} */ (card.querySelector(':scope > .kp-card__stage'));
    if (!stage) {
        stage = el(card.ownerDocument, 'kp-card__stage');
        const footer = card.querySelector(':scope > .kp-card__footer');
        if (footer) footer.before(stage);
        else card.append(stage);
    }
    return stage;
}

/**
 * The card's stage, its data area and its note, made where they are missing.
 * @param {HTMLElement} card
 * @returns {{ stage: HTMLElement, data: HTMLElement, note: HTMLElement }}
 */
export function partsOf(card) {
    const doc = card.ownerDocument;
    const stage = stageOf(card);
    let data = /** @type {HTMLElement | null} */ (stage.querySelector(':scope > .kp-card__data'));
    if (!data) {
        data = el(doc, 'kp-card__data');
        stage.prepend(data);
    }
    let note = /** @type {HTMLElement | null} */ (stage.querySelector(':scope > .kp-card__state'));
    if (!note) {
        note = el(doc, 'kp-card__state');
        note.setAttribute('data-kp-card-built', '');
        stage.append(note);
    }
    return { stage, data, note };
}
