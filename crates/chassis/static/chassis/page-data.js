// `window.chassisPageData` (feat-page-data-1, kyu and Almanac 40): the
// browser half of `chassis::PageData`. One read of a page's parts, each part
// on its own: a failing part is that part's `{ ok: false, error, remedy }`,
// and the other parts still draw.
//
//   const parts = await chassisPageData('/api/stacks/page', ['stacks', 'kit']);
//   if (parts.stacks.ok) drawStacks(parts.stacks.data);
//   else showPlate('stacks', parts.stacks.error, parts.stacks.remedy);
//
// `names` is what the page draws. When the merged read itself fails (an
// older server without the route, a dropped connection), each named part is
// asked at `<url>/<name>` side by side instead, so one bad part never blanks
// the page. `chassisPageData.one(url, name)` re-reads a single part.
// Requests go through `chassisFetchJson`, so an expired login is handled
// once for the page.

/** A part's plain answer as the shape the page reads. */
function asPart(r) {
    return r.ok ? { ok: true, data: r.body } : { ok: false, status: r.status, error: r.error, remedy: r.remedy };
}

/** One merged entry (`{data}` or `{error, remedy, status}`) as that shape. */
function fromEntry(entry) {
    if (entry && 'data' in entry) return { ok: true, data: entry.data };
    return {
        ok: false,
        status: entry?.status ?? 0,
        error: entry?.error ?? 'The service sent no answer for this part.',
        remedy: entry?.remedy ?? 'Reload the page.',
    };
}

/** The helper bound to `fetchJson` (the node test hands in a fake). */
export function makePageData(fetchJson) {
    const one = async (url, name, opts) => asPart(await fetchJson(`${url}/${encodeURIComponent(name)}`, opts));
    async function pageData(url, names = [], opts = {}) {
        const merged = await fetchJson(url, opts);
        if (merged.ok && merged.body && typeof merged.body.parts === 'object') {
            const parts = merged.body.parts;
            const wanted = names.length ? names : Object.keys(parts);
            return Object.fromEntries(wanted.map((n) => [n, fromEntry(parts[n])]));
        }
        if (merged.status === 401) return Object.fromEntries(names.map((n) => [n, asPart(merged)]));
        const each = await Promise.all(names.map((n) => one(url, n, opts)));
        return Object.fromEntries(names.map((n, i) => [n, each[i]]));
    }
    pageData.one = one;
    return pageData;
}

/** Put the helper on `win` unless it is there (needs `win.chassisFetchJson`). */
export function installPageData(win) {
    if (!win.chassisPageData && win.chassisFetchJson) win.chassisPageData = makePageData(win.chassisFetchJson);
    return win.chassisPageData;
}
