// The connection banner [kpadopt5-ops; spec item 9].
//
// "No connection, 3 changes waiting" and "Reconnecting…", apart from "the data is old" (the freshness line).
// No project builds it today: the hangmaten PWA, Life on a phone, homelab's dropped event stream (a toast now).
//
//   <div class="kp-connection" data-kp-connection></div>
//
// It takes no room at all while the connection is fine. By default it stands at the foot of the window (fixed to the
// bottom edge of its nearest positioned frame, so it is always in view); `data-kp-placement="top"` puts it in the flow
// directly under the navigation bar instead, where it pushes the content down. Both are options, switchable at runtime. The app reports what it sees:
//
//   setConnection(el, 'offline')                       the connection is gone
//   setConnection(el, 'offline', { pending: 3 })       ...and 3 changes wait to be sent
//   setConnection(el, 'refused', { why: 'The server did not accept the change.' })   online, but refused
//   setConnection(el, 'online')                        back; "Connected again" shows for a moment, then leaves
//
// States: `online` (absent), `offline` (the warning plate: what, why, what now, and the time to the next try),
// `reconnecting` (a try is under way, with its attempt number), `back` (success, then it leaves), `refused` (the
// destructive plate: the server refuses while the browser is online). On a phone: one line plus Retry now.
//
// Options, each an attribute and a JS option of attachConnection(root, options):
//
//   data-kp-connection-source  browser | app | both (default): `navigator.onLine` says nothing about the server, so the
//                              app reports its fetch or stream failures through setConnection; `both` listens to both
//   data-kp-connection-grace   ms (default 3000): a drop shorter than this shows nothing (no flicker on a Wi-Fi hiccup)
//   data-kp-pending            the app's queue count, exact ("3 changes waiting"); also setConnection(…, { pending })
//   data-kp-placement          bottom (default, the foot of the window) | top (in the flow, under the navigation bar)
//   data-kp-back-ms            ms (default 3000) "Connected again" stays
//   data-kp-retry              "off" leaves the Retry now button out (default: on)
//   data-kp-retry-delays       seconds between automatic tries, default "3,10,30,60" (the last repeats); "off" = none
//   data-kp-announce           off | state (default): said once per change, politely; going offline assertively
//
// Events (bubbling, on the banner):
//   kp-connection-state  { state, previous, pending }
//   kp-connection-retry  { attempt, auto }       the app tries again, then answers with setConnection
//
// Every word is in js/strings.js. Nothing runs on import; attachConnection(root) returns a detach.

import { arriveShown, leave } from './motion.js';
import { humanDuration } from './freshness.js';
import { getStrings } from './strings.js';

/** A connection banner. */
export const CONNECTION = '[data-kp-connection]';
/** Fired when the shown state changed. */
export const CONNECTION_STATE_EVENT = 'kp-connection-state';
/** Fired when a try should be made. */
export const CONNECTION_RETRY_EVENT = 'kp-connection-retry';
/** The states. */
export const CONNECTION_STATES = /** @type {const} */ (['online', 'offline', 'reconnecting', 'back', 'refused']);

/**
 * @typedef {'online' | 'offline' | 'reconnecting' | 'back' | 'refused'} ConnectionState
 * @typedef {object} ConnectionDetail
 * @property {number} [pending] changes waiting to be sent
 * @property {string} [why] a sentence from the app, for `refused`
 * @property {number} [attempt] the number of the try under way
 * @typedef {object} ConnectionHandle
 * @property {HTMLElement} element
 * @property {() => ConnectionState} state
 * @property {(state: ConnectionState, detail?: ConnectionDetail) => void} set
 */

/** @type {WeakMap<Element, ConnectionHandle>} */
const handles = new WeakMap();

/** The handle of an attached banner. @param {Element} element */
export const connectionOf = (element) => handles.get(element) ?? null;

/**
 * Report the connection from the app.
 * @param {Element} element @param {ConnectionState} state @param {ConnectionDetail} [detail]
 */
export function setConnection(element, state, detail) {
    handles.get(element)?.set(state, detail);
}

/**
 * Wire every connection banner under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachConnection(root = document) {
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(CONNECTION) ? [root] : []),
        ...root.querySelectorAll(CONNECTION),
    ]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const el of found) if (!handles.has(el)) undo.push(wire(el));
    return () => undo.forEach((u) => u());
}

/** @param {HTMLElement} el @returns {() => void} */
function wire(el) {
    const doc = el.ownerDocument;
    const view = /** @type {Window} */ (doc.defaultView);
    const s = () => getStrings();
    const make = (/** @type {string} */ tag, /** @type {string} */ className) => {
        const node = doc.createElement(tag);
        node.className = className;
        return node;
    };
    const source = () => el.getAttribute('data-kp-connection-source') ?? 'both';
    const grace = () => {
        const n = Number(el.getAttribute('data-kp-connection-grace') ?? 3000);
        return Number.isFinite(n) && n >= 0 ? n : 3000;
    };
    const backMs = () => {
        const n = Number(el.getAttribute('data-kp-back-ms') ?? 3000);
        return Number.isFinite(n) && n >= 0 ? n : 3000;
    };
    const delays = () => {
        const raw = el.getAttribute('data-kp-retry-delays');
        if (raw === 'off') return [];
        const list = (raw ?? '3,10,30,60')
            .split(/[\s,]+/)
            .map(Number)
            .filter((n) => Number.isFinite(n) && n > 0);
        return list.length ? list : [3, 10, 30, 60];
    };

    el.classList.add('kp-connection');
    el.hidden = true;
    const band = make('div', 'kp-alert kp-connection__band');
    const mark = make('span', 'kp-connection__mark');
    mark.setAttribute('aria-hidden', 'true');
    const body = make('div', 'kp-alert__body kp-connection__body');
    const title = make('strong', 'kp-connection__title');
    const why = make('span', 'kp-connection__why');
    const meta = make('span', 'kp-connection__meta');
    body.append(title, why, meta);
    const retry = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-connection__retry'));
    retry.type = 'button';
    band.append(mark, body, retry);
    const voice = make('span', 'kp-sr-only');
    voice.setAttribute('role', 'status');
    el.replaceChildren(band, voice);
    if (el.getAttribute('data-kp-placement') !== 'top') el.setAttribute('data-kp-placement', 'bottom');

    /** @type {ConnectionState} */
    let shown = 'online';
    let pending = Number(el.getAttribute('data-kp-pending') ?? 0) || 0;
    let attempt = 0;
    let nextAt = 0;
    let graceTimer = 0;
    let backTimer = 0;
    let tickTimer = 0;
    let leaving = false;

    const stopTick = () => {
        view.clearInterval(tickTimer);
        tickTimer = 0;
    };
    const countdown = () => {
        const left = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
        meta.textContent =
            pendingText() + (shown === 'offline' && nextAt ? `${pendingText() ? ' · ' : ''}${s().connNextTry(humanDuration(left, s()))}` : '');
        if (nextAt && Date.now() >= nextAt && shown === 'offline') {
            nextAt = 0;
            stopTick();
            tryNow(true);
        }
    };
    const pendingText = () => (pending > 0 ? s().connPending(pending) : '');
    /** @param {boolean} auto */
    function tryNow(auto) {
        attempt += 1;
        stopTick();
        nextAt = 0;
        draw('reconnecting');
        el.dispatchEvent(new CustomEvent(CONNECTION_RETRY_EVENT, { bubbles: true, detail: { attempt, auto } }));
    }
    /** @param {ConnectionState} state */
    function draw(state) {
        const previous = shown;
        shown = state;
        el.setAttribute('data-kp-state', state);
        band.classList.toggle('kp-alert--warning', state === 'offline' || state === 'reconnecting');
        band.classList.toggle('kp-alert--success', state === 'back');
        band.classList.toggle('kp-alert--destructive', state === 'refused');
        mark.replaceChildren();
        if (state === 'reconnecting') mark.append(make('span', 'kp-spinner'));
        else mark.textContent = state === 'back' ? '✓' : '!';
        const t = s();
        const text =
            state === 'offline'
                ? [t.connOffline, t.connOfflineWhy]
                : state === 'reconnecting'
                  ? [t.connReconnecting, attempt > 1 ? t.connAttempt(attempt) : t.connReconnectingWhy]
                  : state === 'back'
                    ? [t.connBack, pending > 0 ? t.connBackSending(pending) : t.connBackWhy]
                    : [t.connRefused, refusedWhy || t.connRefusedWhy];
        title.textContent = text[0] ?? '';
        why.textContent = text[1] ?? '';
        meta.textContent = state === 'back' ? '' : pendingText();
        retry.textContent = t.connRetry;
        retry.hidden = el.getAttribute('data-kp-retry') === 'off';
        retry.toggleAttribute('data-kp-idle', state === 'back' || state === 'reconnecting');
        retry.tabIndex = state === 'back' || state === 'reconnecting' ? -1 : 0;
        retry.disabled = false;
        if (state === 'offline') {
            const list = delays();
            if (list.length && el.getAttribute('data-kp-retry-delays') !== 'off') {
                const wait = list[Math.min(attempt, list.length - 1)] ?? list[0] ?? 3;
                nextAt = Date.now() + wait * 1000;
                stopTick();
                countdown();
                tickTimer = view.setInterval(countdown, 500);
            }
        }
        if (el.getAttribute('data-kp-announce') !== 'off') {
            voice.setAttribute('role', state === 'offline' ? 'alert' : 'status');
            voice.textContent = `${text[0]}. ${text[1]}`;
        }
        if (previous !== state) el.dispatchEvent(new CustomEvent(CONNECTION_STATE_EVENT, { bubbles: true, detail: { state, previous, pending } }));
    }
    let refusedWhy = '';
    const show = () => {
        view.clearTimeout(backTimer);
        if (leaving) el.removeAttribute('data-kp-leaving');
        leaving = false;
        band.hidden = false;
        if (el.hidden) {
            el.hidden = false;
            arriveShown(band);
        }
    };
    const hide = () => {
        if (el.hidden || leaving) return;
        leaving = true;
        el.setAttribute('data-kp-leaving', '');
        void leave(band, { hide: true }).then(() => {
            if (!leaving) {
                band.hidden = false;
                return;
            }
            leaving = false;
            el.removeAttribute('data-kp-leaving');
            el.hidden = true;
            band.hidden = false;
        });
    };

    /** @param {ConnectionState} state @param {ConnectionDetail} [detail] */
    const set = (state, detail = {}) => {
        if (!CONNECTION_STATES.includes(state)) return;
        if (detail.pending !== undefined) pending = Math.max(0, Math.round(detail.pending));
        if (detail.attempt !== undefined) attempt = detail.attempt;
        refusedWhy = detail.why ?? (state === 'refused' ? refusedWhy : '');
        view.clearTimeout(graceTimer);
        graceTimer = 0;
        if (state === 'offline' || state === 'refused' || state === 'reconnecting') {
            if (state === 'offline' && shown === 'online' && grace() > 0) {
                // A drop shorter than the grace shows nothing.
                graceTimer = view.setTimeout(() => {
                    show();
                    draw('offline');
                }, grace());
                return;
            }
            if (state === 'refused') attempt = 0;
            show();
            draw(state);
            return;
        }
        if (state === 'online') {
            stopTick();
            nextAt = 0;
            const wasShown = shown !== 'online' && !el.hidden;
            attempt = 0;
            if (!wasShown) {
                shown = 'online';
                return;
            }
            show();
            draw('back');
            backTimer = view.setTimeout(() => {
                shown = 'online';
                el.setAttribute('data-kp-state', 'online');
                hide();
                el.dispatchEvent(new CustomEvent(CONNECTION_STATE_EVENT, { bubbles: true, detail: { state: 'online', previous: 'back', pending } }));
            }, backMs());
        }
    };

    const onRetry = () => {
        if (shown === 'offline' || shown === 'refused') tryNow(false);
    };
    retry.addEventListener('click', onRetry);
    const onOffline = () => {
        if (source() !== 'app') set('offline');
    };
    const onOnline = () => {
        if (source() !== 'app') set('online');
    };
    view.addEventListener('offline', onOffline);
    view.addEventListener('online', onOnline);
    if (source() !== 'app' && view.navigator.onLine === false) set('offline');

    /** @type {ConnectionHandle} */
    const handle = { element: el, state: () => shown, set };
    handles.set(el, handle);
    return () => {
        view.clearTimeout(graceTimer);
        view.clearTimeout(backTimer);
        stopTick();
        retry.removeEventListener('click', onRetry);
        view.removeEventListener('offline', onOffline);
        view.removeEventListener('online', onOnline);
        handles.delete(el);
    };
}
