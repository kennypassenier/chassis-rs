// An open overlay above the containers it sits in [2026-09-13].
//
// Four registers draw the silhouette of a container with `clip-path` — the
// cut corners of a card, an alert, a popover, a dialog or a spec sheet in
// dark, cyberpunk, phantom and titanium — and a clip cuts away everything
// inside the box, an open list or calendar included. Measured on
// 2026-09-13 inside a `.kp-card` in those four themes: every day of a date
// picker's calendar (31 of 31) and every option of a combobox and of a
// drawn select (5 of 5; 4 of 5 for phantom's combobox) out of reach, the
// clipped area handing the click to whatever lay beneath. `overflow:
// hidden` on an ancestor does the same. No z-index escapes either; the top
// layer does.
//
// So an overlay the package opens becomes a manual popover for as long as
// it is open. It stays where it is in the document — the child of its
// control, so it inherits the theme, still matches every register
// selector, and focus and `focusout` behave as before — and is placed in
// window coordinates by its component, again whenever anything scrolls or
// the window changes size. A browser without the popover API keeps the
// overlay where it always hung.

// The module is a facade [closure-pattern B, Kenny 2026-10-30]: the layout rectangle (rect.js), the side an overlay opens on (side.js)
// and the raise itself (an OverlayRaise controller per raised overlay, raise.js) live in js/top-layer/, listed in js/README.md.

export { layoutRect } from './top-layer/rect.js';
export { placeBlockSide } from './top-layer/side.js';
export { raiseOverlay, raiseInPlace, raised } from './top-layer/raise.js';
