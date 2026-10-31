// The code itself: the matrix for a text (the vendored encoder), the WCAG contrast of two colours and the path of the
// dark modules. No state; the drawing is in draw.js.

import { QrCode } from '../vendor/qr-encode.js';

/** The size of a finder pattern, the three big squares in the corners [modules]. */
const FINDER = 7;
/** A round module's radius [modules]. */
const DOT_RADIUS = 0.46;

/**
 * The matrix for a text: rows of booleans, or the reason it cannot be made.
 * @param {string} text @param {'L' | 'M' | 'Q' | 'H'} [level]
 * @returns {{ size: number, rows: boolean[][], bytes: number } | { error: string }}
 */
export function qrMatrix(text, level = 'M') {
    const ecc = { L: QrCode.Ecc.LOW, M: QrCode.Ecc.MEDIUM, Q: QrCode.Ecc.QUARTILE, H: QrCode.Ecc.HIGH }[level] ?? QrCode.Ecc.MEDIUM;
    try {
        const qr = QrCode.encodeText(text, ecc);
        const rows = Array.from({ length: qr.size }, (_, y) => Array.from({ length: qr.size }, (_, x) => qr.getModule(x, y)));
        return { size: qr.size, rows, bytes: new TextEncoder().encode(text).length };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/** @param {string} color @returns {[number, number, number]} an sRGB colour from any CSS colour */
function rgbOf(color) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [0, 0, 0];
    ctx.fillStyle = '#000';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
}

/** The WCAG contrast of two colours. @param {string} a @param {string} b */
export function qrContrast(a, b) {
    const lum = (/** @type {[number, number, number]} */ [r, g, bl]) => {
        const f = (/** @type {number} */ c) => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
    };
    const x = lum(rgbOf(a));
    const y = lum(rgbOf(b));
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** The path of the dark modules. @param {boolean[][]} rows @param {number} quiet @param {'square' | 'round'} shape */
export function modulesPath(rows, quiet, shape) {
    const n = rows.length;
    const finder = (/** @type {number} */ x, /** @type {number} */ y) => (x < FINDER && y < FINDER) || (x >= n - FINDER && y < FINDER) || (x < FINDER && y >= n - FINDER);
    let square = '';
    let dots = '';
    for (let y = 0; y < n; y += 1) {
        for (let x = 0; x < n; x += 1) {
            if (!rows[y][x]) continue;
            if (shape === 'round' && !finder(x, y)) dots += `M${x + quiet + 0.5},${y + quiet + 0.5}m-${DOT_RADIUS},0a${DOT_RADIUS},${DOT_RADIUS} 0 1,0 ${2 * DOT_RADIUS},0a${DOT_RADIUS},${DOT_RADIUS} 0 1,0 -${2 * DOT_RADIUS},0z`;
            else square += `M${x + quiet},${y + quiet}h1v1h-1z`;
        }
    }
    return square + dots;
}

