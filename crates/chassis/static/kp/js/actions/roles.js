// Pure: which role each button of a row has, and one column order for every row.

/**
 * The roles of one row's buttons: the button's `data-kp-action` when it has
 * one, else its place from the row's end (`end-0` is the last); a role met
 * twice in one row is numbered.
 * @param {{ role?: string | null }[]} buttons in row order
 * @returns {string[]}
 */
export function rowRoles(buttons) {
    /** @type {Map<string, number>} */
    const seen = new Map();
    return buttons.map((button, at) => {
        const base = button.role || `end-${buttons.length - 1 - at}`;
        const count = (seen.get(base) ?? 0) + 1;
        seen.set(base, count);
        return count > 1 ? `${base}#${count}` : base;
    });
}

/**
 * One column order for every row: each row's roles keep their order, and a
 * role first met in a later row goes right after the role before it.
 * @param {string[][]} rows
 * @returns {string[]}
 */
export function mergeRoles(rows) {
    /** @type {string[]} */
    const order = [];
    for (const roles of rows) {
        let at = -1;
        for (const role of roles) {
            const found = order.indexOf(role);
            if (found >= 0) at = found;
            else {
                order.splice(at + 1, 0, role);
                at += 1;
            }
        }
    }
    return order;
}
