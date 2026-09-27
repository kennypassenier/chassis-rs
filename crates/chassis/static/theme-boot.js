// The no-flash snippet (K15): without it the page renders in `formal` and
// then jumps to the visitor's theme. Served as a plain (non-module) script
// from /static so the page needs no inline script and the CSP can say
// script-src 'self' (S8).
//
// One thing kp-themes leaves to the consumer happens here, before first
// paint: a stored name kp-themes no longer has is mapped once and written
// back, so the visitor is not warned about it on every visit. 5.0.0 renamed
// three themes; 6.0.0 removed academia, mono, ticker and woodblock, which
// map to `formal`, the fallback kp-themes itself suggests (MIGRATION.md).
// The themes' registers need no loading step: dist/kp-themes.css carries
// them all, each scoped to its theme (D2, 2026-09-09).
(function () {
    var renamed = { topo: "forest", tazhib: "lapis", nishiki: "formal", academia: "formal", mono: "formal", ticker: "formal", woodblock: "formal" };
    try {
        var stored = localStorage.getItem("theme");
        if (stored && renamed[stored]) {
            stored = renamed[stored];
            localStorage.setItem("theme", stored);
        }
        if (stored) document.documentElement.setAttribute("data-theme", stored);
    } catch (e) {}
})();
