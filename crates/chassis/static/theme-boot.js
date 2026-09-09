// The no-flash snippet (K15): without it the page renders in `formal` and
// then jumps to the visitor's theme. Served as a plain (non-module) script
// from /static so the page needs no inline script and the CSP can say
// script-src 'self' (S8).
//
// One thing kp-themes leaves to the consumer happens here, before first
// paint: kp-themes 5.0.0 renamed three themes, and a stored old name would
// otherwise fall back to `formal` on every visit, so it is mapped once and
// written back (kp-themes MIGRATION.md, 5.0.0). The themes' registers need
// no loading step: dist/kp-themes.css carries all twenty-five, each scoped
// to its theme (D2, 2026-09-09).
(function () {
    var renamed = { topo: "forest", tazhib: "lapis", nishiki: "woodblock" };
    try {
        var stored = localStorage.getItem("theme");
        if (stored && renamed[stored]) {
            stored = renamed[stored];
            localStorage.setItem("theme", stored);
        }
        if (stored) document.documentElement.setAttribute("data-theme", stored);
    } catch (e) {}
})();
