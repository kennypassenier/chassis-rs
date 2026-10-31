// An editable multi-track sequencer: bars in lanes that are moved, resized and linked like clips in a video editor
// [timeline-1029; Kitchen's recipe steps: Kenny, 2026-10-29 "Echt onderdeel"].
//
// Why its own module and not an `editable` mode of the run timeline (js/gantt.js): the gantt lives on the clock (epoch ms, a
// window that follows now, runs that grow, a brush that selects a range) and an editor lives on a plan (relative values in
// one unit, a window that fits the plan, a bar that follows the pointer). Sharing the code would have meant a switch in every
// function of a 2 100-line module. What is shared is the look: the host is `.kp-gantt`, its frame, axis, lanes, rules, line for
// now, state plate, busy card and bars are the gantt's own classes (`.kp-gantt__run` with `data-kp-state="ok"` and a series), so
// every register that dresses the gantt dresses this too, and a bar here is the same bar there.
//
//   <section class="kp-gantt kp-sequencer" data-kp-sequencer data-kp-sequencer-unit="minute" data-kp-sequencer-snap="1"
//            aria-label="Spaghetti bolognese"></section>
//
//   setSequencerItems(el, [
//       { id: 'boil', lane: 'pasta', label: 'Boil the water', start: 20, duration: 8 },
//       { id: 'cook', lane: 'pasta', label: 'Cook the spaghetti', start: 28, duration: 10 },
//       { id: 'brown', lane: 'sauce', label: 'Brown the mince', start: 20, duration: 11, with: 'boil' },
//   ], [{ id: 'sauce', label: 'Sauce' }, { id: 'pasta', label: 'Pasta' }]);
//   el.addEventListener('kp-sequencer-change', (e) => save(e.detail.items));   // [{ id, lane, start, duration, with }]
//
// Values (`start`, `duration`, `with`) are in the sequencer's unit: minutes by default, `data-kp-sequencer-unit` takes second,
// minute, hour, day or week (and their short forms). `with` is the id of another item: "starts together with it".
//
// Options (attributes, read again when they change; each has a default):
//   unit      second | minute (default) | hour | day | week
//   snap      the step, in the unit, everything snaps to (1)
//   snap-items  `off` leaves out the snap to other items' edges (on; within 8 px)
//   overlap   `refuse` (default: an edit that would overlap in a lane does not happen), `push` (the items in the way, with
//             what runs alongside them, move later) or `allow` (items overlap and take rows of their lane)
//   lanes     `fixed` keeps every item in its lane (default: items change lane)
//   editable  `off` shows the plan without editing
//   zoom      1 = the plot fits its box; 0.5 to 16. Under --kp-sequencer-min-width (26rem) the plot keeps that width and the
//             frame scrolls sideways, the lane names held at the start edge
//   span      the shortest window, in the unit (0: fit the plan with a little room)
//   toolbar, hint   `off` leaves out the zoom row (and the total in it) or the hint line
//
// Pointer: drag a bar to move it (along the axis and between lanes), drag either edge to resize it; Escape during a drag puts it
// back. A mouse wheel with Ctrl or a two-finger pinch zooms; a finger on empty ground pans. The window never changes under a
// drag (it grows when the edit is dropped), and nothing the pointer is on is rebuilt: bars are kept by id and move by custom
// properties only.
// Keyboard: arrows move between items; Enter or Space picks one up; then ← → move by the snap step (Ctrl: ten steps),
// Shift+← → resize the end, Ctrl+Shift+← → the start, Alt+↑ ↓ change lane, Enter drops it, Escape puts it back. L chooses the
// item the focused one runs alongside, U lets it run on its own. Every step is announced in a polite status region.
// Linked: moving any member of a group moves the whole group by the same amount; a join is drawn from an item to its partner.
//
// Events (bubbling, on the sequencer): kp-sequencer-change { items, changed, source: 'pointer' | 'keyboard' | 'link', total },
// kp-sequencer-select { id }, kp-sequencer-refuse { id, reason, blocker }, kp-sequencer-retry (the failed plate's Retry).
// The words are the dictionary's (`sequencer…` in js/strings.js). Nothing runs on import; attachSequencers(root) returns a detach.

export {
    SEQUENCER,
    SEQUENCER_CHANGE_EVENT,
    SEQUENCER_SELECT_EVENT,
    SEQUENCER_REFUSE_EVENT,
    SEQUENCER_RETRY_EVENT,
    SEQUENCER_UNITS,
    SEQUENCER_OVERLAPS,
    SEQUENCER_ZOOM_MIN,
    SEQUENCER_ZOOM_MAX,
} from './sequencer/constants.js';
export { sequencerUnit, sequencerSnap } from './sequencer/units.js';
export { sequencerClean, sequencerGroup, sequencerPlan } from './sequencer/plan.js';
export { sequencerLink, sequencerUnlink, sequencerKey, sequencerApplyKey } from './sequencer/links.js';
export { sequencerRows, sequencerTotalOf, sequencerWindow, sequencerTicks, sequencerClampZoom } from './sequencer/timeline.js';
export { attachSequencers } from './sequencer/attach.js';
export {
    setSequencerItems,
    getSequencerItems,
    getSequencerTotal,
    setSequencerState,
    setSequencerNow,
    setSequencerZoom,
    getSequencerZoom,
    setSequencerSelection,
} from './sequencer/api.js';

/** @typedef {import('./sequencer/units.js').SequencerUnit} SequencerUnit */
/** @typedef {import('./sequencer/units.js').SequencerOverlap} SequencerOverlap */
/** @typedef {import('./sequencer/units.js').SequencerItem} SequencerItem */
/** @typedef {import('./sequencer/units.js').SequencerLane} SequencerLane */
/** @typedef {import('./sequencer/units.js').SequencerChangeItem} SequencerChangeItem */
/** @typedef {import('./sequencer/units.js').SequencerRefusal} SequencerRefusal */
/** @typedef {import('./sequencer/units.js').SequencerPlan} SequencerPlan */
/** @typedef {import('./sequencer/units.js').SequencerEdit} SequencerEdit */
/** @typedef {import('./sequencer/units.js').SequencerOptions} SequencerOptions */
/** @typedef {import('./sequencer/units.js').SequencerKeyAction} SequencerKeyAction */
/** @typedef {import('./sequencer/units.js').SequencerState} SequencerState */
/** @typedef {import('./sequencer/units.js').Strings} Strings */
/** @typedef {import('./sequencer/units.js').SequencerAttachOptions} SequencerAttachOptions */
/** @typedef {import('./sequencer/instance.js').SequencerModel} SequencerModel */
