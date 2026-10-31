// The event names, selectors and timings of dialogs, tabs, toasts, dismissals, tooltips and scroll boxes.

/** How long a toast stays before it removes itself. An operational knob; per toast as `ms`. */
export const TOAST_MS = 5000;

/** Dispatched on the dialog, bubbling, when a wired trigger opened it: `{ trigger, modal }`. */
export const DIALOG_OPEN_EVENT = 'kp-dialog-open';
/** Dispatched on a tab list, bubbling, when the selected tab changed: `{ index, tab, panel, previous }`. */
export const TAB_CHANGE_EVENT = 'kp-tab-change';
/**
 * How long a toast that was hovered or focused stays after the pointer and
 * the focus have left it, so the eye that was on it can finish reading. An
 * operational knob; per toast as `linger`.
 */
export const TOAST_LINGER_MS = 2000;
/** Dispatched on the toast region when a toast was shown / removed: `{ toast, text }`. */
export const TOAST_SHOW_EVENT = 'kp-toast-show';
export const TOAST_HIDE_EVENT = 'kp-toast-hide';
/** Dispatched on the toast region, bubbling, when a toast's clock stopped or started again because the pointer or focus came or went: `{ toast, paused }`. */
export const TOAST_PAUSE_EVENT = 'kp-toast-pause';

/** Written on a tab row while its tabs do not fit, which is what makes it scroll [gap-12]. */
export const TABS_OVERFLOW = 'data-kp-tabs-overflow';

/** Dispatched on an alert, bubbling and cancelable, before its close button hides it: `{ alert, button }`. */
export const ALERT_DISMISS_EVENT = 'kp-alert-dismiss';
/** Close buttons another channel wires itself; the React Alert and Toasts mark theirs [AR29]. */
export const DISMISS_OWNED = '[data-kp-dismiss-owner]';

/** Dispatched on a tooltip anchor, bubbling, when its tooltip opens or closes: `{ open, tooltip }`. */
export const TOOLTIP_EVENT = 'kp-tooltip';
/** Tooltip anchors another channel wires itself; the React Tooltip marks its own [AR29]. */
export const TOOLTIP_OWNED = '[data-kp-tooltip-owner]';

/** Written on an overlay's scroll box while its content is taller than the box. */
export const SCROLL_OVERFLOW = 'data-kp-popover-overflowing';
/** The boxes `attachScrollbars` watches: the popover (a menu, a tooltip), a dialog, a dialog's body. */
export const SCROLL_BOXES = '.kp-popover, .kp-dialog, .kp-dialog__body';
