// Writes a state word onto an element.

/**
 * Show `word` in a `.kp-state-word`, adding it to the words it keeps room
 * for when it is new, so the width never shrinks back under a later word
 * [scope-143]. The element is as wide as the widest word listed in its
 * `data-kp-words` (one per line), so a button beside it never moves when
 * the state changes: a second click without moving the mouse hits the same
 * button. The stylesheet does the holding; this only keeps the list whole.
 *
 * @param {HTMLElement} el
 * @param {string} word
 */
export function setStateWord(el, word) {
    const words = (el.getAttribute('data-kp-words') ?? '').split('\n').filter(Boolean);
    if (!words.includes(word)) el.setAttribute('data-kp-words', [...words, word].join('\n'));
    el.textContent = word;
}
