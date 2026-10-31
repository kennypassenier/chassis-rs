// A dialog that leaves the way it came, and boxes that ease to a new size
// instead of jumping, growing and shrinking alike [scope-142].
//
// Kenny, 2026-10-04, approving the formal demo (research/size-motion): "het
// openen van een dialog heeft al bepaalde snelheden per thema, baseer je op
// die snelheden om te weten hoe snel je kan sluiten/uitbreiden/krimpen. Maak
// direct alle componenten voor elk thema". So nothing here carries a speed
// of its own: every duration and curve is read from the theme's dialog
// entrance, the one motion every register already decided.
//
//   - Close: the dialog plays its own entrance backwards, in two thirds of
//     the entrance's time (formal: 300 ms in, 200 ms out). The curve is the
//     entrance's own, run in reverse, so an entrance that eases out leaves
//     easing in, and a stepped one leaves in steps.
//   - Size: a box eases from its old height to its new one in four fifths of
//     the entrance's time on the entrance's curve (formal: 240 ms).
//   - Both are capped (`--kp-close-max`, 600 ms; `--kp-size-max`, 480 ms),
//     because light's and dark's entrances run over two seconds and a close
//     or a row that takes that long is in the reader's way. `--kp-motion-scale`
//     on the root plays all of it slower or faster at once.
//   - A theme with no entrance (or a reader who asked for reduced motion)
//     gets none: the dialog closes and the box takes its size at once.
//   - A register that declares `--kp-open: reverse-close` (every register
//     since 2026-10-05; Kenny's pick on research/open-reverse for formal,
//     cyberpunk and titanium, then "showing should also be the reverse of
//     removing" for all) opens as it closes, turned around: the dialog
//     plays its entrance forwards in the close's time, and what arrives in
//     an eased box plays the theme's leave backwards, so frame t of the
//     opening is frame (T - t) of the close. Several that arrive at once
//     come one by one, the highest first: the row of leaves, mirrored.
//
// What moves: every `.kp-dialog` (closing, and growing or shrinking while
// open), the accordion's items, tabs, the data table, the toast stack, the
// upload list, the combobox list, the tree, the wizard, a field whose error
// comes and goes, and any element marked `data-kp-size-motion`. Boxes that
// appear later (a framework's render) are picked up as they arrive.

export { SIZE_ATTRIBUTE, SIZE_SELECTOR, FOLD_SELECTOR, ARRIVE_KEYS, motionWatchCount } from './motion/constants.js';
export { registerTime, themeMotion } from './motion/timing.js';
export { withCustomProperties, turnLines, turnEntrances } from './motion/keyframes.js';
export { closeDialog } from './motion/close.js';
export { REVERSING_ATTRIBUTE, playEntranceBackwards, stopReversing } from './motion/reverse.js';
export { CLOSING_ATTRIBUTE, PANEL_SELECTOR, playClose, stopClose } from './motion/panel-close.js';
export { withoutOvershoot, reversedEase, sizeMotion } from './motion/size.js';
export { arriveShown, GROUP_FOLDING_ATTRIBUTE, glideGroup, playArrivalBackwards } from './motion/arrive.js';
export { leavesState, leave, repaintedIn } from './motion/leave.js';
export { FOLDING_OUT } from './motion/fold-size.js';
export { easeSize } from './motion/box-size.js';
export { attachMotion } from './motion/attach.js';

/** @typedef {import('./motion/keyframes.js').Entrance} Entrance */
/** @typedef {import('./motion/keyframes.js').Line} Line */
/** @typedef {import('./motion/turns.js').Arriving} Arriving */
/** @typedef {import('./motion/leave.js').Leaving} Leaving */
/** @typedef {import('./motion/leave.js').RepaintNode} RepaintNode */
/** @typedef {import('./motion/fold-size.js').SizeOptions} SizeOptions */
