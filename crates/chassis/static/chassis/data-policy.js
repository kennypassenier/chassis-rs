// What an answer means to the queue, and what a conflict does (feat-offline-1).
// Pure. `defaultConflictPolicy` is THE place to change the 409 behaviour.

/** Statuses that mean the service cannot be reached (as the connection line reads them). */
const UNREACHABLE = [0, 502, 503, 504];

/**
 * `'unreachable'` (no answer / gateway down), `'auth'` (401), `'conflict'`
 * (409, 412), `'rejected'` (any other 4xx: the edit cannot succeed as it is),
 * `'retry'` (other 5xx), `'ok'`.
 */
export function classify(status) {
    if (UNREACHABLE.includes(status)) return 'unreachable';
    if (status === 401) return 'auth';
    if (status === 409 || status === 412) return 'conflict';
    if (status >= 200 && status < 300) return 'ok';
    return status >= 400 && status < 500 ? 'rejected' : 'retry';
}

/**
 * What to do with a refused edit at replay: `'skip'` (keep it in the failed
 * list for the person to drop or re-save, and carry on with the rest of the
 * queue), `'hold'` (stop the queue behind it until the person decides),
 * `'drop'` (discard it, continue) or `'overwrite'` (send it again against the
 * server's current revision, continue). Kenny's answer to the form
 * offline-conflict ("Overslaan", 2026-11-02) is the one line here; an app may
 * also pass `onConflict` to `configure`.
 */
export function defaultConflictPolicy(_entry, _outcome) {
    return 'skip';
}

const ANSWERS = ['skip', 'hold', 'drop', 'overwrite'];

/** The policy's answer, checked: an unknown word holds (never loses an edit). */
export function decide(policy, entry, outcome) {
    const answer = (policy ?? defaultConflictPolicy)(entry, outcome);
    if (ANSWERS.includes(answer)) return answer;
    console.warn(`chassisData: onConflict answered ${JSON.stringify(answer)}; holding the edit instead.`);
    return 'hold';
}
