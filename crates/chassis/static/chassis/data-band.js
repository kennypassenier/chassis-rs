// The offline client on screen (feat-offline-1): the connection band's pending
// count and "syncing" look, and the kit's toasts for a held edit and a nearly
// full copy. The only DOM-facing module of the client besides data-logout.js.
//
// kp-themes 12.2's connection component has no `syncing` state (gap recorded
// in kp-gaps/chassis-rs.md); the nearest is `reconnecting`, a spinner with the
// pending count, which is what a replay looks like.

export const MESSAGES = {
    conflict: 'An edit made offline was refused: this item was changed elsewhere. It is kept in the failed list; the other edits were sent.',
    conflictHeld: 'An edit made offline was refused: this item was changed elsewhere. Later edits wait until you decide.',
    review: 'Review',
    nearCap: (pct) => `The offline copy uses ${pct}% of its space.`,
    full: 'The offline copy is full: new items are not kept offline until you clear some.',
    refused: 'The service answered with an error; edits will be sent again.',
    expired: 'You are logged out; edits will be sent after you log in.',
};

import { wordsOf } from './data-errors.js';

const BAND = '[data-kp-connection]';
/** The band state each way a replay can stop; `null` (all sent) is online. */
const AFTER = { unreachable: 'offline', retry: 'refused', auth: 'refused', held: 'online' };

function paint(doc, kp, state, pending, why) {
    for (const el of doc.querySelectorAll(BAND)) {
        el.setAttribute('data-kp-pending', String(pending));
        const handle = kp.connectionOf(el);
        if (handle && state) handle.set(state, { pending, why });
        else if (handle && handle.state() !== 'online') handle.set(handle.state(), { pending });
    }
}

/** States whose words kp-themes writes at `set()` time and that a redraw can repeat unchanged. */
const REDRAWABLE = ['offline', 'reconnecting', 'refused'];

/**
 * Write the band's words again in the current language (fix-offline-band-lang-1).
 * kp-themes draws them only when the state is set, so a language change after
 * that left them in the language of page load. `refused` keeps the reason the
 * band already holds (no `why` passed); `back` and `online` are momentary.
 */
export function redrawBand(doc, kp, pending) {
    for (const el of doc.querySelectorAll(BAND)) {
        const handle = kp.connectionOf(el);
        const state = handle?.state();
        if (state && REDRAWABLE.includes(state)) handle.set(state, { pending });
    }
}

/** Wire the page's events to the band and the toasts; returns an unbind function. */
export function bindBand({ win, doc, kp, data, messages = {}, view = null }) {
    // Read at show time, so a toast follows the language of the moment (fix-habits-data-7).
    const words = () => ({ ...MESSAGES, ...wordsOf(messages) });
    let toastEl = null;
    const once = (words, options) => {
        if (!toastEl?.isConnected) toastEl = kp.toast(words, { live: 'assertive', sticky: true, ...options });
    };
    const on = (target, name, fn) => {
        target.addEventListener(name, fn);
        return () => target.removeEventListener(name, fn);
    };
    const detail = (event) => event.detail ?? {};
    // An app that builds its own view calls preventDefault(); otherwise the kit's opens.
    const review = (trigger = null) => {
        const event = new win.CustomEvent('chassis-data-review', { detail: { queue: data.queue() }, cancelable: true });
        win.dispatchEvent(event);
        if (!event.defaultPrevented && view) view.open(trigger).catch((err) => console.warn('chassisData: the failed-edits view could not open.', err));
    };
    const offs = [
        on(win, 'chassis-data-queue', (e) => paint(doc, kp, null, detail(e).pending ?? 0)),
        on(win, 'chassis-data-syncing', (e) => detail(e).syncing && paint(doc, kp, 'reconnecting', data.pending())),
        on(win, 'chassis-data-synced', (e) => {
            const state = AFTER[detail(e).stopped] ?? 'online';
            const text = words();
            const why = { refused: text.refused, offline: undefined }[state];
            paint(doc, kp, state, data.pending(), detail(e).stopped === 'auth' ? text.expired : why);
        }),
        on(win, 'chassis-data-conflict', (e) => {
            const text = words();
            once(detail(e).entry?.state === 'held' ? text.conflictHeld : text.conflict, { action: { label: text.review, onClick: () => review() } });
        }),
        on(win, 'chassis-data-storage', (e) => {
            const { level, used, max } = detail(e);
            const text = words();
            if (level === 'warn') once(text.nearCap(Math.round((used / max) * 100)), { sticky: false });
            if (level === 'full') once(text.full);
        }),
        on(doc, 'kp-connection-retry', () => data.retry()),
        // The language changed (kp setLanguage / setStrings): the band words follow.
        on(doc, 'kp-strings-change', () => redrawBand(doc, kp, data.pending())),
        // Any element marked data-chassis-review opens the review, for an app's own button.
        on(doc, 'click', (e) => e.target?.closest?.('[data-chassis-review]') && review(e.target.closest('[data-chassis-review]'))),
    ];
    return () => offs.forEach((off) => off());
}
