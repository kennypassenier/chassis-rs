// Pure: the verdict of each hop once the first refusal stops the packet, the outcome in a sentence, and the trace as text for a bug report.

import { getStrings } from '../strings.js';

/** @typedef {import('../path-trace.js').TraceHop} TraceHop */

/**
 * The verdict of each hop once the first refusal stops the packet: `done`, `failed`, `skipped` or `pending`.
 * @param {readonly TraceHop[]} hops
 * @param {'first-refusal' | 'all'} [stop]
 * @returns {{ hop: TraceHop, state: 'done' | 'failed' | 'skipped' | 'pending' }[]}
 */
export function traceStates(hops, stop = 'first-refusal') {
    let stopped = false;
    return hops.map((hop) => {
        if (stopped && stop === 'first-refusal') return { hop, state: 'skipped' };
        if (hop.verdict === 'refused') {
            stopped = true;
            return { hop, state: 'failed' };
        }
        return { hop, state: hop.verdict === 'allowed' ? 'done' : 'pending' };
    });
}

/**
 * The outcome in one sentence.
 * @param {readonly TraceHop[]} hops
 * @param {'first-refusal' | 'all'} [stop]
 */
export function traceSummary(hops, stop = 'first-refusal') {
    const s = getStrings();
    const rows = traceStates(hops, stop);
    const refused = rows.find((r) => r.state === 'failed');
    if (refused) return s.traceBlocked(refused.hop.title, refused.hop.rule ?? '');
    if (rows.some((r) => r.state === 'pending')) return s.traceNotAll;
    return s.traceAllowed;
}

/**
 * The word a hop's verdict is spoken as.
 * @param {'done' | 'failed' | 'skipped' | 'pending'} state
 * @param {ReturnType<typeof getStrings>} [s]
 */
export function verdictWord(state, s = getStrings()) {
    if (state === 'done') return s.traceAllowedWord;
    if (state === 'failed') return s.traceRefusedWord;
    return state === 'skipped' ? s.traceNotReached : s.traceNotMeasured;
}

/**
 * The trace as text for a bug report: "tv > Firewall refused (rule IoT to media) > Jellyfin not reached".
 * @param {readonly TraceHop[]} hops
 * @param {'first-refusal' | 'all'} [stop]
 */
export function traceText(hops, stop = 'first-refusal') {
    const s = getStrings();
    return traceStates(hops, stop)
        .map(({ hop, state }) => `${hop.title} ${verdictWord(state, s)}${hop.rule ? ` (${s.traceRule(hop.rule)})` : ''}`)
        .join(' > ');
}
