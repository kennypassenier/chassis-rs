// Attaches kp-themes' effects module to a page and re-attaches it once when
// a caret theme becomes active. Shared by boot-kit.js (the kit's own pages)
// and webapp-runtime.js (a project's web app) so both behave the same.
//
// K15, kp-themes 5.0.0 (R2-b, 2026-09-09): js/effects.js performs what a
// stylesheet cannot — the block cursor inside a focused field for a theme
// that sets `--kp-caret: block` (none of kp-themes 11.0.0's twelve does, since
// terminal left; the hook stays for one that will) (the register paints the
// cell, the module writes the column), the themes' arrivals and reveals, and
// the dark theme's pointer-following glow.
//
// The caret is bound at attach time and only if the theme active at that
// moment answers `--kp-caret: block`; a page loaded in formal and switched
// to a caret theme would keep the browser's caret. Measured 2026-09-09:
// detach() does not forget the fields it bound (a module-level WeakSet), so
// detach-and-reattach cannot rebind them — instead the page attaches once
// more, the first time a caret theme becomes active after load. Bound
// fields stay bound; whether the cell is painted is the register's call.
// The knob is readable the moment the theme attribute changes: with the split
// delivery a held theme change lands (and fires kp-theme-change) only once its
// register has loaded, so the register that answers the knob is there.
//
// This file imports no kp-themes module: the kit's own pages call it with
// `attachEffects` from dist/js/ and a project's web app with the one from the
// one-file bundle, so each page holds one copy of kp-themes' state.

/**
 * Attach the effects to `doc` and watch for a caret theme. `attach` is the
 * caller's `attachEffects` (and a test's counter).
 * Returns `{ current() }`: the most recent effects handle.
 */
export function attachKitEffects(doc, attach) {
    const caretTheme = () =>
        getComputedStyle(doc.documentElement).getPropertyValue('--kp-caret').trim() === 'block';
    let effects = attach(doc);
    let caretAttached = caretTheme();
    doc.addEventListener('kp-theme-change', () => {
        if (caretAttached || !caretTheme()) return;
        caretAttached = true;
        effects = attach(doc);
    });
    return { current: () => effects };
}
