//! Static assets (K15): the vendored @kp-soft/themes tree — the release's
//! own bundle `dist/kp-themes.css` (themes, components, layout, utilities
//! and every theme register, each scoped to its theme), the fonts
//! stylesheet and the woff2 files behind it (S8: nothing loads from a third
//! party), seventeen JavaScript modules (since kp-themes 7.0.0 the effect
//! hooks are separate files `js/effects.js` imports on demand, with
//! `js/as-of.js` beside them) — plus the kit's own CSS/JS,
//! embedded with `include_bytes!` and served under a content-hash query so
//! browsers may cache them for a year.
//!
//! The vendored files are byte-for-byte copies of the kp-themes release
//! named in `static/kp/KP_THEMES.sha256`, kept under the package's own
//! paths (`kp/dist/…`, `kp/css/…`, `kp/js/…`, `kp/fonts/…`) so
//! `fonts.css`'s relative `url('../fonts/…')` and the modules'
//! `./strings.js` imports resolve unchanged. A test below compares every copy against that manifest, so
//! a stray edit or a half-done bump fails the gates offline (kyu's rule).
//! Bumping kp-themes = re-copy the tree, refresh the manifest, run the
//! tests.

use axum::extract::{Path, RawQuery};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};

/// The kp-themes version the kit vendors (C3: one place).
pub const KP_THEMES_VERSION: &str = "11.1.1";

/// name → (content type, bytes). Explicit list, no path joining (kyu's
/// traversal-proof shape).
pub const ASSETS: &[(&str, &str, &[u8])] = &[
    (
        "kp/dist/kp-themes.css",
        "text/css; charset=utf-8",
        include_bytes!("../../static/kp/dist/kp-themes.css"),
    ),
    (
        "kp/css/fonts.css",
        "text/css; charset=utf-8",
        include_bytes!("../../static/kp/css/fonts.css"),
    ),
    (
        "kp/js/no-flash.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/no-flash.js"),
    ),
    (
        "kp/js/theme-registry.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/theme-registry.js"),
    ),
    (
        "kp/js/theme-core.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/theme-core.js"),
    ),
    (
        "kp/js/theme-picker.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/theme-picker.js"),
    ),
    (
        "kp/js/strings.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/strings.js"),
    ),
    (
        "kp/js/components.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/components.js"),
    ),
    (
        "kp/js/effects.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/effects.js"),
    ),
    (
        "kp/js/as-of.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/as-of.js"),
    ),
    (
        "kp/js/effects/arrival.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/effects/arrival.js"),
    ),
    (
        "kp/js/effects/caret.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/effects/caret.js"),
    ),
    (
        "kp/js/effects/count.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/effects/count.js"),
    ),
    (
        "kp/js/effects/emphasis.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/effects/emphasis.js"),
    ),
    (
        "kp/js/effects/headline.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/effects/headline.js"),
    ),
    (
        "kp/js/effects/marquee.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/effects/marquee.js"),
    ),
    (
        "kp/js/effects/measure.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/effects/measure.js"),
    ),
    (
        "kp/js/effects/pointer.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/effects/pointer.js"),
    ),
    (
        "kp/js/effects/rule.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/effects/rule.js"),
    ),
    (
        "kp/fonts/archivo/archivo-italic-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/archivo/archivo-italic-variable.woff2"),
    ),
    (
        "kp/fonts/archivo/archivo-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/archivo/archivo-variable.woff2"),
    ),
    (
        "kp/fonts/archivoblack/archivoblack-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/archivoblack/archivoblack-regular.woff2"),
    ),
    (
        "kp/fonts/bevietnampro/bevietnampro-400.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/bevietnampro/bevietnampro-400.woff2"),
    ),
    (
        "kp/fonts/bevietnampro/bevietnampro-600.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/bevietnampro/bevietnampro-600.woff2"),
    ),
    (
        "kp/fonts/bevietnampro/bevietnampro-700.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/bevietnampro/bevietnampro-700.woff2"),
    ),
    (
        "kp/fonts/bevietnampro/bevietnampro-italic-400.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/bevietnampro/bevietnampro-italic-400.woff2"),
    ),
    (
        "kp/fonts/bigshouldersdisplay/bigshouldersdisplay-variable.woff2",
        "font/woff2",
        include_bytes!(
            "../../static/kp/fonts/bigshouldersdisplay/bigshouldersdisplay-variable.woff2"
        ),
    ),
    (
        "kp/fonts/fraunces/fraunces-italic-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/fraunces/fraunces-italic-variable.woff2"),
    ),
    (
        "kp/fonts/fraunces/fraunces-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/fraunces/fraunces-variable.woff2"),
    ),
    (
        "kp/fonts/geistmono/geistmono-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/geistmono/geistmono-variable.woff2"),
    ),
    (
        "kp/fonts/ibmplexmono/ibmplexmono-bold.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/ibmplexmono/ibmplexmono-bold.woff2"),
    ),
    (
        "kp/fonts/ibmplexmono/ibmplexmono-italic.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/ibmplexmono/ibmplexmono-italic.woff2"),
    ),
    (
        "kp/fonts/ibmplexmono/ibmplexmono-medium.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/ibmplexmono/ibmplexmono-medium.woff2"),
    ),
    (
        "kp/fonts/ibmplexmono/ibmplexmono-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/ibmplexmono/ibmplexmono-regular.woff2"),
    ),
    (
        "kp/fonts/instrumentsans/instrumentsans-italic-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/instrumentsans/instrumentsans-italic-variable.woff2"),
    ),
    (
        "kp/fonts/instrumentsans/instrumentsans-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/instrumentsans/instrumentsans-variable.woff2"),
    ),
    (
        "kp/fonts/instrumentserif/instrumentserif-italic.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/instrumentserif/instrumentserif-italic.woff2"),
    ),
    (
        "kp/fonts/instrumentserif/instrumentserif-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/instrumentserif/instrumentserif-regular.woff2"),
    ),
    (
        "kp/fonts/josefinsans/josefinsans-italic-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/josefinsans/josefinsans-italic-variable.woff2"),
    ),
    (
        "kp/fonts/josefinsans/josefinsans-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/josefinsans/josefinsans-variable.woff2"),
    ),
    (
        "kp/fonts/martianmono/martianmono-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/martianmono/martianmono-variable.woff2"),
    ),
    (
        "kp/fonts/michroma/michroma-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/michroma/michroma-regular.woff2"),
    ),
    (
        "kp/fonts/orbitron/orbitron-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/orbitron/orbitron-variable.woff2"),
    ),
    (
        "kp/fonts/poiretone/poiretone-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/poiretone/poiretone-regular.woff2"),
    ),
    (
        "kp/fonts/rajdhani/rajdhani-bold.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/rajdhani/rajdhani-bold.woff2"),
    ),
    (
        "kp/fonts/rajdhani/rajdhani-medium.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/rajdhani/rajdhani-medium.woff2"),
    ),
    (
        "kp/fonts/rajdhani/rajdhani-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/rajdhani/rajdhani-regular.woff2"),
    ),
    (
        "kp/fonts/rajdhani/rajdhani-semibold.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/rajdhani/rajdhani-semibold.woff2"),
    ),
    (
        "kp/fonts/sharetechmono/sharetechmono-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/sharetechmono/sharetechmono-regular.woff2"),
    ),
    (
        "kp/fonts/sora/sora-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/sora/sora-variable.woff2"),
    ),
    (
        "kp/fonts/spacegrotesk/spacegrotesk-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/spacegrotesk/spacegrotesk-variable.woff2"),
    ),
    (
        "kp/fonts/titilliumweb/titilliumweb-bold.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/titilliumweb/titilliumweb-bold.woff2"),
    ),
    (
        "kp/fonts/titilliumweb/titilliumweb-italic.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/titilliumweb/titilliumweb-italic.woff2"),
    ),
    (
        "kp/fonts/titilliumweb/titilliumweb-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/titilliumweb/titilliumweb-regular.woff2"),
    ),
    (
        "kp/fonts/titilliumweb/titilliumweb-semibold.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/titilliumweb/titilliumweb-semibold.woff2"),
    ),
    (
        "kp/fonts/vt323/vt323-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/vt323/vt323-regular.woff2"),
    ),
    (
        "chassis.css",
        "text/css; charset=utf-8",
        include_bytes!("../../static/chassis.css"),
    ),
    (
        "chassis.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/chassis.js"),
    ),
    (
        "passkeys.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/passkeys.js"),
    ),
    (
        "theme-boot.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/theme-boot.js"),
    ),
];

/// feat-webapp-1: the rest of kp-themes' framework-free modules (the wizard,
/// the data table, the palette, the date picker, …). Served by every build
/// that serves the kit's pages (`assets`, implied by `dashboard`) since 3.9.0:
/// a section or page a service adds under `dashboard` alone loaded a module
/// and got a 404 (kyu, gap 30), and the kit's own pages on kp-themes 11 use
/// them too. A service without pages (kyu-runner: `core` only) still carries
/// none of it.
#[cfg(feature = "assets")]
pub const WEBAPP_KP_ASSETS: &[(&str, &str, &[u8])] = &[
    (
        "kp/js/ack-gate.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/ack-gate.js"),
    ),
    (
        "kp/js/action-tiles.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/action-tiles.js"),
    ),
    (
        "kp/js/actions.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/actions.js"),
    ),
    (
        "kp/js/alarm.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/alarm.js"),
    ),
    (
        "kp/js/anchors.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/anchors.js"),
    ),
    (
        "kp/js/art.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/art.js"),
    ),
    (
        "kp/js/attention.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/attention.js"),
    ),
    (
        "kp/js/auto-refresh.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/auto-refresh.js"),
    ),
    (
        "kp/js/auto.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/auto.js"),
    ),
    (
        "kp/js/autosize.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/autosize.js"),
    ),
    (
        "kp/js/availability.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/availability.js"),
    ),
    (
        "kp/js/barcell.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/barcell.js"),
    ),
    (
        "kp/js/bullets.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/bullets.js"),
    ),
    (
        "kp/js/busy-card.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/busy-card.js"),
    ),
    (
        "kp/js/calendar.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/calendar.js"),
    ),
    (
        "kp/js/calm-tones.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/calm-tones.js"),
    ),
    (
        "kp/js/calm.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/calm.js"),
    ),
    (
        "kp/js/card-state.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/card-state.js"),
    ),
    (
        "kp/js/chart.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/chart.js"),
    ),
    (
        "kp/js/checklist.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/checklist.js"),
    ),
    (
        "kp/js/claim.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/claim.js"),
    ),
    (
        "kp/js/code.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/code.js"),
    ),
    (
        "kp/js/colorpicker.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/colorpicker.js"),
    ),
    (
        "kp/js/combobox.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/combobox.js"),
    ),
    (
        "kp/js/command.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/command.js"),
    ),
    (
        "kp/js/compare.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/compare.js"),
    ),
    (
        "kp/js/connection.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/connection.js"),
    ),
    (
        "kp/js/console.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/console.js"),
    ),
    (
        "kp/js/contrast.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/contrast.js"),
    ),
    (
        "kp/js/countdown.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/countdown.js"),
    ),
    (
        "kp/js/datatable.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/datatable.js"),
    ),
    (
        "kp/js/dated-options.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/dated-options.js"),
    ),
    (
        "kp/js/datepicker.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/datepicker.js"),
    ),
    (
        "kp/js/deplist.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/deplist.js"),
    ),
    (
        "kp/js/diagnostics.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/diagnostics.js"),
    ),
    (
        "kp/js/diff.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/diff.js"),
    ),
    (
        "kp/js/docpreview.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/docpreview.js"),
    ),
    (
        "kp/js/entity-card.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/entity-card.js"),
    ),
    (
        "kp/js/facets.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/facets.js"),
    ),
    (
        "kp/js/feed.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/feed.js"),
    ),
    (
        "kp/js/flash.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/flash.js"),
    ),
    (
        "kp/js/focus-steps.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/focus-steps.js"),
    ),
    (
        "kp/js/footprint.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/footprint.js"),
    ),
    (
        "kp/js/forms.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/forms.js"),
    ),
    (
        "kp/js/freshness.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/freshness.js"),
    ),
    (
        "kp/js/gallery.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/gallery.js"),
    ),
    (
        "kp/js/gantt.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/gantt.js"),
    ),
    (
        "kp/js/graph.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/graph.js"),
    ),
    (
        "kp/js/gridlayout.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/gridlayout.js"),
    ),
    (
        "kp/js/heat.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/heat.js"),
    ),
    (
        "kp/js/hovercard.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/hovercard.js"),
    ),
    (
        "kp/js/idmark.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/idmark.js"),
    ),
    (
        "kp/js/intent.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/intent.js"),
    ),
    (
        "kp/js/json-field.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/json-field.js"),
    ),
    (
        "kp/js/keys.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/keys.js"),
    ),
    (
        "kp/js/kpi.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/kpi.js"),
    ),
    (
        "kp/js/lazy-register.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/lazy-register.js"),
    ),
    (
        "kp/js/lede.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/lede.js"),
    ),
    (
        "kp/js/listbox.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/listbox.js"),
    ),
    (
        "kp/js/live-options.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/live-options.js"),
    ),
    (
        "kp/js/loading-pieces.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/loading-pieces.js"),
    ),
    (
        "kp/js/locale.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/locale.js"),
    ),
    (
        "kp/js/log.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/log.js"),
    ),
    (
        "kp/js/logviewer.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/logviewer.js"),
    ),
    (
        "kp/js/master-detail.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/master-detail.js"),
    ),
    (
        "kp/js/menu-button.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/menu-button.js"),
    ),
    (
        "kp/js/motion.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/motion.js"),
    ),
    (
        "kp/js/nav-fold.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/nav-fold.js"),
    ),
    (
        "kp/js/newpill.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/newpill.js"),
    ),
    (
        "kp/js/notices.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/notices.js"),
    ),
    (
        "kp/js/overlays.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/overlays.js"),
    ),
    (
        "kp/js/palette.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/palette.js"),
    ),
    (
        "kp/js/passkeys.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/passkeys.js"),
    ),
    (
        "kp/js/path-trace.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/path-trace.js"),
    ),
    (
        "kp/js/patterns.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/patterns.js"),
    ),
    (
        "kp/js/pipeline.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/pipeline.js"),
    ),
    (
        "kp/js/print.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/print.js"),
    ),
    (
        "kp/js/problems.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/problems.js"),
    ),
    (
        "kp/js/progressbar.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/progressbar.js"),
    ),
    (
        "kp/js/qr.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/qr.js"),
    ),
    (
        "kp/js/quantity.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/quantity.js"),
    ),
    (
        "kp/js/question-card.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/question-card.js"),
    ),
    (
        "kp/js/quote.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/quote.js"),
    ),
    (
        "kp/js/range.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/range.js"),
    ),
    (
        "kp/js/rating.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/rating.js"),
    ),
    (
        "kp/js/reason.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/reason.js"),
    ),
    (
        "kp/js/remember.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/remember.js"),
    ),
    (
        "kp/js/request-inspector.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/request-inspector.js"),
    ),
    (
        "kp/js/row-select.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/row-select.js"),
    ),
    (
        "kp/js/runs.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/runs.js"),
    ),
    (
        "kp/js/segmented.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/segmented.js"),
    ),
    (
        "kp/js/selection-bar.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/selection-bar.js"),
    ),
    (
        "kp/js/sentence.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/sentence.js"),
    ),
    (
        "kp/js/shortcuts.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/shortcuts.js"),
    ),
    (
        "kp/js/sidenav.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/sidenav.js"),
    ),
    (
        "kp/js/slider.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/slider.js"),
    ),
    (
        "kp/js/snooze.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/snooze.js"),
    ),
    (
        "kp/js/stackbar.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/stackbar.js"),
    ),
    (
        "kp/js/state-plate.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/state-plate.js"),
    ),
    (
        "kp/js/statusrow.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/statusrow.js"),
    ),
    (
        "kp/js/steplist.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/steplist.js"),
    ),
    (
        "kp/js/structure.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/structure.js"),
    ),
    (
        "kp/js/tabbar.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/tabbar.js"),
    ),
    (
        "kp/js/tables.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/tables.js"),
    ),
    (
        "kp/js/thread.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/thread.js"),
    ),
    (
        "kp/js/tick.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/tick.js"),
    ),
    (
        "kp/js/tiles.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/tiles.js"),
    ),
    (
        "kp/js/timefield.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/timefield.js"),
    ),
    (
        "kp/js/timer-disc.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/timer-disc.js"),
    ),
    (
        "kp/js/timer.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/timer.js"),
    ),
    (
        "kp/js/toggle.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/toggle.js"),
    ),
    (
        "kp/js/toolbar.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/toolbar.js"),
    ),
    (
        "kp/js/top-layer.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/top-layer.js"),
    ),
    (
        "kp/js/tour.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/tour.js"),
    ),
    (
        "kp/js/transfer.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/transfer.js"),
    ),
    (
        "kp/js/undo-toast.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/undo-toast.js"),
    ),
    (
        "kp/js/unsaved.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/unsaved.js"),
    ),
    (
        "kp/js/update.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/update.js"),
    ),
    (
        "kp/js/upload.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/upload.js"),
    ),
    (
        "kp/js/uptime.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/uptime.js"),
    ),
    (
        "kp/js/uses-map.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/uses-map.js"),
    ),
    (
        "kp/js/usual-picker.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/usual-picker.js"),
    ),
    (
        "kp/js/vendor/qr-encode.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/vendor/qr-encode.js"),
    ),
    (
        "kp/js/version-delta.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/version-delta.js"),
    ),
    (
        "kp/js/viewer.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/viewer.js"),
    ),
    (
        "kp/js/week.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/week.js"),
    ),
    (
        "kp/js/weekdays.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/weekdays.js"),
    ),
    (
        "kp/js/wheel.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/wheel.js"),
    ),
    (
        "kp/js/wizard.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/wizard.js"),
    ),
];

/// Every asset this build serves: the kit's own set, plus the full
/// kp-themes module set (every build with `assets`).
pub fn all_assets() -> impl Iterator<Item = &'static (&'static str, &'static str, &'static [u8])> {
    ASSETS.iter().chain(WEBAPP_KP_ASSETS.iter())
}

/// The vendored manifest, for the gate test and `--print-config`'s
/// "built with kp-themes x.y.z" line.
pub const KP_THEMES_MANIFEST: &str = include_str!("../../static/kp/KP_THEMES.sha256");

/// FNV-1a over every asset, as the `?v=` cache-buster: any byte changed in
/// any file changes every URL, which is what makes a one-year
/// `immutable` cache safe.
pub fn asset_version() -> &'static str {
    static VERSION: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    VERSION.get_or_init(|| fnv_version(ASSETS.iter().map(|(name, _, body)| (*name, *body))))
}

/// FNV-1a over `(name, body)` pairs, 16 hex chars.
pub fn fnv_version<'a>(parts: impl Iterator<Item = (&'a str, &'a [u8])>) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for (name, body) in parts {
        for b in name.bytes().chain(body.iter().copied()) {
            h ^= b as u64;
            h = h.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    format!("{h:016x}")
}

/// `GET /static/{name}`.
pub async fn serve(Path(name): Path<String>, RawQuery(query): RawQuery) -> Response {
    serve_conditional(Path(name), RawQuery(query), HeaderMap::new()).await
}

/// `GET /static/{name}` with revalidation (fix-13). The layout links every
/// asset with `?v=<content hash>`, so those URLs may be cached for a year.
/// A URL without it — a font reached from inside fonts.css, a project's app
/// importing `/static/kp/js/…` — gets `no-cache` and a strong `ETag`, and an
/// unchanged file answers 304: a kp-themes bump reaches an open tab at its
/// next reload, where the old one-day cache kept the old files for a day.
pub async fn serve_conditional(
    Path(name): Path<String>,
    RawQuery(query): RawQuery,
    headers: HeaderMap,
) -> Response {
    let versioned = query.as_deref().is_some_and(|q| q.contains("v="));
    let Some((_, ct, body)) = all_assets().find(|(n, _, _)| *n == name) else {
        return (StatusCode::NOT_FOUND, "no such asset").into_response();
    };
    if versioned {
        return (
            [
                (header::CONTENT_TYPE, *ct),
                (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
            ],
            *body,
        )
            .into_response();
    }
    let etag = format!("\"{}\"", fnv_version(std::iter::once(("", *body))));
    let unchanged = headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.split(',').any(|t| t.trim() == etag));
    let mut res = if unchanged {
        StatusCode::NOT_MODIFIED.into_response()
    } else {
        ([(header::CONTENT_TYPE, *ct)], *body).into_response()
    };
    let h = res.headers_mut();
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    if let Ok(v) = HeaderValue::from_str(&etag) {
        h.insert(header::ETAG, v);
    }
    res
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    /// K15 gate: every vendored copy matches the recorded release hash —
    /// the embedded files against the bytes the binary carries, the rest of
    /// the vendored tree (font licences, `families.json`) against the file
    /// on disk, so the whole tree is the tag it claims.
    #[test]
    fn vendored_kp_themes_match_the_manifest() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("static/kp");
        let mut checked = 0;
        let mut embedded = 0;
        for line in KP_THEMES_MANIFEST.lines() {
            if line.starts_with('#') || line.trim().is_empty() {
                continue;
            }
            let (hash, name) = line.split_once("  ").expect("sha256sum line");
            let key = format!("kp/{name}");
            let actual = match all_assets().find(|(n, _, _)| *n == key) {
                Some((_, _, body)) => {
                    embedded += 1;
                    hex::encode(Sha256::digest(body))
                }
                None => {
                    let bytes = std::fs::read(root.join(name))
                        .unwrap_or_else(|e| panic!("manifest names {name}, missing on disk: {e}"));
                    // Every served kind of file is embedded wherever the
                    // kit serves assets (3.9.0: no longer only with `webapp`).
                    assert!(
                        (!name.ends_with(".css")
                            && !name.ends_with(".js")
                            && !name.ends_with(".woff2")),
                        "{name} is a served kind of file but not embedded"
                    );
                    hex::encode(Sha256::digest(bytes))
                }
            };
            assert_eq!(
                actual, hash,
                "{name} differs from kp-themes v{KP_THEMES_VERSION}"
            );
            checked += 1;
        }
        let kp_assets = all_assets()
            .filter(|(n, _, _)| n.starts_with("kp/"))
            .count();
        assert_eq!(
            embedded, kp_assets,
            "every embedded kp/ asset is in the manifest and vice versa"
        );
        assert!(
            checked >= embedded,
            "the manifest covers at least the embedded files"
        );
        assert!(
            KP_THEMES_MANIFEST
                .lines()
                .next()
                .is_some_and(|l| l.contains(&format!("v{KP_THEMES_VERSION}"))),
            "the manifest's first line names the vendored version (the CLI reads it there)"
        );
    }

    /// K15: the vendored JavaScript is a closed import graph. One `import`
    /// pointing at a module the binary does not carry is a 404 that takes
    /// the whole module graph down — picker, confirmations, skip links.
    /// kp-themes' own `gates/check-closure.mjs` guards the six modules it
    /// knows this consumer bakes; this guards whatever the kit bakes,
    /// effects.js included. Drilled red once by dropping `kp/js/strings.js`
    /// from ASSETS: failed, restored.
    #[test]
    fn vendored_javascript_imports_only_vendored_modules() {
        let js: Vec<(&str, &str)> = all_assets()
            .filter(|(n, _, _)| n.ends_with(".js"))
            .map(|(n, _, b)| (*n, std::str::from_utf8(b).expect("utf-8")))
            .collect();
        assert!(js.iter().any(|(n, _)| *n == "kp/js/effects.js"));
        let mut checked = 0;
        for (name, body) in &js {
            let dir = name.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
            for line in body.lines() {
                let line = line.trim();
                // Comments carry JSDoc type imports (`import('../effects.js').X`)
                // that load nothing.
                if line.starts_with("//") || line.starts_with('*') || line.starts_with("/*") {
                    continue;
                }
                // kp-themes 7.0.0 loads the effect hooks with
                // `() => import('./effects/caret.js')`, which a static-only
                // reading would miss with all nine files absent.
                let mut targets: Vec<&str> = line
                    .split("import(")
                    .skip(1)
                    .filter_map(|rest| rest.split(')').next())
                    .map(str::trim)
                    // Only a string literal loads a module; `import(x)`
                    // with a variable is not something the kit can check.
                    .filter(|t| t.starts_with(['\'', '"']))
                    .map(|t| t.trim_matches(['\'', '"']))
                    .collect();
                // `export function f(a, from = x)` has " from " too; a module
                // specifier is always a string literal.
                if (line.starts_with("import ") || line.starts_with("export "))
                    && let Some(from) = line.split(" from ").nth(1)
                    && from.trim_start().starts_with(['\'', '"'])
                {
                    targets.push(from.trim().trim_end_matches(';').trim_matches(['\'', '"']));
                }
                for target in targets {
                    let (base, rel) = if let Some(rel) = target.strip_prefix("../") {
                        (dir.rsplit_once('/').map(|(d, _)| d).unwrap_or(""), rel)
                    } else if let Some(rel) = target.strip_prefix("./") {
                        (dir, rel)
                    } else {
                        panic!("{name} imports {target}: only ./ and ../ imports are servable");
                    };
                    let key = if base.is_empty() {
                        rel.to_string()
                    } else {
                        format!("{base}/{rel}")
                    };
                    assert!(
                        all_assets().any(|(n, _, _)| *n == key),
                        "{name} imports {target}, which the binary does not serve"
                    );
                    checked += 1;
                }
            }
        }
        assert!(
            checked >= 8,
            "the module graph has imports to check ({checked})"
        );
    }

    #[test]
    fn version_hash_is_stable_and_changes_with_content() {
        assert_eq!(asset_version().len(), 16);
        assert_eq!(asset_version(), asset_version());
        let a = fnv_version([("chassis.css", b"body{}" as &[u8])].into_iter());
        let b = fnv_version([("chassis.css", b"body{ }" as &[u8])].into_iter());
        let c = fnv_version([("other.css", b"body{}" as &[u8])].into_iter());
        assert_ne!(a, b, "one byte in a body changes every URL");
        assert_ne!(a, c, "a renamed asset changes every URL");
        assert_eq!(
            a,
            fnv_version([("chassis.css", b"body{}" as &[u8])].into_iter())
        );
    }

    #[tokio::test]
    async fn serve_sets_immutable_cache_and_404s_unknown() {
        let versioned = RawQuery(Some("v=0123456789abcdef".into()));
        let res = serve(Path("chassis.css".into()), versioned).await;
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(
            res.headers()["cache-control"],
            "public, max-age=31536000, immutable"
        );
        // fix-13: a URL without the hash (a font reached from fonts.css, a
        // project app importing /static/kp/js/…) is revalidated on every
        // load, so a kp-themes bump reaches an open tab at its next reload
        // instead of a day later.
        let res = serve(
            Path("kp/fonts/instrumentsans/instrumentsans-variable.woff2".into()),
            RawQuery(None),
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(res.headers()["cache-control"], "no-cache");
        assert_eq!(res.headers()["content-type"], "font/woff2");
        let etag = res.headers()["etag"].to_str().unwrap().to_string();
        let mut again = HeaderMap::new();
        again.insert(header::IF_NONE_MATCH, etag.parse().unwrap());
        let res = serve_conditional(
            Path("kp/fonts/instrumentsans/instrumentsans-variable.woff2".into()),
            RawQuery(None),
            again,
        )
        .await;
        assert_eq!(
            res.status(),
            StatusCode::NOT_MODIFIED,
            "unchanged: no body again"
        );
        assert_eq!(
            serve(Path("../etc/passwd".into()), RawQuery(None))
                .await
                .status(),
            StatusCode::NOT_FOUND
        );
    }
}
