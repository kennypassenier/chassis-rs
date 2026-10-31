// A link as a QR code a phone can scan [kpadopt6; kp-soft's invitations, chassis-rs pairing].
//
//   <div class="kp-qr" data-kp-qr data-kp-qr-value="https://kp-soft.dev/invite/7Hq2"></div>
//
//   setQr(el, { value: 'https://…' });                   // or write data-kp-qr-value
//   setQr(el, { state: 'loading' });                     // the link is being made
//
// The page, not a service, draws it: the link never leaves the device. The encoder is Project Nayuki's MIT library,
// vendored in js/vendor/qr-encode.js; this module chooses the level and the size, draws an SVG (or a canvas) and holds
// the words and the states around it.
//
// What it shows: the code on a plate that stays light in every theme and in dark mode (dark modules on light is read by
// every camera, inverted by only some; this is the one deliberate exception to theming, and the quiet zone of 4 modules
// is part of the plate), the link as text under it that wraps at any character, a Copy button that shows its result
// without changing width (js/flash.js), and optionally Download. The code is `role="img"` named by `data-kp-qr-label`
// and described by the link; Shift+C on it copies.
//
// Options (attributes, each also a key of `setQr`):
//   data-kp-qr-value      the text to encode
//   data-kp-qr-ecc        `L`, `M` (default), `Q`, `H`
//   data-kp-qr-size       a CSS length (default 12rem); `lg` is 16rem
//   data-kp-qr-quiet      the quiet zone in modules (default 4)
//   data-kp-qr-look       `plate` (default) or `theme` (the theme's ink on its surface, only with a contrast of 7:1, else `plate`)
//   data-kp-qr-modules    `square` (default) or `round` (the three finder patterns stay square so it scans)
//   data-kp-qr-render     `svg` (default) or `canvas`
//   data-kp-qr-caption    `link` (default), `none`, or the words to show instead
//   data-kp-qr-copy       on; `false` hides Copy
//   data-kp-qr-download   `false` (default), `png` (4 times the display size) or `svg`
//   data-kp-qr-reveal     `shown` (default) or `click` (hidden behind "Show QR code")
//   data-kp-qr-expires    an ISO moment; after it the code is withdrawn, not covered
//   data-kp-qr-label      the code's accessible name
//   data-kp-qr-max        bytes above which a warning shows (default 512)
//   data-kp-qr-narrow     `code` (default) or `link` (the link and Copy first on a narrow screen)
//   data-kp-qr-retry      present: a code that could not be made offers Retry (`kp-qr-retry`) for an app that can give another link;
//                         adding or taking it away draws the code again, like every option here
//
// Events (bubbling, on the root): `kp-qr-copy` `{ value }`, `kp-qr-reveal` `{ shown }`, `kp-qr-expired`, `kp-qr-retry`.
// Every word is in js/strings.js; nothing runs on import.
//
// Each wired code is one QrControl controller (js/qr/controller.js, on js/controller.js); the per-code state stays in a
// registry (js/qr/state.js), so setQr() works before wiring. The parts are listed in js/README.md.

import { attachAll } from './controller.js';
import { QrControl } from './qr/controller.js';
import { QR } from './qr/state.js';

export { QR, QR_COPY_EVENT, QR_REVEAL_EVENT, QR_EXPIRED_EVENT, QR_RETRY_EVENT, QR_FOLD, QR_LEVELS, QR_PLATE } from './qr/state.js';
export { qrMatrix, qrContrast } from './qr/matrix.js';
export { setQr, qrSvg } from './qr/actions.js';

/**
 * @typedef {object} QrSpec
 * @property {string} [value]
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state]
 * @property {string} [message]  the failed plate's sentence
 */

/**
 * Wire every QR code under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachQr(root = document) {
    return attachAll(root, QR, QrControl);
}
