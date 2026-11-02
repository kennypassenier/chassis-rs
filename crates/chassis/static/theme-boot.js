// The no-flash snippet (K15): without it the page renders in `formal` and
// then jumps to the visitor's theme. Served as a plain (non-module) script
// from /static so the page needs no inline script and the CSP can say
// script-src 'self' (S8).
//
// One thing kp-themes leaves to the consumer happens here, before first
// paint: a stored name kp-themes no longer has is mapped once and written
// back, so the visitor is not warned about it on every visit. 5.0.0 renamed
// three themes; 6.0.0 removed academia, mono, ticker and woodblock, which
// map to `formal`, the fallback kp-themes itself suggests (MIGRATION.md);
// 10.0.0 removed lapis and shade-dark (to `dark`) and shade-light; 11.0.0
// removed terminal (to `nostromo`), phantom (to `dark`), light (and with it
// shade-light, to `formal`) and grotesk (to `brutalism`), the nearest of the
// twelve themes left by kp-themes' MIGRATION.md.
//
// kp-themes split delivery [kpsplit-3]: the page links the base stylesheet
// and each theme's register is a file of its own. The worn theme's register
// is written HERE, before first paint, as a parser-inserted <link> (a link
// added by a module arrives after the first paint, and the page would flash
// in tokens with no register). This script sits BELOW the base stylesheet in
// the head, so the register lands in the cascade layer the base states first.
// What it needs comes from the server through the tag's data attributes
// (data-register-pattern with `{theme}` in it, data-themes, data-fallback),
// so nothing here is configuration and the CSP keeps script-src 'self'.
// Switching themes later is kp-themes' attachLazyRegisters (boot-kit.js),
// which adopts the link written here.
(function () {
    var renamed = { topo: "forest", tazhib: "dark", lapis: "dark", "shade-dark": "dark", "shade-light": "formal", light: "formal", terminal: "nostromo", phantom: "dark", grotesk: "brutalism", nishiki: "formal", academia: "formal", mono: "formal", ticker: "formal", woodblock: "formal" };
    try {
        var stored = localStorage.getItem("theme");
        if (stored && renamed[stored]) {
            stored = renamed[stored];
            localStorage.setItem("theme", stored);
        }
        if (stored) document.documentElement.setAttribute("data-theme", stored);
    } catch (e) {}
    writeRegister(document.currentScript, document.documentElement);

    // The register link for the theme `root` wears; an unknown name (a stored
    // name from a newer deployment) asks for the fallback's register instead
    // of a file that is not there. `tag` is this script's own element.
    function writeRegister(tag, root) {
        var pattern = tag && tag.getAttribute("data-register-pattern");
        if (!pattern) return;
        var names = (tag.getAttribute("data-themes") || "").split(",");
        var name = root.getAttribute("data-theme");
        if (names.indexOf(name) < 0) name = tag.getAttribute("data-fallback") || "";
        var href = pattern.replace("{theme}", name).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
        // data-kp-register is kp-themes' REGISTER_ATTRIBUTE; a test pins it.
        document.write('<link rel="stylesheet" href="' + href + '" data-kp-register="' + name + '" blocking="render">');
    }
})();
