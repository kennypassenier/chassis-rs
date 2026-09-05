// The no-flash snippet (K15): without it the page renders in `formal` and
// then jumps to the visitor's theme. Served as a plain (non-module) script
// from /static so the page needs no inline script and the CSP can say
// script-src 'self' (S8).
(function () {
    try {
        var t = localStorage.getItem("theme");
        if (t) document.documentElement.setAttribute("data-theme", t);
    } catch (e) {}
})();
