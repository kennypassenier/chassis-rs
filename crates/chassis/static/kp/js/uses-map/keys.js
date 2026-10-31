// The keys of the lines view: which card an arrow, Home or End key moves to.

/** @typedef {import('./model.js').UsesModel} UsesModel */

/** The cards of one column. @param {HTMLElement} root @param {string} kind */
const cardsOf = (root, kind) => [...root.querySelectorAll(`.kp-uses__node[data-side="${kind}"] .kp-uses__card`)].filter((n) => n instanceof HTMLElement);

/**
 * To the other column, on the first node that is connected to this one, else the first node.
 * @param {UsesModel} m @param {HTMLElement} root @param {string} key @param {string} kind @param {string} arrow
 * @returns {HTMLElement | undefined | null} null when the key stays put and is swallowed
 */
function otherColumn(m, root, key, kind, arrow) {
    const flip = m.el.querySelector('.kp-uses')?.getAttribute('data-kp-lines-side') === 'sources-right';
    const towardUsers = (arrow === 'ArrowRight') !== flip;
    const wantKind = towardUsers ? 'user' : 'source';
    if (wantKind === kind) return null;
    const other = cardsOf(root, wantKind);
    const related = kind === 'source' ? (m.uses.get(key) ?? []) : (m.usedBy.get(key) ?? []);
    return /** @type {HTMLElement | undefined} */ (other.find((n) => related.includes(n.closest('.kp-uses__node')?.getAttribute('data-key') ?? '')) ?? other[0]);
}

/**
 * The card a navigation key lands on.
 * @param {UsesModel} m @param {HTMLElement} root @param {HTMLElement} card @param {string} key the key of the node of `card` @param {string} kind its side @param {string} pressed
 * @returns {HTMLElement | undefined | null} undefined when the key moves nowhere, null when it is swallowed without moving
 */
export function keyTarget(m, root, card, key, kind, pressed) {
    const sameColumn = cardsOf(root, kind);
    const at = sameColumn.indexOf(card);
    if (pressed === 'ArrowDown') return /** @type {HTMLElement} */ (sameColumn[Math.min(sameColumn.length - 1, at + 1)]);
    if (pressed === 'ArrowUp') return /** @type {HTMLElement} */ (sameColumn[Math.max(0, at - 1)]);
    if (pressed === 'Home') return /** @type {HTMLElement} */ (sameColumn[0]);
    if (pressed === 'End') return /** @type {HTMLElement} */ (sameColumn[sameColumn.length - 1]);
    if (pressed === 'ArrowRight' || pressed === 'ArrowLeft') return otherColumn(m, root, key, kind, pressed);
    return undefined;
}
