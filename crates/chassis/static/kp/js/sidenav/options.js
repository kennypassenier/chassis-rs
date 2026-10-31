// The table of options the side navigation reads from its element.

/**
 * Every option, written out.
 *
 * Built by joining a prefix to a name at first, which worked and hid the
 * whole surface: no gate could enumerate the options, and the
 * documentation site's extractor found one attribute whose name was the
 * bare prefix. An option nobody can list is an option nobody can
 * document [AR21].
 */
export const OPTIONS = {
    mode: 'data-kp-sidenav-mode',
    position: 'data-kp-sidenav-position',
    side: 'data-kp-sidenav-side',
    open: 'data-kp-sidenav-open',
    slim: 'data-kp-sidenav-slim',
    slimCollapsed: 'data-kp-sidenav-slim-collapsed',
    expandOnHover: 'data-kp-sidenav-expand-on-hover',
    accordion: 'data-kp-sidenav-accordion',
    backdrop: 'data-kp-sidenav-backdrop',
    backdropClass: 'data-kp-sidenav-backdrop-class',
    closeOnEsc: 'data-kp-sidenav-close-on-esc',
    lockScroll: 'data-kp-sidenav-lock-scroll',
    focusTrap: 'data-kp-sidenav-focus-trap',
    content: 'data-kp-sidenav-content',
    /** The older spelling of `data-kp-remember`, still read [js/remember.js]. */
    remember: 'data-kp-sidenav-remember',
    toggle: 'data-kp-sidenav-toggle',
    slimToggle: 'data-kp-sidenav-slim-toggle',
    slimHide: 'data-kp-sidenav-slim-hide',
    slimShow: 'data-kp-sidenav-slim-show',
    expanded: 'data-kp-sidenav-expanded',
    overBelow: 'data-kp-sidenav-over-below',
    narrow: 'data-kp-sidenav-narrow',
    /**
     * On the panel: the content named by `data-kp-sidenav-content` keeps the
     * panel's width whether it is open or not (push and over modes) — the
     * gutter the panel opens into. Default off.
     */
    reserve: 'data-kp-sidenav-reserve',
    /**
     * On the panel: which opener the page shows, `launcher` (the fixed
     * `.kp-sidenav__launcher`), `tab` (the `.kp-sidenav__tab` on the edge) or
     * `both`. Absent (or any other value): `tab`, the default [Kenny, 2026-10-14];
     * a page with no `.kp-sidenav__tab` for the panel keeps its launcher.
     * Applies to `over` and `push`; `side` and the collapsed rail ignore it.
     */
    opener: 'data-kp-sidenav-opener',
    /** Written on an opener box (launcher or tab) the choice turns off; the box is not drawn. */
    openerOff: 'data-kp-sidenav-opener-off',
    /** Written on an opener box the choice keeps, once the module has decided (the first paint hides the others by the markup alone). */
    openerOn: 'data-kp-sidenav-opener-on',
    /** Written on the panel while a `.kp-sidenav__launcher` drives it. */
    launched: 'data-kp-sidenav-launched',
    /** Written on the launcher box from the opening's first frame to the closing's last. */
    lit: 'data-kp-sidenav-lit',
    /** On a page element in the launcher's corner: keeps the launcher's width free at its start. */
    launcherRoom: 'data-kp-sidenav-launcher-room',
    /**
     * On the panel: a closed panel is `inert` (out of the tab order and the
     * accessibility tree) from the closing's last frame to the opening's
     * first. Default on; `"false"` leaves a closed panel reachable.
     */
    inert: 'data-kp-sidenav-inert',
    /**
     * On the panel: in the collapsed rail each item shows its label as the
     * package's tooltip on hover and on focus. Default on; `"false"` turns it off.
     */
    railTips: 'data-kp-sidenav-rail-tips',
    /**
     * On a panel with `data-kp-sidenav-slim`: the width of the panel's box at
     * and below which the rail collapses to its icons, a length, or the
     * package's 40rem when empty; wider again it is what the reader left it.
     * `data-kp-sidenav-over-below` is its sibling for the variant: below its
     * length the panel becomes an `over` panel.
     */
    slimBelow: 'data-kp-sidenav-slim-below',
    /**
     * On the panel: in the collapsed rail a group's submenu opens as a
     * floating panel beside the rail, on hover (with intent) and from the
     * keyboard, with the theme's popover effect. Default on; `"false"` keeps
     * groups folding in place.
     */
    flyout: 'data-kp-sidenav-flyout',
    /** Written on a `.kp-sidenav__category` while its submenu floats beside the rail. */
    flown: 'data-kp-sidenav-flown',
    /**
     * On the panel: a key chord that toggles it from anywhere but a text
     * field, e.g. `Control+b`. `Control` means Meta (⌘) on a Mac; `Mod` is
     * the same thing spelled for both. Off by default.
     */
    shortcut: 'data-kp-sidenav-shortcut',
    /**
     * On the panel: a selector, inside the panel, for where the focus lands
     * when the panel opens. Default: the first focusable element, and only
     * for an `over` panel; named, it is used in every mode.
     */
    initialFocus: 'data-kp-sidenav-initial-focus',
    /**
     * On a rail with `data-kp-sidenav-expand-on-hover`: how long the pointer
     * rests before the rail expands, in milliseconds. Default 150. The rail
     * also expands while the focus is inside it.
     */
    hoverDelay: 'data-kp-sidenav-hover-delay',
    /** Written on the rail while it is expanded by the pointer or the focus. */
    peek: 'data-kp-sidenav-peek',
    /**
     * On the panel: `kp-sidenav-toggle` and `kp-sidenav-slim` fire BEFORE the
     * change, cancelable, with `detail.reason`; `preventDefault()` leaves the
     * state untouched and `kp-sidenav-prevented` fires. Off by default: the
     * events then fire after the change, as they always did, now with
     * `detail.reason` as well.
     */
    cancelable: 'data-kp-sidenav-cancelable',
    /**
     * On the panel: `"false"` makes a click on the backdrop do nothing, the
     * sibling of `data-kp-sidenav-close-on-esc`. Only a panel that has a
     * backdrop is concerned. Default on.
     */
    closeOnBackdrop: 'data-kp-sidenav-close-on-backdrop',
    /** Written on the panel and its backdrop while the refused cue plays (a static backdrop was clicked). */
    refused: 'data-kp-sidenav-refused',
    /**
     * On the panel: a grab handle on the edge that faces the content makes the
     * width the reader's to change; it writes `--kp-sidenav-width` and, with
     * `remember`, keeps it. Off by default; `"false"` is off.
     */
    resizable: 'data-kp-sidenav-resizable',
    /** On a resizable panel: the narrowest width the handle allows, a length. Default 12rem. */
    minWidth: 'data-kp-sidenav-min-width',
    /** On a resizable panel: the widest width the handle allows, a length. Default 32rem. */
    maxWidth: 'data-kp-sidenav-max-width',
    /** Written on the panel while the handle is held. */
    resizing: 'data-kp-sidenav-resizing',
    /**
     * On the panel: its look. Without it the panel is the flush column it
     * always was. `"floating"` detaches the panel from the window's edge: a
     * gap all round, the theme's radius, an edge on every side and a shadow
     * made of the theme's own tokens. Knobs: `--kp-sidenav-float-inset` (the
     * gap, `--kp-space-sm`), `--kp-sidenav-float-radius` (`--radius`),
     * `--kp-sidenav-float-edge` (`1px solid --border-strong`),
     * `--kp-sidenav-float-shadow`. `"inset"` keeps the panel flush with the
     * window and makes the content (the element `data-kp-sidenav-content`
     * names) a rounded card beside it, on the page's ground. Knobs:
     * `--kp-sidenav-inset-gap` (the card's margin, `--kp-space-sm`),
     * `--kp-sidenav-inset-radius` (`--radius`), `--kp-sidenav-inset-edge`
     * (`1px solid --border-strong`). Both keep the slide, the push, the
     * gutter and the over mode working: the push and the gutter leave the
     * room the variant takes, and the edge tab rides on the panel's edge.
     */
    variant: 'data-kp-sidenav-variant',
    /**
     * Written on the content element while the panel is the `inset` variant:
     * the edge the panel comes from, `start` or `end`. The content is a
     * rounded card while it is there.
     */
    inset: 'data-kp-sidenav-inset',
    /**
     * On the panel: `"compact"` or `"comfortable"` sets the tokens that make
     * a row's height and the panel's padding (`--kp-sidenav-link-padding-block`,
     * `-link-size`, `-icon-size`, `-pad`); without it, or with `"default"`,
     * the panel is what it always was. CSS only; the module does not read it.
     */
    density: 'data-kp-sidenav-density',
};
