// The acknowledge gate: a tick that must be set before a button may be pressed [kpadopt6-ops; homelab's major-version box,
// `uf-major__item`, `paintGo`].
//
// A warning alert says what is about to happen ("jellyfin 10.11 → 12.1 is a major version"), offers the release notes,
// and holds a checkbox with a sentence ("I read the release notes of 12.1"). The button it guards stays off until the
// box is ticked, says why while it is off, and answers a press on it by taking the reader to the first box still
// unticked. The gate is a human guard, not a security control: the server still verifies on its own.
//
//   <div class="kp-alert kp-alert--warning" data-kp-ack data-kp-ack-for="#update" data-kp-ack-key="jellyfin"
//        data-kp-ack-label="I read the release notes of 12.1" data-kp-ack-link="https://example.com/notes">
//       <div class="kp-alert__body"><strong>jellyfin 10.11 → 12.1 is a major version</strong> …</div>
//   </div>
//   <button class="kp-button kp-button--primary" id="update">Update</button>
//
//   data-kp-ack-for          the control(s) to enable (a selector; required)
//   data-kp-ack-label        the tick's words (default "I read the release notes")
//   data-kp-ack-link         the release notes' URL, with `data-kp-ack-link-label` for its words (opens in a new tab;
//                            opening it ticks nothing for the reader)
//   data-kp-ack-tone         `warning` (default), `destructive` or `info`
//   data-kp-ack-mode         several gates, one control: `each` (default, one tick per gate) or `all` (one tick for the lot)
//   data-kp-ack-reset        `on-change` (default: a changed `data-kp-ack-key`, `-label` or `-version` clears the tick, a
//                            stale tick is a false promise) or `never`
//   data-kp-ack-min-ms       the tick cannot be set before the link was opened or this many ms passed (default 0)
//   data-kp-ack-require-link the tick stays off until the link was opened once
//   data-kp-ack-focus        a press on the off control takes the focus to the first open tick (default on; `off`)
//   data-kp-ack-key          names the item for the event and the announcement
//   data-kp-ack-retry        a failed lookup offers a Retry button (`kp-ack-retry`)
//   data-kp-state            `loading` (the busy card of a loading table, centred over the alert, which keeps its height; the tick off), `error` (no notes link
//                            found, the tick stays) or `empty` (no gate at all: hidden, the control simply enabled)
//   data-kp-ack-locked       the tick is locked while the job runs
//   data-kp-ack-notes-open   the release notes (below) stand open; default closed
//   data-kp-ack-notes-label  the notes' accessible name, "Release notes of 12.1" (default "Release notes")
//   data-kp-ack-notes-headings  the level a `#` heading in the notes is written at, 1 to 6 (default 3: a `##` is an h4)
//   data-kp-ack-require-notes  the tick stays off until the notes were opened once
//
// The notes in the gate [wish-1120, homelab 113]: the host fetches the markdown (the gate never goes to the network) and hands it over,
// `setAckNotes(gate, markdown)` or `ackGate(gate).setNotes(markdown)`; `null` or an empty text takes them away. They stand in a fold
// under the alert, "Release notes", in a box that scrolls (tab stop, named region), built by js/markdown.js as DOM: headings, lists,
// links, code and quotes; raw HTML is text and an unsafe link is only its words. The gate's own states stand in for a slow or failed fetch
// (`data-kp-state` loading, error).
//
// `kp-ack-change` `{ key, checked, remaining, at }` is fired on the gate. The control carries `aria-disabled` (so the press
// can answer) and the reason as `data-kp-disabled-reason` (js/reason.js); the change is announced once, politely. Nothing
// runs on import.
//
// Each gate is one AckGate controller (js/ack-gate/controller.js over js/ack-gate/core.js and sync.js, on js/controller.js); the parts are listed in js/README.md.

import { attachAll } from './controller.js';
import { AckGate } from './ack-gate/controller.js';
import { HANDLES } from './ack-gate/targets.js';
import { ACK_GATE } from './ack-gate/values.js';

export { ACK_GATE, ACK_EVENT, ACK_RETRY_EVENT } from './ack-gate/values.js';

/**
 * @typedef {object} AckHandle
 * @property {HTMLElement} element
 * @property {() => boolean} checked
 * @property {(checked: boolean) => void} set
 * @property {(state: 'ready' | 'loading' | 'error' | 'empty') => void} setState
 * @property {(markdown: string | null) => void} setNotes the release notes as markdown, drawn safely in a fold of the gate; null takes them away
 * @property {(locked: boolean) => void} setLocked
 * @property {() => number} remaining how many gates of this gate's controls are still unticked
 */

/**
 * The handle of an attached gate.
 * @param {Element} el
 * @returns {AckHandle | null}
 */
export function ackGate(el) {
    return HANDLES.get(el) ?? null;
}

/**
 * Give a gate its release notes as markdown (the host fetched them), drawn safely in a fold under the alert; null takes them away.
 * @param {Element} gate an attached `[data-kp-ack]`
 * @param {string | null} markdown
 */
export function setAckNotes(gate, markdown) {
    HANDLES.get(gate)?.setNotes(markdown);
}

/**
 * Give every acknowledge gate under `root` its tick and guard its controls.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachAckGates(root = document) {
    return attachAll(root, ACK_GATE, AckGate);
}
