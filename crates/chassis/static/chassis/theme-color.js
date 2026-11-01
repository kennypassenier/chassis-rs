// The status bar (and a browser's address bar) in the colour of the page's
// own top bar, following the theme. The server injects one
// `<meta name="theme-color">` with the colour fixed in Rust, which is the
// first-paint value; this module rewrites it from the bar's computed
// background at start and on every `kp-theme-change`, so a dark theme gets a
// dark status bar. Only an installable page (one that links the kit's
// manifest) is touched: any other page keeps whatever meta it has.

import { linksManifest } from './pwa-register.js';

/** The theme's own transition can still run when the event fires; read again after it. */
export const SETTLE_MS = 600;
/** The kit header first (`.kp-nav`), then an app's own bar wrapper, then the page. */
export const BAR_SELECTORS = ['.kp-nav', '.app__bar', 'header', 'body'];

/** Whether a computed colour (`rgb(...)`, `rgba(...)`, `color(srgb ...)`) has no transparency. */
export function opaque(c) {
    if (!c || c === 'transparent') return false;
    const alpha = c.match(/[,/]\s*([\d.]+%?)\s*\)$/);
    if (!alpha) return true;
    const a = alpha[1].endsWith('%') ? Number.parseFloat(alpha[1]) / 100 : Number.parseFloat(alpha[1]);
    return a >= 1;
}

/** The first opaque background among the bar candidates; `null` when none is. */
export function barColour(doc, styleOf) {
    for (const sel of BAR_SELECTORS) {
        const el = doc.querySelector(sel);
        if (!el) continue;
        const bg = styleOf(el).backgroundColor;
        if (opaque(bg)) return bg;
    }
    return null;
}

/** Write the bar's colour into the existing theme-colour meta; returns whether it changed. */
export function syncThemeColor(doc, styleOf) {
    const meta = doc.querySelector('meta[name="theme-color"]:not([media])');
    const colour = barColour(doc, styleOf);
    if (!meta || !colour || meta.content === colour) return false;
    meta.content = colour;
    return true;
}

/** Keep the meta in step with the theme; `null` for a page that is not installable. */
export function followThemeColor(win, doc) {
    if (typeof doc.querySelector !== 'function' || !linksManifest(doc)) return null;
    const write = () => syncThemeColor(doc, (el) => win.getComputedStyle(el));
    const soon = () => {
        win.requestAnimationFrame?.(write);
        win.setTimeout(write, SETTLE_MS);
    };
    doc.addEventListener('kp-theme-change', soon);
    soon();
    return { write };
}
