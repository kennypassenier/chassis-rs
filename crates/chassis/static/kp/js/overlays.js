// The overlays' behaviour, framework-free [L8, TH35].
//
// Most of what is hard here, the browser now does. AR15's baseline is
// modern Chrome and Firefox only, which is what makes that affordable:
//
//   <dialog>          traps focus, closes on Escape, and returns focus to
//                     whatever opened it — all three, for free
//   popover="auto"    light-dismisses, closes on Escape, and restores
//                     focus to the invoker
//   <details>         is a keyboard-operable disclosure
//
// So this file is small on purpose. What it adds is the wiring the
// platform leaves to the author — opening a dialog from a button, roving
// tabindex on a tab list, and a toast region that announces itself — and
// nothing it adds re-implements something the browser already does
// correctly, because a hand-written focus trap is how focus traps break.
//
// Since 3.0.0 [KT6]: every attach is idempotent (the first version of
// this file double-bound on a second call, alone among the modules),
// every state change dispatches an event with a detail, every behaviour
// a consumer might not want is an option or a data-attribute, the tab
// selection is readable and settable from outside, and detach puts back
// what attach changed.

export {
    TOAST_MS,
    DIALOG_OPEN_EVENT,
    TAB_CHANGE_EVENT,
    TOAST_LINGER_MS,
    TOAST_SHOW_EVENT,
    TOAST_HIDE_EVENT,
    TOAST_PAUSE_EVENT,
    TABS_OVERFLOW,
    ALERT_DISMISS_EVENT,
    DISMISS_OWNED,
    TOOLTIP_EVENT,
    TOOLTIP_OWNED,
    SCROLL_OVERFLOW,
    SCROLL_BOXES,
} from './overlays/constants.js';
export { openAtTop, attachDialogs, closeLabel } from './overlays/dialogs.js';
export { selectTab, attachTabs } from './overlays/tabs.js';
export { revealTab, watchTabOverflow } from './overlays/tab-row.js';
export { toastRegion, toast } from './overlays/toast.js';
export { attachDismissals, showAlertAgain } from './overlays/dismissals.js';
export { attachTooltips } from './overlays/tooltips.js';
export { watchScrollbar, attachScrollbars } from './overlays/scrollbars.js';
