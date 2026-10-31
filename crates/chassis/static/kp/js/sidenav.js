// The side navigation [feat-nav-3].
//
// Built to the feature list Kenny pointed at — MDBootstrap's sidenav, read
// on 2026-09-11 — translated into this package's conventions rather than
// copied: every option is a `data-kp-sidenav-*` attribute, so a page that
// never loads a module still gets a navigation, and the module only adds
// what markup cannot express.
//
// What the module owns, and CSS does not:
//
//   · the offset a `side` or `push` mode puts on a content element this
//     component does not own — CSS cannot reach across to a selector the
//     consumer named;
//   · the focus trap and the focus return, which are keyboard facts;
//   · the scroll lock;
//   · the backdrop element, so a consumer can put a class on it;
//   · remembering, when the page asks for it by naming a key.
//
// Every state has a named way out [KT6]: the toggler, Escape, the
// backdrop, the `kp-sidenav-*` events, the handle `sidenavOf()` returns,
// and the detach.
//
// A panel at the window's edge, with its launcher [Kenny, 2026-10-13,
// translated: a static button at the very top left of the page, the panel all
// the way out of the left side of the screen, three variants chosen by
// attribute]. Three ways for such a panel to meet the page, each one
// attribute on the panel:
//
//   · `data-kp-sidenav-mode="push"` with `data-kp-sidenav-content`: opening
//     slides the panel in from the edge and pushes the content over by the
//     panel's width; the push moves on the panel's own time and curve,
//     copied off the panel each time it changes, so the content travels
//     with whatever the theme's slide is and comes back as it reversed;
//   · the same plus `data-kp-sidenav-reserve`: the content keeps the
//     panel's room whether the panel is open or not (a gutter), so the
//     panel opens into empty space and covers nothing;
//   · `data-kp-sidenav-mode="over"` with `data-kp-sidenav-backdrop="false"`:
//     the panel slides over the content, nothing dims.
//
// A peek strip [Kenny, 2026-10-14, from the libraries survey]: with
// `--kp-sidenav-peek` set to a length (0.75rem) on the panel or above it, a
// thin strip of the panel stays at the window's edge, and the panel's
// `.kp-sidenav__peek` element (made here, aria-hidden, drawn in the theme's
// muted ground and strong edge) shows it. A theme's own opening and closing run
// where the panel stands, so the strip is a part of its own: it is there
// whenever the panel is not fully open, under the panel, and nothing in
// the theme's effect is changed. A push panel keeps the strip's room in the
// content while it is shut; an `over` panel's strip is the one part that
// lies over the page. A panel in the floating variant hides it while open.
//
// The launcher is a `.kp-sidenav__launcher` box holding the toggler (a
// `.kp-icon-button` with `data-kp-sidenav-toggle`): fixed at the window's
// start corner, always in the same place, above the panel. The module
// marks the panel it drives `data-kp-sidenav-launched`, which starts the
// panel's header beside the launcher (or the panel's first row below it),
// so the launcher never covers an item; it draws the package's three bars
// in an empty toggler; and it lights the launcher
// (`data-kp-sidenav-lit`) from the first frame of the opening to the last
// frame of the closing, so the launcher's change is the opening's and is
// played back with the close. An element of the page that shares the
// launcher's corner (the page header) carries
// `data-kp-sidenav-launcher-room` and keeps the launcher's width free.
//
// Four opt-in behaviours [Kenny, 2026-10-13, the ten minor options from the
// libraries survey; the first four]. None changes a panel that does not ask:
//
//   · `data-kp-sidenav-cancelable`: `kp-sidenav-toggle` and `kp-sidenav-slim`
//     fire before the change, cancelable, and carry `detail.reason`
//     (`toggler`, `escape`, `backdrop`, `shortcut`, `api`; a layout's own
//     `breakpoint`, `mode` and `init` are told, never asked). A prevented
//     event leaves the state untouched and fires `kp-sidenav-prevented`
//     (`detail`: `kind`, the state asked for, `reason`, `source`);
//   · `data-kp-sidenav-resizable` with `-min-width` and `-max-width`: a
//     `role="separator"` handle on the edge that faces the content, inside
//     the panel, moved by pointer and by arrow keys, writing
//     `--kp-sidenav-width` and kept when the panel remembers;
//   · `data-kp-sidenav-backdrop="static"`: the backdrop shows and a click
//     does not close; the panel is pulled back and let go (the theme's own
//     time and curve) and `kp-sidenav-prevented` fires with `source: 'static'`;
//   · `data-kp-sidenav-close-on-backdrop="false"`: a click on the backdrop
//     does nothing, silently, as `close-on-esc="false"` does for Escape.
//
// The last two only matter where a backdrop exists (an `over` panel that did
// not turn it off); the package's default stays no scrim where the page
// says so.

export {
    SIDENAV_TOGGLE_EVENT,
    SIDENAV_SLIM_EVENT,
    SIDENAV_MODE_EVENT,
    SIDENAV_PREVENTED_EVENT,
    SIDENAV_OWNED,
    SIDENAV_RESIZER,
    SIDENAV_TAB,
    SIDENAV_LAUNCHER,
} from './sidenav/constants.js';
export { OPTIONS } from './sidenav/options.js';
export { parseChord, sidenavOf } from './sidenav/helpers.js';
export { attachSidenavs } from './sidenav/attach.js';

/** @typedef {import('./sidenav/helpers.js').Sidenav} Sidenav */
