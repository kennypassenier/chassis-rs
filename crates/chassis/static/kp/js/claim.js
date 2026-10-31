// Who brings it: a claim on every row of a checklist [kpadopt6; kp-soft's packing list "Ik breng mee"].
//
// A checklist (js/checklist.js) whose items can be taken on by people. The row keeps its box, its label and its detail;
// one more cell stands at the end of it, in a column of its own so the names line up from row to row:
//
//   <div class="kp-checklist" data-kp-checklist data-kp-checklist-claim aria-label="Packing list"></div>
//
//   setClaimViewer(list, { id: 'kenny', name: 'Kenny' });          // who is looking: the page decides, the module reads no session
//   setChecklistItems(list, [{ id: 'stove', label: 'Gas stove', group: 'Kitchen', claim: { by: [{ id: 'tom', name: 'Tom' }] } }, …]);
//   list.addEventListener('kp-claim-change', (e) => e.detail.settle(api.claim(e.detail.id, e.detail.by)));
//
// Kenny, 2026-10-17 ("Meerdere personen kunnen een item meenemen"): an item has a list of people, not one. Taking an item
// adds you, letting go takes you off, and nobody ever takes an item over from somebody else; `data-kp-claim-max` caps how
// many may bring one (0, the default, no cap). That answers the spec's question about taking over: there is nothing to
// take over.
//
// What a row shows. The people who bring it (`both`: their mark in their own colour and their name; a long list wraps),
// or, when nobody does, a loud gap: the destructive edge, a glyph and the words "Nobody yet", never colour alone. Then one
// button: "I'll bring it", or while you are one of them "I'm bringing it" (pressed; a press lets go). Its three faces
// ("I'll bring it", the held one, the spinner) share one grid cell, so the button never changes width.
//
// What a press does. The page hears the cancelable `kp-claim-change` and may call `detail.settle(promise)`: the button
// shows the spinner and the row does not move until the answer. A promise that resolves (to nothing or `true`) lets the
// change stand; one that rejects, resolves `false` or resolves `{ refused: true, by?, error? }` puts the row back to
// what the server says (`by`), flashes the row's edge for 3000 ms and says it in a polite line ("Tom took it just before
// you"). Without `settle` the change stands at once. Letting go (and removing somebody in assign mode) offers Undo.
//
// Options (attributes on the list, each also an option of `attachClaims`):
//   data-kp-checklist-claim        present: the claim part is on
//   data-kp-claim-mode             `claim` (default, a button on each row) or `assign` (a person menu on each row)
//   data-kp-claim-gap              `loud` (default) or `quiet`
//   data-kp-claim-gap-sort         `keep` (default) or `top` (rows nobody takes go first inside their group)
//   data-kp-claim-filter           `all` (default) | `gaps` | `mine`, shown as a chip group in the bar; `false` hides the chips
//   data-kp-claim-person           `both` (default) | `idmark` | `name`
//   data-kp-claim-count            `both` (default) | `bar` | `group` | `none`
//   data-kp-claim-undo-ms          Undo after a release (default 6000, 0 for none)
//   data-kp-claim-self-label       the take face's words (default the dictionary's)
//   data-kp-claim-max              how many people may bring one item (default 0: no cap)
//   data-kp-claim-keys             `false` turns the keys off (`c` on a focused row, `Shift C` for the gaps)
//   data-kp-claim-take-all         present: "Take every open item" in the bar, behind Undo
//   data-kp-claim-copy             present: "Copy the open list" in the bar
//   data-kp-claim-disabled         present: nobody can press (with `data-kp-claim-disabled-reason`)
//   data-kp-remember="claim-filter" keeps the chip across visits
//
// Events (bubbling, on the list): `kp-claim-change` `{ id, action, person, by, previousBy, items, settle }` (cancelable),
// `kp-claim-filter` `{ filter }`, `kp-claim-retry` (the Retry of a failed list). `setClaim(list, id, claim)` is a push
// update (another person took it while the page was open). Every word is in js/strings.js; nothing runs on import.

export { CLAIM, CLAIM_EVENT, CLAIM_FILTER_EVENT, CLAIM_RETRY_EVENT, CLAIM_FILTERS, CLAIM_REFUSED_MS, CLAIM_UNDO_MS } from './claim/constants.js';
export { claimPeople } from './claim/model.js';
export { setClaimViewer, setClaimPeople, claimFilter, setClaim } from './claim/api.js';
export { setClaimFilter } from './claim/decorate.js';
export { attachClaims } from './claim/attach.js';

/** @typedef {import('./claim/types.js').ClaimPerson} ClaimPerson */
/** @typedef {import('./claim/types.js').ClaimInfo} ClaimInfo */
/** @typedef {import('./claim/types.js').ClaimDetail} ClaimDetail */
/** @typedef {import('./claim/types.js').ClaimState} ClaimState */
