// The write queue (feat-offline-1): edits made while the service could not be
// reached, replayed in the order they were made. Transport-free: `send(entry)`
// answers `{ status, body, etag }` (status 0 = no answer) and `store` is the
// flat store, so the node tests drive it with fakes.
//
// Entry: { id, method, path, body, ifMatch, at, state: 'queued' | 'held' | 'failed',
//          conflict? }. A `held` entry blocks everything behind it; a `failed`
//          one (the default policy) is kept for the person and skipped.

import { classify, decide } from './data-policy.js';
import { conflictRev, rebase, revOf } from './data-rev.js';

/**
 * hooks: onChange(entries) after any change; onSent(entry, rev, outcome);
 * onRefused(entry, outcome) (awaited, before the policy answers: the copy goes back to the server's version);
 * onFailed(entry, outcome, answer) once a refusal is final ('skip' | 'hold' | 'drop': the edit left the waiting ones, or stopped the replay);
 * onHeld(entry); onDropped(entry); onSyncing(bool) around a replay; onSynced(summary) after it.
 */
export function createQueue({ store, send, field, policy, hooks = {} }) {
    let entries = [];
    let running = null;
    let again = false;
    const call = (name, ...args) => hooks[name]?.(...args);
    const changed = () => call('onChange', entries);

    async function persist(entry) {
        const saved = await store.putQueue(entry);
        entries = entries.map((e) => (e.id === saved.id ? saved : e));
        return saved;
    }

    async function remove(entry) {
        await store.deleteQueue(entry.id);
        entries = entries.filter((e) => e.id !== entry.id);
    }

    async function rebaseBehind(entry, rev) {
        for (const next of rebase(entries, entry.path, entry.ifMatch, rev)) await persist(next);
    }

    async function hold(entry, outcome) {
        // The server wins: whatever the refused edit did to the copy is undone first.
        try {
            await hooks.onRefused?.(entry, outcome);
        } catch (err) {
            console.warn(`chassisData: the copy of ${entry.path} could not be reset to the server's version.`, err);
        }
        const answer = decide(policy, entry, outcome);
        if (answer === 'drop') {
            await remove(entry);
            call('onDropped', entry);
            call('onFailed', entry, outcome, answer);
            return 'continue';
        }
        const skipped = answer === 'skip';
        const held = await persist({ ...entry, state: skipped ? 'failed' : 'held', conflict: { status: outcome.status, body: outcome.body ?? null } });
        call('onHeld', held);
        call('onFailed', held, outcome, answer);
        return skipped ? 'continue' : 'stop:held';
    }

    /** One entry's turn: 'sent' or 'continue' (dropped / skipped) with the next, or 'stop:<why>'. */
    async function step(entry) {
        const outcome = await send(entry);
        const kind = classify(outcome.status);
        if (kind === 'ok') {
            const rev = revOf(outcome.body, outcome.etag, field);
            await remove(entry);
            await rebaseBehind(entry, rev);
            // Awaited: the copy must be the server's answer before the replay moves on or ends.
            try {
                await hooks.onSent?.(entry, rev, outcome);
            } catch (err) {
                console.warn(`chassisData: the copy of ${entry.path} could not be updated from the server's answer.`, err);
            }
            return 'sent';
        }
        if (kind === 'conflict' || kind === 'rejected') return hold(entry, outcome);
        return `stop:${kind}`;
    }

    /** The first entry that is not parked in the failed list. */
    const nextToSend = () => entries.find((e) => e.state !== 'failed');

    async function replayAll() {
        let sent = 0;
        let stopped = null;
        call('onSyncing', true);
        try {
            for (let head = nextToSend(); head && stopped === null; head = nextToSend()) {
                if (head.state === 'held') {
                    stopped = 'held';
                    break;
                }
                const result = await step(head);
                if (result === 'sent') sent += 1;
                else if (result !== 'continue') stopped = result.replace('stop:', '');
                changed();
            }
        } finally {
            call('onSyncing', false);
        }
        const summary = { sent, remaining: entries.filter((e) => e.state !== 'failed').length, stopped };
        call('onSynced', summary);
        return summary;
    }

    return {
        list: () => entries.map((e) => ({ ...e })),
        pending: () => entries.filter((e) => e.state !== 'failed').length,
        failed: () => entries.filter((e) => e.state === 'failed').map((e) => ({ ...e })),
        unsent: () => entries.length,
        bytes: () => entries.reduce((n, e) => n + JSON.stringify(e).length, 0),
        async load() {
            entries = (await store.allQueue()).sort((a, b) => a.id - b.id);
            changed();
        },
        async add(entry) {
            const saved = await store.putQueue({ ...entry, state: 'queued' });
            entries = [...entries, saved];
            changed();
            return saved;
        },
        /**
         * Replay from the head; one replay at a time. A call while one runs
         * (the network may have come back after it failed) makes it go round
         * once more, and shares its answer.
         */
        replay() {
            if (running) {
                again = true;
                return running;
            }
            running = (async () => {
                let summary;
                try {
                    do {
                        again = false;
                        summary = await replayAll();
                    } while (again);
                } finally {
                    // Cleared in the same turn as the last `again` check: a call that
                    // came in a `.finally()` later joined a finished replay and got
                    // its stale answer without a new round (fix-queue-race-1).
                    running = null;
                }
                return summary;
            })();
            return running;
        },
        async drop(id) {
            const entry = entries.find((e) => e.id === id);
            if (!entry) return false;
            await remove(entry);
            call('onDropped', entry);
            changed();
            return true;
        },
        /** Add fields to a stored entry (the optimistic undo record). False when it is gone. */
        async patch(id, fields) {
            const entry = entries.find((e) => e.id === id);
            if (!entry) return false;
            await persist({ ...entry, ...fields });
            return true;
        },
        /** End a hold: send the edit again with `rev` (default: the server's current one). */
        async resave(id, rev) {
            const entry = entries.find((e) => e.id === id && e.state !== 'queued');
            if (!entry) return false;
            const current = rev ?? conflictRev(entry.conflict?.body, field);
            const { conflict: _gone, ...rest } = entry;
            await persist({ ...rest, state: 'queued', ifMatch: current ?? null });
            changed();
            return true;
        },
        async clear() {
            await store.clearQueue();
            entries = [];
            changed();
        },
    };
}
