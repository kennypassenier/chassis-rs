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
                // Its margins count: a register that sets its buttons off
                // with one (the removed Sepia register's marginal bracket) would otherwise squeeze
                // the label into the button's padding [action-columns-narrow-M1].
                const style = getComputedStyle(button);
                const margins = (parseFloat(style.marginInlineStart) || 0) + (parseFloat(style.marginInlineEnd) || 0);
                widths[k] = Math.max(widths[k], button.getBoundingClientRect().width + margins);
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

// --- Rows at work, rows that go, rows the keyboard walks [kpadopt4-rows] ----
//
// A list of messages (an inbox, a queue, a dead-letter backlog) acts on one
// row at a time: a press starts a request, the row waits for its answer, and
// on success the row often leaves. setRowBusy() makes the wait visible
// without moving a column, removeRow() lets the row leave the theme's way
// and keeps the keyboard's place, and attachRowKeys() moves the focus from
// row to row with j / k or the arrows, the way a mail client does.

/** A list whose rows the keyboard walks. */
export const ROW_KEYS = '[data-kp-row-keys]';
/** Fired on a row, bubbling, when Enter is pressed on the row itself: `{ row }`. */
export const ROW_OPEN_EVENT = 'kp-row-open';

/** The press blocker of each busy row. @type {WeakMap<Element, (event: Event) => void>} */
const blockers = new WeakMap();

/**
 * Make a row busy while its action runs, or done with it. The row carries
 * `aria-busy`; every button in it says no to a press (`aria-disabled`, so the
 * focus stays where it is); `button`, the one pressed, shows the theme's
 * spinner in place of its words, which keep their room, so no column moves.
 * @param {HTMLElement} row a list item of a `.kp-action-list`
 * @param {boolean} [busy] true when absent
 * @param {HTMLElement | null} [button] the button that started it
 * @returns {HTMLElement} the row
 */
export function setRowBusy(row, busy = true, button = null) {
    const doc = row.ownerDocument;
    const buttons = /** @type {HTMLElement[]} */ ([...row.querySelectorAll(`${ROW_ACTIONS} > *`)]);
    if (busy) {
        row.setAttribute('aria-busy', 'true');
        for (const b of buttons) {
            if (b.getAttribute('aria-disabled') === 'true' && !b.hasAttribute('data-kp-row-blocked')) continue;
            b.setAttribute('aria-disabled', 'true');
            b.setAttribute('data-kp-row-blocked', '');
        }
        if (button && !button.hasAttribute('data-kp-busy')) {
            // Its width as it stands, held while it waits: no column moves, whatever lays the button out.
            button.style.setProperty('min-inline-size', `${button.getBoundingClientRect().width}px`);
            // The words in their own element, so they can keep their room while hidden.
            for (const node of [...button.childNodes])
                if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
                    const words = doc.createElement('span');
                    words.className = 'kp-button__text';
                    node.replaceWith(words);
                    words.append(node);
                }
            const holder = doc.createElement('span');
            holder.className = 'kp-button__busy';
            holder.setAttribute('aria-hidden', 'true');
            const wheel = doc.createElement('span');
            wheel.className = 'kp-spinner';
            holder.append(wheel);
            button.append(holder);
            button.setAttribute('data-kp-busy', '');
        }
        if (!blockers.has(row)) {
            /** @param {Event} event */
            const block = (event) => {
                const target = event.target instanceof Element ? event.target.closest('[data-kp-row-blocked]') : null;
                if (!target) return;
                event.preventDefault();
                event.stopImmediatePropagation();
            };
            row.addEventListener('click', block, true);
            blockers.set(row, block);
        }
        return row;
    }
    row.removeAttribute('aria-busy');
    for (const b of buttons) {
        if (!b.hasAttribute('data-kp-row-blocked')) continue;
        b.removeAttribute('aria-disabled');
        b.removeAttribute('data-kp-row-blocked');
    }
    for (const b of row.querySelectorAll('[data-kp-busy]')) {
        b.removeAttribute('data-kp-busy');
        /** @type {HTMLElement} */ (b).style.removeProperty('min-inline-size');
        b.querySelector(':scope > .kp-button__busy')?.remove();
    }
    const block = blockers.get(row);
    if (block) {
        row.removeEventListener('click', block, true);
        blockers.delete(row);
    }
    return row;
}

/**
 * Let a row leave the theme's way and take it out (js/motion.js leave(); at
 * once under reduced motion). When the focus is in it, the focus goes first
 * to the same place in the next row (the button at the same position, or the
 * row itself), else the row before, else the list.
 * @param {HTMLElement} row
 * @returns {Promise<void>} settled once it is gone
 */
export async function removeRow(row) {
    const list = row.parentElement;
    const doc = row.ownerDocument;
    const active = doc.activeElement;
    if (list && active instanceof HTMLElement && row.contains(active)) {
        const rows = /** @type {HTMLElement[]} */ ([...list.children]).filter((r) => r !== row && !r.hidden && !r.classList.contains('kp-action-list__group'));
        const at = [...list.children].indexOf(row);
        const next = rows.find((r) => [...list.children].indexOf(r) > at) ?? rows.reverse().find((r) => [...list.children].indexOf(r) < at) ?? null;
        const place = [...row.querySelectorAll(`${ROW_ACTIONS} > *`)].indexOf(active);
        const into = next ? (/** @type {HTMLElement | undefined} */ (next.querySelectorAll(`${ROW_ACTIONS} > *`)[place]) ?? next) : list;
        if (!into.matches('a[href], button, input, select, textarea, [tabindex]')) into.tabIndex = -1;
        into.focus({ preventScroll: true });
    }
    row.setAttribute('aria-hidden', 'true');
    const { leave } = await import('./motion.js');
    await leave(row);
}

/**
 * Let the keyboard walk the rows of every list marked `data-kp-row-keys`
 * under `root`: j or ↓ to the next row, k or ↑ to the one before, Home and
 * End to the first and the last, Enter on a row fires `kp-row-open`. Never
 * while typing in a field or with a modifier held, and a button in a row
 * keeps Enter for itself. One row of the list is in the tab order (the
 * last one focused), so Tab reaches the list once.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachRowKeys(root = document) {
    const lists = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(ROW_KEYS) ? [root] : []),
        ...root.querySelectorAll(ROW_KEYS),
    ]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const list of lists) {
        /** @returns {HTMLElement[]} */
        const rowsOf = () =>
            /** @type {HTMLElement[]} */ ([...list.children]).filter(
                (r) => r.tagName === 'LI' && !r.hidden && !r.classList.contains('kp-action-list__group') && r.getAttribute('aria-hidden') !== 'true',
            );
        /** @param {HTMLElement} row */
        const current = (row) => {
            for (const r of rowsOf()) r.tabIndex = r === row ? 0 : -1;
        };
        // Every row focusable, one of them in the tab order; rows added later too.
        const settle = () => {
            const rows = rowsOf();
            for (const r of rows) if (!r.hasAttribute('tabindex')) r.tabIndex = -1;
            if (rows.length && !rows.some((r) => r.tabIndex === 0)) current(rows[0]);
        };
        settle();
        const added = typeof MutationObserver === 'undefined' ? null : new MutationObserver(settle);
        added?.observe(list, { childList: true });
        /** @param {KeyboardEvent} event */
        const key = (event) => {
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            const target = /** @type {HTMLElement | null} */ (event.target instanceof HTMLElement ? event.target : null);
            if (!target || target.closest('input, textarea, select, [contenteditable]')) return;
            const rows = rowsOf();
            const at = rows.findIndex((r) => r === target || r.contains(target));
            if (at < 0) return;
            const onRow = rows[at] === target;
            const to =
                event.key === 'j' || event.key === 'ArrowDown'
                    ? Math.min(rows.length - 1, at + 1)
                    : event.key === 'k' || event.key === 'ArrowUp'
                      ? Math.max(0, at - 1)
                      : onRow && event.key === 'Home'
                        ? 0
                        : onRow && event.key === 'End'
                          ? rows.length - 1
                          : null;
            if (to !== null) {
                // A summary or a button keeps its own arrows only where it has a use for them: none here.
                event.preventDefault();
                current(rows[to]);
                rows[to].focus();
                return;
            }
            if (event.key === 'Enter' && onRow) {
                event.preventDefault();
                rows[at].dispatchEvent(new CustomEvent(ROW_OPEN_EVENT, { bubbles: true, detail: { row: rows[at] } }));
            }
        };
        /** @param {FocusEvent} event */
        const focus = (event) => {
            const row = rowsOf().find((r) => event.target instanceof Node && r.contains(event.target));
            if (row) current(row);
        };
        list.addEventListener('keydown', key);
        list.addEventListener('focusin', focus);
        undo.push(() => {
            added?.disconnect();
            list.removeEventListener('keydown', key);
            list.removeEventListener('focusin', focus);
        });
    }
    return () => undo.forEach((u) => u());
}
