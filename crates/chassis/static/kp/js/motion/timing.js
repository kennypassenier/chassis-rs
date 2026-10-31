// Reads the theme's motion timing and the reduced-motion preference.
import { isCalm } from '../calm.js';

const CLOSE_SHARE = 2 / 3;
const SIZE_SHARE = 4 / 5;
/** @param {Element} el @param {string} name @param {number} fallback */
export const msOf = (el, name, fallback) => {
    const raw = getComputedStyle(el).getPropertyValue(name).trim();
    const n = parseFloat(raw);
    if (Number.isNaN(n)) return fallback;
    return raw.endsWith('ms') ? n : n * 1000;
};
/**
 * A time a register names in a custom property, in ms, played as slowly or
 * as fast as the page plays every motion (`--kp-motion-scale`, default 1);
 * `null` when the register names none. A bare number is ms. The property is
 * read where `el` stands, so a nested theme island answers with its own.
 * @param {Element} el
 * @param {string} name a custom property, such as `--kp-update-time`
 * @returns {number | null}
 */
export function registerTime(el, name) {
    const raw = getComputedStyle(el).getPropertyValue(name).trim();
    const n = parseFloat(raw);
    if (Number.isNaN(n) || n < 0) return null;
    const root = el.ownerDocument?.documentElement ?? document.documentElement;
    const scale = parseFloat(getComputedStyle(root).getPropertyValue('--kp-motion-scale')) || 1;
    const ms = raw.endsWith('ms') ? n : raw.endsWith('s') ? n * 1000 : n;
    return ms * scale;
}
/** @param {string} raw a CSS duration list @returns {number} the first, in ms */
export const firstMs = (raw) => {
    const first = raw.split(',')[0].trim();
    const n = parseFloat(first);
    if (Number.isNaN(n)) return 0;
    return first.endsWith('ms') ? n : n * 1000;
};
// The reader's motion preference, kept current: read once and updated on
// every change, so a reader who turns reduced motion on mid-page gets it on
// the next motion (DI7).
const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let reducedNow = reducedQuery?.matches ?? false;
reducedQuery?.addEventListener('change', (event) => {
    reducedNow = event.matches;
});
/** @returns {boolean} */
export const reduced = () => reducedNow || isCalm();
/**
 * The theme's motion, read from its dialog entrance: a dialog drawn for an
 * instant out of sight, in the theme `scope` wears.
 *
 * @param {Element} [scope] where the theme is read (its closest `[data-theme]` applies)
 * @returns {{ open: number, ease: string, close: number, size: number }} milliseconds, and the entrance's curve
 */
export function themeMotion(scope = document.documentElement) {
    if (reduced()) return { open: 0, ease: 'linear', close: 0, size: 0 };
    const host = scope.ownerDocument?.body ?? document.body;
    const probe = document.createElement('div');
    probe.className = 'kp-dialog';
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;inset:auto;left:-9999px;top:0;visibility:hidden;pointer-events:none;';
    const themed = scope.closest('[data-theme]');
    // The register's dialog rules name `.kp-dialog` under the theme's root,
    // so the probe stands where the scope stands.
    (themed && themed !== document.documentElement && themed instanceof HTMLElement ? themed : host).append(probe);
    let open = 0;
    let ease = 'ease';
    try {
        const style = getComputedStyle(probe);
        if (style.animationName && style.animationName !== 'none') {
            open = firstMs(style.animationDuration);
            ease = style.animationTimingFunction.split(/,(?![^(]*\))/)[0].trim() || 'ease';
        }
    } finally {
        probe.remove();
    }
    const root = scope.ownerDocument?.documentElement ?? document.documentElement;
    // A page may play every motion slower or faster at once (a demo's slow
    // motion, a reader's own preference): `--kp-motion-scale`, default 1.
    const scale = parseFloat(getComputedStyle(root).getPropertyValue('--kp-motion-scale')) || 1;
    return {
        open,
        ease,
        close: Math.min(open * CLOSE_SHARE, msOf(root, '--kp-close-max', 600)) * scale,
        size: Math.min(open * SIZE_SHARE, msOf(root, '--kp-size-max', 480)) * scale,
    };
}
