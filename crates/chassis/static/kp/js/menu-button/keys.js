// The key a menu item answers to.

/**
 * Where a key moves the focus in an open menu, or null when the key is not
 * the menu's: ↓ and ↑ step and wrap, Home and End go to the ends, and a
 * printable letter goes to the next entry after `at` whose label starts with
 * it (wrapping, the entry at `at` itself last). `at` is -1 when no entry has
 * the focus.
 * @param {{ key: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} event
 * @param {number} at
 * @param {readonly string[]} labels every entry's label, in order
 * @returns {number | null}
 */
export function menuKeyTarget(event, at, labels) {
    const n = labels.length;
    if (!n) return null;
    const { key } = event;
    if (key === 'ArrowDown') return (at + 1) % n;
    if (key === 'ArrowUp') return (at - 1 + n) % n;
    if (key === 'Home') return 0;
    if (key === 'End') return n - 1;
    if (key.length !== 1 || key === ' ' || event.ctrlKey || event.metaKey || event.altKey) return null;
    const letter = key.toLocaleLowerCase();
    for (let step = 1; step <= n; step += 1) {
        const index = (((at + step) % n) + n) % n;
        if (labels[index].trim().toLocaleLowerCase().startsWith(letter)) return index;
    }
    return null;
}
