// Pure: the two lines a state says, its title and its reason.

/**
 * @param {import('../strings.js').Strings} t
 * @param {import('../connection.js').ConnectionState} state
 * @param {{ attempt: number, pending: number, refusedWhy: string }} facts
 * @returns {string[]} the title and the reason
 */
export function textFor(t, state, { attempt, pending, refusedWhy }) {
    if (state === 'offline') return [t.connOffline, t.connOfflineWhy];
    if (state === 'reconnecting') return [t.connReconnecting, attempt > 1 ? t.connAttempt(attempt) : t.connReconnectingWhy];
    if (state === 'back') return [t.connBack, pending > 0 ? t.connBackSending(pending) : t.connBackWhy];
    return [t.connRefused, refusedWhy || t.connRefusedWhy];
}
