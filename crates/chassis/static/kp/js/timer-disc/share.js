// Pure: the share of the disc left.

/**
 * The share of the disc left: the time left over the face's scale.
 * @param {number} remainingMs @param {number} scaleMs the face's whole turn
 */
export function discShare(remainingMs, scaleMs) {
    if (scaleMs <= 0) return 0;
    return Math.min(1, Math.max(0, remainingMs / scaleMs));
}
