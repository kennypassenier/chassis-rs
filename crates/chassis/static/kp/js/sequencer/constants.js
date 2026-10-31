// The attribute, event names and fixed sizes of the sequencer.

/** The editable sequencers. */
export const SEQUENCER = '[data-kp-sequencer]';
/** Fired after an edit is dropped: `detail` `{ items, changed, source, total }`. */
export const SEQUENCER_CHANGE_EVENT = 'kp-sequencer-change';
/** Fired when the selected item changes: `detail` `{ id }` (null when none). */
export const SEQUENCER_SELECT_EVENT = 'kp-sequencer-select';
/** Fired when an edit was refused: `detail` `{ id, reason, blocker }`. */
export const SEQUENCER_REFUSE_EVENT = 'kp-sequencer-refuse';
/** Fired when the Retry of the failed plate is pressed. */
export const SEQUENCER_RETRY_EVENT = 'kp-sequencer-retry';
/** What one unit is, in seconds. */
export const SEQUENCER_UNITS = Object.freeze({ second: 1, minute: 60, hour: 3600, day: 86_400, week: 604_800 });
/** The overlap rules. */
export const SEQUENCER_OVERLAPS = Object.freeze(['refuse', 'push', 'allow']);
/** The zoom limits. */
export const SEQUENCER_ZOOM_MIN = 0.5;
export const SEQUENCER_ZOOM_MAX = 16;
/** The steps an axis chooses from, in seconds. */
export const TICK_STEPS = [
    1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10_800, 21_600, 43_200, 86_400, 172_800, 604_800, 1_209_600, 2_419_200, 4_838_400,
    9_676_800, 31_536_000,
];
export const EPS = 1e-9;
/** How far, in px, an edge pulls a dragged edge to it. */
export const REACH_PX = 8;
/** How far, in px, a pointer moves before a press is a drag. */
export const DRAG_PX = 4;
/** The room, as a share of the plan, the window keeps after the last item. */
export const HEADROOM = 0.2;
