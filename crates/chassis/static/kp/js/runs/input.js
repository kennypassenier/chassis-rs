// Pure: what the app gives as a time (a number, an ISO string, a Date or `{ at, conflict, note }`) read as a run.

/** @typedef {import('../runs.js').RunInput} RunInput */
/** @typedef {import('../runs.js').Run} Run */

/** @param {RunInput} input @returns {Run | null} */
export function toRun(input) {
    const raw = typeof input === 'object' && input !== null && !(input instanceof Date) ? input : { at: input };
    const at = raw.at instanceof Date ? raw.at.getTime() : typeof raw.at === 'number' ? raw.at : Date.parse(String(raw.at));
    if (!Number.isFinite(at)) return null;
    /** @type {Run} */
    const run = { at };
    if ('conflict' in raw && raw.conflict) run.conflict = raw.conflict;
    // A free note of the app's own on the row, "1 try left" [forms-1102].
    if ('note' in raw && typeof raw.note === 'string' && raw.note.trim() !== '') run.note = raw.note.trim();
    return run;
}
