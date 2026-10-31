// Pure: what the app gives as a time (a number, an ISO string, a Date or `{ at, conflict }`) read as a run.

/** @typedef {import('../runs.js').RunInput} RunInput */
/** @typedef {import('../runs.js').Run} Run */

/** @param {RunInput} input @returns {Run | null} */
export function toRun(input) {
    const raw = typeof input === 'object' && input !== null && !(input instanceof Date) ? input : { at: input };
    const at = raw.at instanceof Date ? raw.at.getTime() : typeof raw.at === 'number' ? raw.at : Date.parse(String(raw.at));
    if (!Number.isFinite(at)) return null;
    return 'conflict' in raw && raw.conflict ? { at, conflict: raw.conflict } : { at };
}
