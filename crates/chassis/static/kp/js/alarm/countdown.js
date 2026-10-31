// The countdown's writes: its two shares and its words.

/**
 * Write the countdown's two shares and its words. Shared with the React
 * channel, so both bars read the same two custom properties.
 *
 * @param {HTMLElement} dialog
 * @param {HTMLElement | null} left the words under the bar
 * @param {number} share the continuous share of the time left, 1 to 0
 * @param {number} stepped the share in whole seconds, for reduced motion
 * @param {string} words
 */
export function writeCountdown(dialog, left, share, stepped, words) {
    dialog.style.setProperty('--kp-alarm-left', String(share));
    dialog.style.setProperty('--kp-alarm-left-step', String(stepped));
    if (left && left.textContent !== words) left.textContent = words;
}
