// What one registered shortcut can be asked: is its scope on screen, is it available, does a typed-in field let it through.

/** @typedef {import('../shortcuts.js').Entry} Entry */

/** @param {Entry} entry */
export function scopeActive(entry) {
    const scope = entry.scope;
    if (typeof scope === 'string') return true;
    if (!scope.isConnected) return false;
    const hidden = scope.closest('[hidden], [inert]');
    return hidden === null && (scope.getClientRects().length > 0 || scope.hasAttribute('data-kp-keys-always'));
}

/** @param {Entry} entry */
export function available(entry) {
    try {
        return entry.shortcut.when ? entry.shortcut.when() !== false : true;
    } catch {
        return false;
    }
}

/**
 * Whether a typed-in field lets this entry's step through: a chord with Mod always, and a shortcut that said `inFields`.
 * @param {Entry} entry @param {number} index
 */
export const inFieldsToo = (entry, index) => entry.steps[index].mods.includes('mod') || entry.shortcut.inFields === true;
