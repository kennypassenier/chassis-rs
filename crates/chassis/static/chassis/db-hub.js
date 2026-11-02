// Local database (feat-localdb-client-1): who watches which collection.
// `watch(fn)` is called after every applied page and every local edit (and
// when the queue changes, which moves the overlay). Calls of one burst are
// merged per collection; a watcher that throws is reported and the others
// still run.

export function createHub(warn = console.warn) {
    const watchers = new Map(); // collection -> Set<fn>
    const due = new Map(); // collection -> reason, until the microtask runs
    let scheduled = false;

    function flush() {
        scheduled = false;
        const batch = [...due];
        due.clear();
        for (const [collection, reason] of batch) {
            for (const fn of [...(watchers.get(collection) ?? [])]) {
                try {
                    fn({ collection, reason });
                } catch (err) {
                    warn(`chassisData.db: a watcher of ${collection} threw.`, err);
                }
            }
        }
    }

    function notify(collection, reason = 'pull') {
        if (!watchers.get(collection)?.size) return;
        due.set(collection, due.get(collection) ?? reason);
        if (!scheduled) {
            scheduled = true;
            queueMicrotask(flush);
        }
    }

    return {
        notify,
        notifyAll: (reason) => [...watchers.keys()].forEach((c) => notify(c, reason)),
        /** Returns the function that stops watching. */
        watch(collection, fn) {
            const set = watchers.get(collection) ?? new Set();
            set.add(fn);
            watchers.set(collection, set);
            return () => set.delete(fn);
        },
    };
}
