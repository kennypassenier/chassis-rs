// The no-flash snippet (K15): without it the page renders in `formal` and
// then jumps to the visitor's theme. Served as a plain (non-module) script
// from /static so the page needs no inline script and the CSP can say
// script-src 'self' (S8).
//
// Two things kp-themes leaves to the consumer happen here, before first
// paint. (1) kp-themes 5.0.0 renamed three themes; a stored old name would
// otherwise fall back to `formal` on every visit, so it is mapped once and
// written back (kp-themes MIGRATION.md, 5.0.0). (2) Each theme's register
// (`css/<name>-register.css`, the theme's character on top of its palette)
// is a stylesheet the consumer includes itself; the kit serves all
// twenty-five and loads only the active one, here for the first paint and
// in chassis.js on every change.
(function () {
    var renamed = { topo: "forest", tazhib: "lapis", nishiki: "woodblock" };
    var theme = "formal";
    try {
        var stored = localStorage.getItem("theme");
        if (stored && renamed[stored]) {
            stored = renamed[stored];
            localStorage.setItem("theme", stored);
        }
        if (stored) {
            document.documentElement.setAttribute("data-theme", stored);
            theme = stored;
        }
    } catch (e) {}
    try {
        var me = document.currentScript;
        var version = me && me.src.indexOf("?") >= 0 ? me.src.slice(me.src.indexOf("?")) : "";
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "/static/kp/css/" + encodeURIComponent(theme) + "-register.css" + version;
        link.setAttribute("data-kp-register", theme);
        document.head.appendChild(link);
    } catch (e) {}
})();
