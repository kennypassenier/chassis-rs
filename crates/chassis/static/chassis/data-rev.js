// Revisions (feat-offline-1). Pure. A revision is an opaque string here: the
// server's `u64` as text; the client only compares and echoes it.

/** The revision of an answer: the body's field, else the `ETag` header, else null. */
export function revOf(body, etag, field) {
    const own = body && typeof body === 'object' ? body[field] : undefined;
    if (typeof own === 'number' || (typeof own === 'string' && own !== '')) return String(own);
    if (typeof etag === 'string' && etag !== '') return etag.replace(/^W\//, '').replace(/^"|"$/g, '');
    return null;
}

/**
 * The `If-Match` header value for a revision, or null for none. A real
 * revision is quoted (an entity tag); `*` ("any current version") is sent
 * bare, because `"*"` is a tag, not the wildcard, and the kit refuses it.
 */
export function ifMatchValue(rev) {
    if (rev === null || rev === undefined || rev === '') return null;
    return String(rev) === '*' ? '*' : `"${rev}"`;
}

/**
 * After a queued write succeeded and moved `path` from `oldRev` to `newRev`,
 * the entries behind it for the same path that carried `oldRev` are the same
 * person's follow-up edits: they get `newRev`. Returns the entries that
 * changed (copies); the caller stores them.
 */
export function rebase(entries, path, oldRev, newRev) {
    if (oldRev === null || newRev === null || oldRev === newRev) return [];
    return entries
        .filter((e) => e.path === path && e.ifMatch === oldRev)
        .map((e) => ({ ...e, ifMatch: newRev }));
}

/**
 * The server's current revision out of a 409 body: the kit's `rev`, else the
 * item the server sent along (`current`), else null.
 */
export function conflictRev(body, field) {
    if (!body || typeof body !== 'object') return null;
    return revOf(body.current, null, field) ?? revOf({ rev: body.rev }, null, 'rev');
}
