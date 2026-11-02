// The selectors, attribute names, event and fixed numbers of the swipe row [parts-1102].

/** A list whose rows swipe: `data-kp-swipe` (`off` switches it off). */
export const SWIPE = '[data-kp-swipe]';
/** The action revealed at the row's start edge, swiping toward its end (right in a left-to-right page): `key:Words:tone`. */
export const START_ATTRIBUTE = 'data-kp-swipe-start';
/** The action revealed at the row's end edge, swiping toward its start: `key:Words:tone`. */
export const END_ATTRIBUTE = 'data-kp-swipe-end';
/** Which pointers swipe: `touch` (default) or `any` (a mouse and a pen too). */
export const POINTERS_ATTRIBUTE = 'data-kp-swipe-pointers';
/** On a row: this row does not swipe (a done row, say). */
export const ROW_OFF_ATTRIBUTE = 'data-kp-swipe-off';

/** Fired on the row, bubbling, when a swipe let go past the threshold: `{ key, action, row }`. */
export const SWIPE_EVENT = 'kp-swipe';

/** The parts of a row that keep their own press and drag. */
export const OWN_CONTROLS =
    'input, select, textarea, [contenteditable], [data-kp-handle], .kp-menu-button, .kp-icon-button, [data-kp-swipe-ignore]';
/** Sideways travel before a move is a swipe [px]. */
export const LOCK_PX = 12;
/** How much more sideways than up or down a move must run to lock as a swipe. */
export const LOCK_RATIO = 1.5;
/** The action runs past this share of the row's width, capped at THRESHOLD_MAX_PX. */
export const THRESHOLD_SHARE = 0.35;
/** The largest threshold [px]. */
export const THRESHOLD_MAX_PX = 140;
/** The tick a phone gives when the threshold is crossed [ms]. */
export const HAPTIC_MS = 10;
/** How long a lifted swipe swallows the click the browser sends after it [ms]. */
export const CLICK_GUARD_MS = 400;
/** The tones an action's plate may take. */
export const TONES = ['success', 'info', 'warning', 'destructive', 'primary'];

/** @typedef {{ key: string, label: string, tone: string }} SwipeAction */
