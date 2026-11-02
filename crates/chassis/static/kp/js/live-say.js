// Say a sentence in a polite status line so a screen reader hears it again even when it is the same as the last one [dlfix-1102]:
// the line is emptied first and given its words on the next frame (a text swapped for the same text is no change to a reader).

/** @param {HTMLElement} live @param {string} text */
export function say(live, text) {
    live.textContent = '';
    requestAnimationFrame(() => (live.textContent = text));
}
