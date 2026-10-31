// A run timeline: one bar per run on a time axis, running bars growing live
// [kpadopt-time; the admin dashboard's `ac-tl` on the Activity page].
//
// `section.kp-gantt[data-kp-gantt]` is filled by attachGantts(): a bar of
// range buttons (1 h, 6 h, 24 h, 7 d), a Live button and the selected
// range; below it the axis, one lane per job (or stack, or host) with its
// label on the left, the runs as bars in their lane, and a line for now.
// The page gives the lanes and the runs (setGanttRuns) and the state of the
// whole (setGanttState); the timeline paints them in place.
//
//   <section class="kp-gantt" data-kp-gantt data-kp-gantt-ranges="1h 6h 24h 7d" data-kp-gantt-range="6h"
//            aria-label="Operations of the last 6 hours"></section>
//
//   setGanttRuns(el, [
//       { id: 'r41', lane: 'backup', label: 'Backup photos', start: Date.now() - 3600e3, end: Date.now() - 3000e3, state: 'ok' },
//       { id: 'r42', lane: 'update', label: 'Update images', start: Date.now() - 600e3, state: 'running' },
//   ], [{ id: 'backup', label: 'Backups' }, { id: 'update', label: 'Updates' }]);
//
//   state    `queued` (a dashed, hollow bar from the moment it was queued to
//            now), `running` (a striped bar growing to now, a bright
//            leading edge), `ok` (a solid bar from start to end),
//            `failed` (solid, taller than the others, with a cap at its end
//            and a cross where the bar is wide enough) and `planned`
//            [gaps-time-1019] (still to come: an outlined bar on the card's own
//            ground with the theme's own hatching, from `start` to `end`, so it
//            is the dated plan, never a run; with a `series` its outline and
//            hatching take that colour). The tone is never the only carrier:
//            the height, the cap, the stripes, the dashes and the hatching
//            are, and so is the bar's name
//   label    a label that does not fit its bar stands outside it [gaps-time-1019]: after the bar when the lane has room before the
//            next bar of its row, else before it, else (a lane too full for either) not drawn: a label is never cut with an ellipsis,
//            the bar's name and card carry it. A label stands clear of the mark beside its bar, and a mark that would lie on a bar
//            stands clear of it (--kp-g-dodge). A label that fits stays inside. Measured against the bar's
//            real width, so a growing bar takes its label back in when it is wide enough
//   live     a running or queued bar ends at now, whatever `end` says; one
//            custom property (`--kp-g-now`) moves every second and the
//            stylesheet places every bar from it, so the page repaints
//            nothing. While the window is Live its right edge follows now
//   range    the buttons set how much time the window shows; the window
//            ends a little after now while Live. Drag across the plot to
//            select a range (a click on a bar still opens it): the chip
//            shows it with Zoom (the window becomes the selection and stops
//            following now) and Clear. Live returns to following now
//   lanes    a run takes the first row of its lane where no other run is
//            in its way; a lane's rows never fewer while the window stays
//            the same, so a run finishing moves nothing. A lane with a run
//            still open reserves one spare row, and the frame keeps the
//            height it had with data: a start that needs more rows scrolls
//            inside the frame, the page never jumps. Only what a person
//            asks for (range, Live, Zoom) lays the lanes out again.
//            `data-kp-gantt-ghosts="2 3 2 1 1"` sets the rows of the
//            loading lanes, so loading and loaded are as tall
//   loading  the data table's own loading card (js/busy-card.js: the
//            theme's spinner and "Reading the history") stands centred
//            over the lanes, the toolbar, axis and lane names beside it;
//            the runs are drawn once it has left
//   chip     the selected range takes the toolbar row over (the range
//            buttons and Live are inert under it): it lies on no lane and
//            adds no height when it comes, at any width
//   keys     one tab stop: ← → move along a lane, ↑ ↓ to the nearest bar
//            of the neighbouring lane, Home and End to the lane's first and
//            last, Enter or Space opens; the range, Live, Zoom and Clear
//            are buttons
//   hover    the run's name, times, length and state in the page's one hover
//            card (js/hovercard.js), refreshed while a run grows
//   days     opt-in, `data-kp-gantt-days` [kpadopt3]: every day named on the
//            axis is a button (one tab stop, ← → Home End between them) that
//            selects that whole day, 00:00 to 00:00 in the zone, as a brush
//            would: the band, the chip with Zoom and Clear, and
//            `kp-gantt-select` with `source: 'day'` and `day` so the page can
//            jump to it. It is `aria-pressed` while that day is the selection;
//            pressed again it lifts it. A window too short to hold a midnight
//            names no day and has no button
//   series   opt-in [kpadopt3]: a run's `series` (1 to 5) inks a finished
//            run in `--chart-1` … `--chart-5` instead of the success colour,
//            a category (a nightly round, a kind of job); failed, running and
//            queued keep their own look, so the state still reads first.
//            setGanttLegend(el, [{ series, label }]) names the series after
//            the states in the legend
//   points   opt-in [kpadopt4]: setGanttPoints(el, points) puts moments, not
//            runs, in the lanes (applied, a call, a mail, a planned follow-up),
//            each a small mark in the colour and shape of its kind;
//            setGanttKinds(el, kinds) names the kinds in the legend (shape
//            `dot`, `diamond`, `square`, `triangle`, `ring`; a `series` 1 to
//            5 or a `tone`). A `planned` point is hollow. Marks closer than
//            the eye can tell apart become one mark with a count (`+2`) whose
//            card names them all. setGanttZones(el, zones) lays stretches
//            under them: a lane's own (`lane`, a thin band: waiting since the
//            last contact) or the whole plot's (a band: the follow-up is due).
//            A lane with `href` is a link; `sub` is a second line under its
//            label. The range word `all` fits the window to everything on the
//            timeline and now, and stays fitted as the data changes. The axis
//            steps go up to four weeks, a week starting on Monday
//   chrome   [gaps-time-1019] options read again when the attribute changes (js/live-options.js):
//            `data-kp-gantt-toolbar="off"` leaves out the range buttons and Live (and the brush that selects a range: the
//            timeline is read, not searched; the window is still `data-kp-gantt-range`'s or the page's own setGanttWindow);
//            `data-kp-gantt-legend="off"` leaves out the legend of the states (the page's own series, kinds and stretches stay,
//            and a legend left with nothing is not drawn); `data-kp-gantt-hint="off"` leaves out the line under the timeline
//   legend   [wish-1028, Kitchen 1] `data-kp-gantt-legend` also takes `auto` (only the states the runs use: a plan of done, now and
//            still to do names three) or a list (`"ok running planned"`, spaces or commas; ok, failed, running, queued, planned);
//            `all` (the default) names every state as before. Read again when it changes
//   rest     [wish-1028, Kitchen 2] a running run with a `plannedEnd` draws the time it still has after now: a planned-look stretch from
//            now to `plannedEnd` that shrinks as the clock runs (gone once now is past it), and a live window reaches far enough
//            after now to hold it (at most 40% of the range). `data-kp-gantt-rest="off"` leaves it out
//   scroll   [wish-1028, Kitchen 3] a timeline narrower than 32rem keeps its plot a readable width and scrolls sideways inside its own
//            frame instead of squeezing the lanes; the lane names stay in view and a live window opens at its right end. The width is
//            `--kp-gantt-min-width` (30rem; 0 turns it off); `data-kp-gantt-scroll="off"` never scrolls, `"always"` keeps the minimum
//            at every width. A mouse still brushes a range; a finger pans
//   line     `.kp-gantt--line` [kpadopt4]: one lane and no toolbar, no lane
//            names and no brush, fitted to its data: the dated line under a
//            journey stepper
//
// Events (bubbling, on the timeline):
//   kp-gantt-open     { id, run, source: 'pointer' | 'keyboard' }  a bar was opened;
//                     { id, point, points, source } for a point (points: every point of a mark with a count)
//   kp-gantt-select   { from, to, source: 'brush' | 'day' | 'clear', day? } | detail null-ish ({ from: null, to: null }) when lifted; epoch ms
//   kp-gantt-window   { from, to, span, live }                  the window moved (a range button, Zoom, Live); epoch ms
//
// A screen reader hears a run change state ("Backup: failed") in a polite
// status region. The words are the dictionary's (`gantt…` in js/strings.js).
// Nothing runs on import; attachGantts(root) returns a detach. `decorate`
// marks every control the timeline builds (`bar`, `live`, `zoom`, `clear`).

export { GANTT, GANTT_OPEN_EVENT, GANTT_SELECT_EVENT, GANTT_WINDOW_EVENT, GANTT_TICK_MS, GANTT_RETRY_EVENT, GANTT_STEPS } from './gantt/constants.js';
export { rangeSeconds, axisStep, packRows } from './gantt/scale.js';
export { attachGantts } from './gantt/attach.js';
export {
    setGanttRuns,
    setGanttState,
    setGanttWindow,
    setGanttSelection,
    setGanttLegend,
    setGanttPoints,
    setGanttKinds,
    setGanttZones,
} from './gantt/api.js';

/** @typedef {import('./gantt/constants.js').GanttRunState} GanttRunState */
/** @typedef {import('./gantt/constants.js').GanttRun} GanttRun */
/** @typedef {import('./gantt/constants.js').GanttLane} GanttLane */
/** @typedef {import('./gantt/constants.js').GanttPoint} GanttPoint */
/** @typedef {import('./gantt/constants.js').GanttShape} GanttShape */
/** @typedef {import('./gantt/constants.js').GanttKind} GanttKind */
/** @typedef {import('./gantt/constants.js').GanttZone} GanttZone */
/** @typedef {import('./gantt/constants.js').GanttLegendEntry} GanttLegendEntry */
/** @typedef {import('./gantt/constants.js').GanttState} GanttState */
/** @typedef {import('./gantt/constants.js').Strings} Strings */
/** @typedef {import('./gantt/constants.js').GanttDecorateInfo} GanttDecorateInfo */
/** @typedef {import('./gantt/constants.js').GanttOptions} GanttOptions */
/** @typedef {import('./gantt/constants.js').GanttBar} GanttBar */
/** @typedef {import('./gantt/constants.js').GanttLaneModel} GanttLaneModel */
/** @typedef {import('./gantt/constants.js').GanttModel} GanttModel */
