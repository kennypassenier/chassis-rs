// The path of one connection: a row of hops, each allowed or refused, stopping at the first refusal [kpadopt6-ops; homelab's
// firewall path box, `fw-path`, in admin/web/js/pages/firewall.js].
//
//   setTrace(el, [
//       { title: 'tv', note: 'IoT network', verdict: 'allowed' },
//       { title: 'Firewall', note: 'tcp 8096', verdict: 'refused', rule: 'IoT to media' },
//       { title: 'Jellyfin', note: 'media network', verdict: 'allowed' },
//   ]);
//
//   <div class="kp-trace" data-kp-trace></div>
//
// This is the part only: it draws the hops it is given (the host works out the verdicts). It extends the step list
// (`.kp-steplist.kp-steplist--trace`, js/steplist.js): an allowed hop is `done` with the check, a refused one `failed` with
// the cross, the hops after the first refusal `skipped` (dimmed, "Not reached") and a hop that was not measured `pending`
// ("Not measured"). Above the hops a summary line says the outcome in a sentence ("Allowed", "Blocked at rule IoT to
// media"), as a polite status; the deciding rule is a chip that is keyboard-reachable and fires `kp-trace-rule`
// `{ rule, hop }`. Options, as attributes and as the third argument of setTrace():
//
//   data-kp-trace-layout    `auto` (default: a row, a column under 30rem of its own width), `row` or `column`
//   data-kp-trace-stop      `first-refusal` (default: a packet cannot pass a refusal) or `all` (each hop's own verdict, for a "what if")
//   data-kp-trace-rule      `chip` (default), `inline` (the rule in the note) or `off`
//   data-kp-trace-verdict   `both` (default: the mark and the word), `mark` or `word`; never colour alone
//   data-kp-trace-summary   `on` (default) or `off`
//   data-kp-trace-copy      a button that copies the trace as text ("tv > Firewall refused ...")
//   data-kp-trace-swap      a button (and the key S) that fires `kp-trace-swap`, for a form that swaps source and target
//   data-kp-density         `comfortable` (default) or `compact`
//   data-kp-state           `running` (the busy card over placeholder hops), `empty` ("Pick a source and a target") or
//                           `error` (the failed plate with Retry, `kp-trace-retry`), each as high as the trace was
//
// Nothing runs on import.

import { attachAll, attachOne, controllerOf } from './controller.js';
import { Trace } from './path-trace/controller.js';
import { TRACE } from './path-trace/values.js';

export { TRACE, TRACE_RULE_EVENT, TRACE_SWAP_EVENT, TRACE_RETRY_EVENT } from './path-trace/values.js';
export { traceStates, traceSummary, traceText } from './path-trace/states.js';

/**
 * @typedef {object} TraceHop
 * @property {string} title the thing the packet reaches (a device, a network, a rule, a target)
 * @property {string} [note] one line under it
 * @property {'allowed' | 'refused' | 'unknown'} verdict
 * @property {string} [rule] the rule that decided it
 * @property {string} [ports] "tcp 8096"
 */

/**
 * @typedef {object} TraceHandle
 * @property {HTMLElement} element
 * @property {(hops: readonly TraceHop[]) => void} set draw the hops (clears any state)
 * @property {(state: 'ready' | 'running' | 'empty' | 'error', options?: { message?: string }) => void} setState
 * @property {() => string} text the trace as text
 */

/**
 * The handle of a trace.
 * @param {Element} el
 * @returns {TraceHandle | null}
 */
export function trace(el) {
    return controllerOf(el, Trace)?.handle ?? null;
}

/**
 * Give every trace under `root` its parts; fill one with `setTrace` or the handle.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachTraces(root = document) {
    return attachAll(root, TRACE, Trace);
}

/**
 * Draw the hops of a trace (attaching it first when it was not yet).
 * @param {HTMLElement} el
 * @param {readonly TraceHop[]} hops
 */
export function setTrace(el, hops) {
    attachOne(el, Trace)?.handle.set(hops);
}
