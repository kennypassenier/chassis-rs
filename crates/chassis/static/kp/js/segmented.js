// The segmented control and the filter chips [kpadopt-controls].
//
// One component, two looks: `.kp-segmented` is a track with a plate under the
// chosen segment, `.kp-segmented--chips` is the same buttons as separate
// pills. Both are a group of buttons that choose among values:
//
//   <div class="kp-segmented" data-kp-segmented="single" role="radiogroup" aria-label="Show">
//       <button type="button" class="kp-segmented__item" data-value="changed" role="radio" aria-checked="true">
//           <span class="kp-segmented__label">Changed</span><span class="kp-segmented__count">12</span>
//       </button>
//       <button type="button" class="kp-segmented__item" data-value="all" role="radio" aria-checked="false">
//           <span class="kp-segmented__label">All</span><span class="kp-segmented__count">48</span>
//       </button>
//   </div>
//
// `data-kp-segmented="single"` (the default) is one value on, as a radio
// group: arrows move the focus and choose, Home and End jump, one tab stop.
// `data-kp-segmented="multi"` is the plain-click toggle group: each press
// turns one value on or off with `aria-pressed`, several may be on, and none
// on means everything is shown. An item marked `data-kp-segmented-all` is the
// "All" item: pressed while nothing else is on, and pressing it turns the rest
// off. Turning every other value on is the same as none, so a multi group
// goes back to All (`data-kp-segmented-collapse="false"` keeps them on).
//
// The mode is an option that can change at runtime [live-options-1019]: set `data-kp-segmented` to `single`, `multi` or `tri`
// and the group is written the way the new mode reads it, the values that were on staying on (a single group keeps the first).
//
// Both modes use a roving tabindex: one tab stop in, arrows within. In multi
// the arrows only move the focus; Space and Enter turn the value.
//
// The markup above is what a page may write itself, with the roles and states
// in place so it is right before any script runs; whatever it leaves out the
// module fills in. In the single look the plate under the chosen segment
// glides to the next one: the module measures the segment and writes
// `--kp-seg-x` and `--kp-seg-w` on the group, and the theme decides how it
// moves (its own --fx-duration and --fx-ease).
//
// `data-kp-segmented="tri"` [kpadopt4] is the three-way filter: each chip
// stands for something that must be in, must not be in, or does not matter
// ("with chicken, without mushrooms"). A press turns it on (✓, the chip
// filled), a second press leaves it out (✕, the theme's destructive edge, the
// label struck through), a third lets it go; Delete or Backspace lets the
// focused chip go at once. The state is `data-kp-segmented-tri="include|exclude"` on the
// item (absent: either way), a mark that is always there and always the same
// size, so nothing moves, and a word a screen reader hears after the chip's
// name ("Chicken, required"); a status region says what a press changed. An
// item marked `data-kp-segmented-all` is Clear all here, dimmed while nothing
// is chosen. `data-kp-segmented-summary` on the group keeps one line after it:
// how to use it while nothing is chosen, what is chosen once something is.
// Use it with the chip look (`kp-segmented--chips`). A group whose three states
// mean something else than required / left out / either way names its own
// words, `data-kp-segmented-words='{"include":"had it","exclude":"not today",
// "any":"not answered"}'`: what a screen reader hears after a chip and what a
// press announces (the usual picker's Not today, js/usual-picker.js).
//
// Events (bubbling, on the group):
//   kp-segmented-change   { value: string | null, values: string[], item }
//                         `values` are the values on (empty = All); `value`
//                         is the one just pressed. A three-way group adds
//                         `include`, `exclude` (values) and `state`, the
//                         pressed chip's new state.
//
// States: `disabled` on an item, `aria-disabled="true"` on the group,
// `aria-busy="true"` on the group (the counts show a placeholder while their
// numbers load, so nothing moves when they arrive).
//
// Nothing runs on import; attachSegmented(root) returns a detach. While it is
// live, groups the page draws later under `root` are wired as they arrive,
// `data-kp-segmented-for` links included (js/segmented/root.js) [fix-1031].
//
// The module is a facade: a group is a `SegmentedGroup` and an attach is a `SegmentedRoot` (closure-pattern B, js/controller.js) in `js/segmented/`, one file per concern.

export {
    SEGMENTED,
    SEGMENTED_EVENT,
    SEGMENTED_ITEM,
    THUMB_ATTRIBUTE,
    GLIDE_ATTRIBUTE,
    TRI_ATTRIBUTE,
    TRI_STATES,
    OVERFLOW_ATTRIBUTE,
    MORE_ATTRIBUTE,
} from './segmented/constants.js';
export { itemsOf, valueOf, getSegmentedValues, getSegmentedTri } from './segmented/read.js';
export { layout } from './segmented/plate.js';
export { setSegmentedTri, setSegmentedValues, resetSegmented, setSegmentedCounts } from './segmented/api.js';
export { setSegmentedItems } from './segmented/items.js';
export { attachSegmented } from './segmented/root.js';

/** @typedef {import('./segmented/constants.js').SegmentedItem} SegmentedItem */
/** @typedef {import('./segmented/constants.js').TriValues} TriValues */
