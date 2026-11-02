// What keeps a table in step with its body: the rows the page adds or removes, and the wiring again after an option attribute changed.
import { handles } from '../instance.js';
/** @typedef {import('../instance.js').DataTableHandle} DataTableHandle */
/** @typedef {import('../events.js').FilterValue} FilterValue */
/** @typedef {import('../events.js').View} View */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

/**
 * Rows the page added, removed or held are the table's rows at once, without a call to refresh(): the count, the pager and the
 * pages follow the body [b3b4-1019; homelab gap 34, kyu gap 28]. The table's own sort and page moves put the same rows back in
 * another order, which changes nothing here.
 * @param {DataTableControl} t
 */
export function watchRows(t) {
    const { body, model, wrap } = t;
    let queued = false;
    const resync = () => {
        queued = false;
        model.holdRows();
        const now = [...body.rows].filter((row) => model.isRow(row));
        if (now.length === model.all.length && now.every((row) => model.all.includes(row))) return;
        handles.get(wrap)?.refresh({ keepPage: true });
    };
    const onBody = () => {
        if (queued) return;
        queued = true;
        queueMicrotask(resync);
    };
    const rowsWatch = new MutationObserver(onBody);
    rowsWatch.observe(body, { childList: true });
    const holdWatch = new MutationObserver(onBody);
    holdWatch.observe(body, { attributes: true, attributeFilter: ['data-kp-row-hidden'], subtree: true });
    t.identity.undo.push(() => {
        rowsWatch.disconnect();
        holdWatch.disconnect();
    });
}

/** Wire the table again after an option attribute changed, and give the page's handle the view it had. @param {DataTableControl} t */
export function wireAgain(t) {
    const { wrap, call } = t;
    const old = handles.get(wrap);
    if (old === undefined) return;
    const was = old.view();
    const selected = old.selected();
    const fresh = t.rewire(old);
    if (fresh === undefined) return;
    // The page keeps the handle it has: the new table's methods move onto it.
    Object.assign(old, fresh);
    handles.set(wrap, old);
    call.created.splice(call.created.indexOf(fresh), 1, old);
    restoreView(old, was, selected, call.sortsSeveral(wrap));
}

/**
 * Put a view back on a freshly wired table through its handle.
 * @param {DataTableHandle} handle
 * @param {View} was
 * @param {string[]} selected
 * @param {boolean} several whether the table sorts on several columns now
 */
function restoreView(handle, was, selected, several) {
    if (was.query !== '') handle.query(was.query);
    if (was.scope !== null) handle.scope(was.scope);
    for (const [column, value] of Object.entries(was.filters)) handle.filter(Number(column), /** @type {FilterValue} */ (value));
    // Going to one sort key keeps the first.
    if (was.sorts.length > 0) handle.sortBy(several ? was.sorts : was.sorts.slice(0, 1));
    if (was.pageSize !== handle.view().pageSize) handle.pageSize(was.pageSize);
    if (was.hidden.length > 0) handle.hideColumns(was.hidden);
    if (was.density !== handle.view().density) handle.density(was.density);
    if (was.folded.length > 0) handle.fold(was.folded);
    if (was.expanded.length > 0) handle.expand(was.expanded);
    if (selected.length > 0) handle.select(selected);
    if (was.page > 0) handle.page(was.page);
    if (was.state !== 'ready') handle.state(was.state);
}
