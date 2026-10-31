// The request inspector [kpadopt5; chassis' captured requests and the clients dialog, kyu's delivery attempts].
//
// A foldable block per HTTP request the service captured: the method, the path,
// the status (in its tone and in words), when; opened, the headers as key and
// value, the body as code, "showing the first N of M", and Copy as curl, as JSON
// or as the body. It composes parts the package already has (`.kp-card` and its
// four states, `.kp-accordion`, `.kp-kv`, `.kp-code`, `.kp-badge`,
// `.kp-segmented`); the one new piece of logic is toCurl().
//
//   <div class="kp-card kp-inspector" data-kp-requests data-kp-requests-open="failed"></div>
//
//   setRequests(el, [{ at: '2026-10-17T20:18:03+02:00', method: 'POST', path: '/hooks/backup', status: 202,
//       headers: { 'content-type': 'application/json', authorization: 'Bearer …' },
//       body: '{"ok":true}', truncated: false, bodyBytes: 11, source: 'client' }]);
//
// Options, as attributes and as the second argument of attachRequestInspectors():
//
//   data-kp-secret-headers      header names masked on screen and in a copy (default authorization, cookie, set-cookie, x-api-key, proxy-authorization)
//   data-kp-secrets-in-copy     `masked` (default: the copy carries ******** and a separate button, "Copy curl with secrets", carries the real values) |
//                               `masked-only` (no such button) | `real` (every copy carries them)
//   data-kp-requests-open       `none` (default, Kenny 2026-10-17: all folded) | `failed` (the 4xx and 5xx are open) | `first`
//   data-kp-requests-max        how many show before "Show N older" (default 20), newest first
//   data-kp-copy-as             `curl,json,body` (default all three)
//   data-kp-requests-test       `false` leaves the Send test button out of the empty list
//
// The block has the card's four states (js/card-state.js): `setRequestsState(el,
// 'loading')` lays the busy card over the list at least three rows tall, an empty list
// says so, centred, with Send test (event `kp-requests-test`), a failed one has Retry
// (`kp-requests-retry`). The times are dd/mm/yyyy HH:MM with the exact ISO in the title.
// Events on the element: `kp-requests-copy` `{ what, masked }`.
//
// Each inspector is one RequestInspector controller (js/request-inspector/controller.js, on js/controller.js) with its
// memory on the instance; the parts are listed in js/README.md.

import { attachAll } from './controller.js';
import { RequestInspector } from './request-inspector/controller.js';
import { REQUESTS } from './request-inspector/format.js';

export {
    REQUESTS,
    SECRET_HEADERS,
    MASK,
    REQUESTS_MAX,
    REQUESTS_COPY_EVENT,
    REQUESTS_TEST_EVENT,
    REQUESTS_RETRY_EVENT,
    REQUESTS_COPIED_MS,
    toneOf,
    toCurl,
    toJson,
} from './request-inspector/format.js';
export { setRequests, setRequestsState } from './request-inspector/api.js';

/**
 * @typedef {object} CapturedRequest
 * @property {string | number} [at] the moment: ISO text or milliseconds
 * @property {string} method
 * @property {string} path
 * @property {number} [status]
 * @property {Record<string, string> | [string, string][]} [headers]
 * @property {string} [body]
 * @property {boolean} [truncated] only the start of the body was kept
 * @property {number} [bodyBytes] the size of the whole body
 * @property {boolean} [binary]
 * @property {string} [source] `test` marks a request the page sent itself
 * @property {string} [url] the full address, for curl (otherwise `origin` + path)
 */

/**
 * @typedef {object} InspectorOptions
 * @property {readonly string[]} [secretHeaders]
 * @property {'masked' | 'masked-only' | 'real'} [secretsInCopy]
 * @property {'failed' | 'first' | 'none'} [open]
 * @property {number} [max]
 * @property {readonly ('curl' | 'json' | 'body')[]} [copyAs]
 * @property {string} [origin] put before a path that is not a full address
 */

/**
 * Give every `[data-kp-requests]` under `root` its card, filter and list.
 * @param {ParentNode} [root]
 * @param {InspectorOptions} [options]
 * @returns {() => void} detach
 */
export function attachRequestInspectors(root = document, options = {}) {
    return attachAll(root, REQUESTS, RequestInspector, options);
}
