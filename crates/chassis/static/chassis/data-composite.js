// Composite list answers (fix-overlay-4): one stored answer that holds the
// entries of an item route under a field, e.g. `GET /data/snapshot` ->
// `{ tasks: [..], notes: [..] }`. The app declares the mapping:
//   composites: [{ path: '/data/snapshot', lists: { tasks: '/data/tasks/:id' } }]
// Both the composite path and the item routes must be declared in `routes`.
// Pure; data-lists.js applies it to the stored copies.

function fail(message, remedy) {
    return new Error(`chassisData: ${message}. ${remedy}`);
}

/** The declared `composites` option as `[{ path, fields: [{ field, item }] }]` (item = compiled item route), or an error. */
export function compileComposites(declared, compiled) {
    if (!Array.isArray(declared)) throw fail('composites must be a list', 'For example [{ path: "/data/snapshot", lists: { tasks: "/data/tasks/:id" } }].');
    return declared.map((c) => {
        const route = compiled.find((r) => r.pattern === c?.path && r.kind === 'list');
        if (!route) throw fail(`composite ${JSON.stringify(c?.path)} is not a declared list route`, 'Add its path to routes as well.');
        const lists = c.lists && typeof c.lists === 'object' ? Object.entries(c.lists) : [];
        if (lists.length === 0) throw fail(`composite ${c.path} maps no field`, 'Give lists: { field: "/data/x/:id" }.');
        const fields = lists.map(([field, pattern]) => {
            const item = compiled.find((r) => r.pattern === pattern && r.kind === 'item');
            if (!item) throw fail(`composite ${c.path}: ${JSON.stringify(pattern)} is not a declared item route`, 'Add it to routes as well.');
            return { field, item };
        });
        return { path: c.path, fields };
    });
}
