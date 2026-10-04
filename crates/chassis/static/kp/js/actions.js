// A list's row buttons on columns the whole list shares [scope-143].
//
// A button of one role starts at one edge and has one width on every row,
// whatever its label, and a row without that role leaves its column empty.
// A `.kp-action-list` is a CSS subgrid, so the browser sizes the columns and
// by position from the end the stylesheet needs no script at all; this
// module only names each button's column when buttons carry a role
// (`data-kp-action="<role>"`). A table cannot be a subgrid: there each
// role's widest button is measured and the widths are written on the table.
//
//   <ul class="kp-action-list">
//       <li>
//           <div>INC-4471 Pump house 3: pressure below 2.1 bar</div>
//           <div class="kp-row-actions">
//               <button type="button" class="kp-button kp-button--sm">Assign…</button>
//               <button type="button" class="kp-button kp-button--sm kp-button--primary">Open</button>
//           </div>
//       </li>
//   </ul>
//
// Nothing runs on import; attachActionColumns(root) returns a detach.

/** A row's button box. */
export const ROW_ACTIONS = '.kp-row-actions';

/** A list or table whose rows' buttons share columns. */
export const ACTION_LIST = '.kp-action-list, table';

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

/**
 * Lay one list's or table's button boxes on shared columns.
 *
 * A list (`.kp-action-list`) is a CSS subgrid, so the browser sizes the
 * columns; this only names each button's column and the list's count, and
 * only when a button carries a role (by position the stylesheet needs no
 * help). A table cannot be a subgrid: there each role's widest button is
 * measured and the widths are written on the table.
 * @param {Element} list
 */
export function fitActionColumns(list) {
    if (!(list instanceof HTMLElement)) return;
    const isTable = list instanceof HTMLTableElement;
    const boxes = /** @type {HTMLElement[]} */ ([...list.querySelectorAll(ROW_ACTIONS)]).filter((box) => box.closest(ACTION_LIST) === list);
    const rows = boxes.map((box) => /** @type {HTMLElement[]} */ ([...box.children]).filter((child) => !child.hidden));
    const roles = rows.map((row) => rowRoles(row.map((button) => ({ role: button.dataset.kpAction ?? null }))));
    const order = mergeRoles(roles);
    const named = rows.some((row) => row.some((button) => button.dataset.kpAction !== undefined));

    for (const row of rows) for (const button of row) button.style.removeProperty('--kp-action-col');
    for (const name of ['--kp-action-count', '--kp-action-widths', '--kp-action-stack']) list.style.removeProperty(name);
    if (order.length === 0 || (!isTable && !named)) return;

    if (isTable) {
        // Every button at its own size first, then the widest per role.
        list.dataset.kpActionMeasuring = '';
        const widths = order.map(() => 0);
        rows.forEach((row, r) =>
            row.forEach((button, b) => {
                const k = order.indexOf(roles[r][b]);
                widths[k] = Math.max(widths[k], button.getBoundingClientRect().width);
            }),
        );
        delete list.dataset.kpActionMeasuring;
        list.style.setProperty('--kp-action-widths', widths.map((w) => `${Math.ceil(w)}px`).join(' '));
        list.style.setProperty('--kp-action-stack', `${Math.ceil(Math.max(...widths))}px`);
    } else {
        list.style.setProperty('--kp-action-count', String(order.length));
    }
    rows.forEach((row, r) => row.forEach((button, b) => button.style.setProperty('--kp-action-col', String(order.indexOf(roles[r][b]) + 1))));
}

/**
 * Keep every list's and table's row buttons on shared columns under `root`:
 * fitted now, and again, once per frame, when a row's buttons change, the
 * theme changes or a font arrives (a table's widths are measured).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachActionColumns(root = document) {
    const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
    const view = doc.defaultView;
    if (!view) return () => {};
    const fitAll = () => {
        const lists = new Set([...root.querySelectorAll(ROW_ACTIONS)].map((box) => box.closest(ACTION_LIST)));
        for (const list of lists) if (list) fitActionColumns(list);
    };
    let queued = 0;
    const queue = () => {
        if (queued) return;
        queued = view.requestAnimationFrame(() => {
            queued = 0;
            fitAll();
        });
    };
    /** @param {Node} node */
    const touches = (node) => {
        const el = node instanceof Element ? node : node.parentElement;
        return el !== null && (el.closest(ROW_ACTIONS) !== null || el.querySelector(ROW_ACTIONS) !== null);
    };
    // Children and text only: the column writes are style changes, so the
    // watcher never wakes itself.
    const rows = new view.MutationObserver((records) => {
        if (records.some((r) => touches(r.target) || [...r.addedNodes, ...r.removedNodes].some(touches))) queue();
    });
    rows.observe(root instanceof Document ? root.documentElement : /** @type {Node} */ (root), {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['hidden', 'data-kp-action'],
    });
    const theme = new view.MutationObserver(queue);
    theme.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    doc.fonts?.addEventListener?.('loadingdone', queue);
    fitAll();
    return () => {
        rows.disconnect();
        theme.disconnect();
        doc.fonts?.removeEventListener?.('loadingdone', queue);
        if (queued) view.cancelAnimationFrame(queued);
    };
}
