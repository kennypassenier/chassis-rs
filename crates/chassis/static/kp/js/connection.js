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

import { attachAll, controllerOf } from './controller.js';
import { ConnectionBanner } from './connection/controller.js';
import { CONNECTION } from './connection/values.js';

export { CONNECTION, CONNECTION_STATE_EVENT, CONNECTION_RETRY_EVENT, CONNECTION_STATES } from './connection/values.js';

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

/** The handle of an attached banner. @param {Element} element @returns {ConnectionHandle | null} */
export const connectionOf = (element) => controllerOf(element, ConnectionBanner)?.handle ?? null;

/**
 * Report the connection from the app.
 * @param {Element} element @param {ConnectionState} state @param {ConnectionDetail} [detail]
 */
export function setConnection(element, state, detail) {
    connectionOf(element)?.set(state, detail);
}

/**
 * Wire every connection banner under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachConnection(root = document) {
    return attachAll(root, CONNECTION, ConnectionBanner);
}
