// Drawing a matrix: the ink and ground (the white plate, or the theme's own colours when they read well enough), as an
// SVG or as a canvas.

import { qrContrast, modulesPath } from './matrix.js';
import { QR_PLATE, attr } from './state.js';

/** The quiet zone round the code, unless `data-kp-qr-quiet` says [modules]. */
const QUIET = '4';
/** The contrast the theme's ink and card must reach to be used instead of the plate (WCAG AAA). */
const THEME_CONTRAST = 7;
/** Canvas pixels per module per device pixel, and the least it may be. */
const CANVAS_SCALE = 4;
const CANVAS_SCALE_MIN = 2;

/** The ink and ground the code is drawn in. @param {HTMLElement} root @returns {{ ink: string, ground: string, look: 'plate' | 'theme' }} */
export function palette(root) {
    if (attr(root, 'look', 'plate') === 'theme') {
        const cs = getComputedStyle(root);
        const ink = cs.color;
        const ground = cs.getPropertyValue('--card').trim() || '#ffffff';
        if (qrContrast(ink, ground) >= THEME_CONTRAST) return { ink, ground, look: 'theme' };
    }
    return { ink: QR_PLATE.ink, ground: QR_PLATE.ground, look: 'plate' };
}

/** @param {HTMLElement} root @param {{ size: number, rows: boolean[][] }} m @returns {SVGSVGElement} */
export function drawSvg(root, m) {
    const quiet = Math.max(0, Number(attr(root, 'quiet', QUIET)) || Number(QUIET));
    const shape = attr(root, 'modules', 'square') === 'round' ? 'round' : 'square';
    const { ink, ground } = palette(root);
    const total = m.size + 2 * quiet;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
    svg.setAttribute('class', 'kp-qr__svg');
    svg.setAttribute('shape-rendering', shape === 'round' ? 'geometricPrecision' : 'crispEdges');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');
    const back = document.createElementNS(ns, 'rect');
    back.setAttribute('width', String(total));
    back.setAttribute('height', String(total));
    back.setAttribute('fill', ground);
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', modulesPath(m.rows, quiet, shape));
    path.setAttribute('fill', ink);
    svg.append(back, path);
    return svg;
}

/** @param {HTMLElement} root @param {{ size: number, rows: boolean[][] }} m @returns {HTMLCanvasElement} */
export function drawCanvas(root, m) {
    const quiet = Math.max(0, Number(attr(root, 'quiet', QUIET)) || Number(QUIET));
    const { ink, ground } = palette(root);
    const total = m.size + 2 * quiet;
    const scale = Math.max(CANVAS_SCALE_MIN, Math.round((window.devicePixelRatio || 1) * CANVAS_SCALE));
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = total * scale;
    canvas.className = 'kp-qr__svg';
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = ground;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = ink;
        m.rows.forEach((row, y) => row.forEach((on, x) => on && ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale)));
    }
    canvas.setAttribute('aria-hidden', 'true');
    return canvas;
}

