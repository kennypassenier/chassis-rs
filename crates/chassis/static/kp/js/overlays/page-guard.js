// The page-wide leave check [habits-1103]: one call for a router to make once per screen move.
//
// `pageChanged()` says whether anything would be lost by leaving: a visible guarded region (`data-kp-region-guard`), an open
// guarded dialog (`data-kp-dialog-guard`) or an editor registered with `registerEditor` (js/overlays/page-editors.js) holds
// unsaved work. `whenPageFree(go)` runs `go` at once when nothing does; else every region and editor that names a save
// (`setRegionFlush`, `flush`) saves first, and only if something is still unsaved the package's "Discard your changes?" asks,
// ONCE for all of them. Discard releases them all and runs `go`; Keep editing runs nothing. Editors marked `reloadOnly` stay out.
import { dialogUnits } from './dialog-guard.js';
import { leaveUnits } from './guard-question.js';
import { regionUnits } from './region-guard.js';

/** What a move to another screen would lose right now. */
function pageUnits() {
    return [...dialogUnits(), ...regionUnits()];
}

/** Whether leaving the screen would lose unsaved work (a guarded region, a guarded dialog or a registered editor). */
export function pageChanged() {
    return pageUnits().length > 0;
}

/**
 * Run `go` at once when nothing unsaved is held, else save what can save itself, ask once, and run `go` on Discard.
 * @param {() => void} go
 * @returns {boolean} whether `go` ran at once
 */
export function whenPageFree(go) {
    return leaveUnits(pageUnits, go);
}
