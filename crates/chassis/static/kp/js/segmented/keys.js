// The keyboard of a group: where an arrow, Home or End moves the focus, and the delete of a three-way chip.

/** The step an arrow key takes along the group, flipped for a right-to-left group; 0 for any other key. @param {KeyboardEvent} event @param {Element} group */
export function stepFor(event, group) {
    const rtl = getComputedStyle(group).direction === 'rtl';
    switch (event.key) {
        case 'ArrowRight':
            return rtl ? -1 : 1;
        case 'ArrowLeft':
            return rtl ? 1 : -1;
        case 'ArrowDown':
            return 1;
        case 'ArrowUp':
            return -1;
        default:
            return 0;
    }
}

/**
 * Where the focus goes for a key: the index among the enabled items, or -1 for a key that moves nothing.
 * @param {KeyboardEvent} event @param {Element} group @param {number} at the focused item's index @param {number} count the enabled items
 */
export function targetIndex(event, group, at, count) {
    if (event.key === 'Home') return 0;
    if (event.key === 'End') return count - 1;
    const step = stepFor(event, group);
    return step === 0 ? -1 : (at + step + count) % count;
}
