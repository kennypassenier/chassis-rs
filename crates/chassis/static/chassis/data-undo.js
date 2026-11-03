// Undoing a queued edit's optimistic effect on the stored copies. When an edit
// is queued, what it did to the copies is recorded as `entry.undo` (stored
// with the edit): the whole copy as it was for the item path and the routes the
// app named in `amends`, and the entry as it was (with its place) in every
// stored list and composite answer that holds the item. Dropping the edit
// (`chassisData.drop`, the failed drawer's Discard) puts all of it back, so
// the copies are what they were before the edit, offline too. A refused edit
// is undone from the server's word instead (data-writes.js `restore`).

import { amendLists, itemRouteOf, restoreEntries } from './data-lists.js';

/** deps: the client context { config, cache }. */
export function createUndo(ctx) {
    const { config, cache } = ctx;

    /** Change the copy of `path` (if there is one) and record the copy as it was. */
    async function amendRecorded(undo, path, change) {
        const held = await cache.read(path);
        if (!held) return;
        undo.push({ op: 'copy', path, copy: { data: held.data, rev: held.rev, partial: held.partial === true } });
        await cache.amend(path, change);
    }

    /** Apply `change` to the entry of item `path` in the stored lists, recording each entry as it was. */
    async function entriesRecorded(undo, path, change) {
        const item = itemRouteOf(config, path);
        if (item) await amendLists(ctx, item, path, change, (hit) => undo.push({ op: 'entry', item: path, ...hit }));
    }

    /** Put back what `undo` recorded, last change first. A copy that no longer fits the cap is dropped (it is read again online). */
    async function revert(undo = []) {
        for (const step of [...undo].reverse()) {
            if (step.op === 'copy') {
                const { data, rev, partial } = step.copy;
                if (!(await cache.remember(step.path, data, rev, partial))) await cache.forget(step.path);
            } else {
                const item = itemRouteOf(config, step.item);
                if (item) await restoreEntries(ctx, item, step.item, [step]);
            }
        }
    }

    return { amendRecorded, entriesRecorded, revert };
}
