// A link as a QR code a phone can scan [kpadopt6; kp-soft's invitations, chassis-rs pairing].
//
//   <div class="kp-qr" data-kp-qr data-kp-qr-value="https://kp-soft.dev/invite/7Hq2"></div>
//
//   setQr(el, { value: 'https://…' });                   // or write data-kp-qr-value
//   setQr(el, { state: 'loading' });                     // the link is being made
//
// The page, not a service, draws it: the link never leaves the device. The encoder is Project Nayuki's MIT library,
// vendored in js/vendor/qr-encode.js; this module chooses the level and the size, draws an SVG (or a canvas) and holds
// the words and the states around it.
//
// What it shows: the code on a plate that stays light in every theme and in dark mode (dark modules on light is read by
// every camera, inverted by only some; this is the one deliberate exception to theming, and the quiet zone of 4 modules
// is part of the plate), the link as text under it that wraps at any character, a Copy button that shows its result
// without changing width (js/flash.js), and optionally Download. The code is `role="img"` named by `data-kp-qr-label`
// and described by the link; Shift+C on it copies.
//
// Options (attributes, each also a key of `setQr`):
//   data-kp-qr-value      the text to encode
//   data-kp-qr-ecc        `L`, `M` (default), `Q`, `H`
//   data-kp-qr-size       a CSS length (default 12rem); `lg` is 16rem
//   data-kp-qr-quiet      the quiet zone in modules (default 4)
//   data-kp-qr-look       `plate` (default) or `theme` (the theme's ink on its surface, only with a contrast of 7:1, else `plate`)
//   data-kp-qr-modules    `square` (default) or `round` (the three finder patterns stay square so it scans)
//   data-kp-qr-render     `svg` (default) or `canvas`
//   data-kp-qr-caption    `link` (default), `none`, or the words to show instead
//   data-kp-qr-copy       on; `false` hides Copy
//   data-kp-qr-download   `false` (default), `png` (4 times the display size) or `svg`
//   data-kp-qr-reveal     `shown` (default) or `click` (hidden behind "Show QR code")
//   data-kp-qr-expires    an ISO moment; after it the code is withdrawn, not covered
//   data-kp-qr-label      the code's accessible name
//   data-kp-qr-max        bytes above which a warning shows (default 512)
//   data-kp-qr-narrow     `code` (default) or `link` (the link and Copy first on a narrow screen)
//   data-kp-qr-retry      present: a code that could not be made offers Retry (`kp-qr-retry`) for an app that can give another link
//
// Events (bubbling, on the root): `kp-qr-copy` `{ value }`, `kp-qr-reveal` `{ shown }`, `kp-qr-expired`, `kp-qr-retry`.
// Every word is in js/strings.js; nothing runs on import.

import { getStrings } from './strings.js';
import { QrCode } from './vendor/qr-encode.js';
import { statePlate } from './state-plate.js';
import { runFlashButton } from './flash.js';
import { registerShortcuts } from './shortcuts.js';
import { openBusyCard } from './busy-card.js';
import { attachDisabledReasons } from './reason.js';

/** The codes this module looks after. */
export const QR = '[data-kp-qr]';
/** Fired when the link was copied: `{ value }`. */
export const QR_COPY_EVENT = 'kp-qr-copy';
/** Fired when a hidden code is shown or hidden: `{ shown }`. */
export const QR_REVEAL_EVENT = 'kp-qr-reveal';
/** Fired once when the link's time ran out. */
export const QR_EXPIRED_EVENT = 'kp-qr-expired';
/** Fired by the Retry of a code that could not be made. */
export const QR_RETRY_EVENT = 'kp-qr-retry';
/** The characters of a link shown before it is folded behind "Show all". */
export const QR_FOLD = 160;
/** The error correction levels, lowest first. */
export const QR_LEVELS = Object.freeze(['L', 'M', 'Q', 'H']);
/** The plate's colours: dark modules on a light plate, whatever the theme (see the header). */
export const QR_PLATE = Object.freeze({ ground: '#ffffff', ink: '#000000' });

/**
 * @typedef {object} QrSpec
 * @property {string} [value]
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state]
 * @property {string} [message]  the failed plate's sentence
 */

/** @typedef {{ open: boolean, spec: QrSpec, mode: string, timer: number, shown: boolean, said: string, off: (() => void)[], card: import('./busy-card.js').BusyCard | null, expired: boolean }} QrState */
/** @type {WeakMap<Element, QrState>} */
const STATE = new WeakMap();
let serial = 0;

/** @param {string} className @param {string} [tag] */
const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} root @param {string} name @param {string} fallback */
const attr = (root, name, fallback) => root.getAttribute(`data-kp-qr-${name}`) ?? fallback;

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

/** The ink and ground the code is drawn in. @param {HTMLElement} root @returns {{ ink: string, ground: string, look: 'plate' | 'theme' }} */
function palette(root) {
    if (attr(root, 'look', 'plate') === 'theme') {
        const cs = getComputedStyle(root);
        const ink = cs.color;
        const ground = cs.getPropertyValue('--card').trim() || '#ffffff';
        if (qrContrast(ink, ground) >= 7) return { ink, ground, look: 'theme' };
    }
    return { ink: QR_PLATE.ink, ground: QR_PLATE.ground, look: 'plate' };
}

/** The path of the dark modules. @param {boolean[][]} rows @param {number} quiet @param {'square' | 'round'} shape */
function modulesPath(rows, quiet, shape) {
    const n = rows.length;
    const finder = (/** @type {number} */ x, /** @type {number} */ y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    let square = '';
    let dots = '';
    for (let y = 0; y < n; y += 1) {
        for (let x = 0; x < n; x += 1) {
            if (!rows[y][x]) continue;
            if (shape === 'round' && !finder(x, y)) dots += `M${x + quiet + 0.5},${y + quiet + 0.5}m-0.46,0a0.46,0.46 0 1,0 0.92,0a0.46,0.46 0 1,0 -0.92,0z`;
            else square += `M${x + quiet},${y + quiet}h1v1h-1z`;
        }
    }
    return square + dots;
}

/** @param {HTMLElement} root @param {{ size: number, rows: boolean[][] }} m @returns {SVGSVGElement} */
function drawSvg(root, m) {
    const quiet = Math.max(0, Number(attr(root, 'quiet', '4')) || 4);
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
function drawCanvas(root, m) {
    const quiet = Math.max(0, Number(attr(root, 'quiet', '4')) || 4);
    const { ink, ground } = palette(root);
    const total = m.size + 2 * quiet;
    const scale = Math.max(2, Math.round((window.devicePixelRatio || 1) * 4));
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

/** @param {HTMLElement} root */
function stateOf(root) {
    let st = STATE.get(root);
    if (!st) {
        st = { open: false, spec: {}, mode: attr(root, 'reveal', 'shown'), timer: 0, shown: attr(root, 'reveal', 'shown') !== 'click', said: '', off: [], card: null, expired: false };
        STATE.set(root, st);
    }
    return st;
}

/** @param {HTMLElement} root */
const valueOf = (root) => stateOf(root).spec.value ?? root.getAttribute('data-kp-qr-value') ?? '';

/** @param {HTMLElement} root @param {string} message */
function say(root, message) {
    if (root.getAttribute('data-kp-announce') === 'off') return;
    let region = /** @type {HTMLElement | null} */ (root.querySelector(':scope > .kp-qr__live'));
    if (!region) {
        region = el('kp-sr-only kp-qr__live', 'span');
        region.setAttribute('role', 'status');
        root.append(region);
    }
    const target = region;
    target.textContent = '';
    setTimeout(() => (target.textContent = message), 60);
}

/** @param {HTMLElement} root */
function ensureParts(root) {
    if (root.querySelector(':scope > .kp-qr__plate')) return;
    root.classList.add('kp-qr');
    const plate = el('kp-qr__plate');
    const caption = el('kp-qr__caption', 'p');
    serial += 1;
    caption.id = `kp-qr-${serial}-link`;
    const actions = el('kp-qr__actions');
    root.append(plate, caption, actions);
}

/** Make the code, or say why not, and draw everything around it. @param {HTMLElement} root */
function render(root) {
    ensureParts(root);
    const st = stateOf(root);
    const s = getStrings();
    const plate = /** @type {HTMLElement} */ (root.querySelector(':scope > .kp-qr__plate'));
    const caption = /** @type {HTMLElement} */ (root.querySelector(':scope > .kp-qr__caption'));
    const actions = /** @type {HTMLElement} */ (root.querySelector(':scope > .kp-qr__actions'));
    const value = valueOf(root);
    if (st.mode !== attr(root, 'reveal', 'shown')) {
        st.mode = attr(root, 'reveal', 'shown');
        st.shown = st.mode !== 'click';
    }
    const size = attr(root, 'size', '12rem');
    root.style.setProperty('--kp-qr-size', size === 'lg' ? '16rem' : size);
    window.clearTimeout(st.timer);
    const expires = root.getAttribute('data-kp-qr-expires');
    st.expired = false;
    if (expires) {
        const left = Date.parse(expires) - Date.now();
        if (left <= 0) st.expired = true;
        else if (left < 2 ** 31 - 1)
            st.timer = window.setTimeout(() => {
                st.expired = true;
                render(root);
                root.dispatchEvent(new CustomEvent(QR_EXPIRED_EVENT, { bubbles: true }));
            }, left);
    }
    /** @type {'ready' | 'loading' | 'empty' | 'error' | 'expired'} */
    let state = st.spec.state ?? (value === '' ? 'empty' : 'ready');
    if (st.card && state !== 'loading') {
        st.card.remove();
        st.card = null;
    }
    plate.replaceChildren();
    plate.removeAttribute('role');
    plate.removeAttribute('tabindex');
    plate.removeAttribute('aria-label');
    plate.removeAttribute('aria-describedby');
    plate.removeAttribute('data-kp-qr-look');
    root.toggleAttribute('aria-busy', state === 'loading');
    /** @type {ReturnType<typeof qrMatrix> | null} */
    let matrix = null;
    const bytes = new TextEncoder().encode(value).length;
    if (state === 'ready' && !st.expired) {
        matrix = qrMatrix(value, /** @type {any} */ (QR_LEVELS.includes(attr(root, 'ecc', 'M')) ? attr(root, 'ecc', 'M') : 'M'));
        if ('error' in matrix) {
            state = 'error';
            st.spec = { ...st.spec, message: st.spec.message ?? s.qrTooLongTitle };
        }
    }
    if (st.expired && value !== '') state = 'expired';
    root.setAttribute('data-kp-state', state);

    // The plate: the code, or what stands in its place at its size.
    const hidden = state === 'ready' && !st.shown;
    if (state === 'ready' && matrix && !('error' in matrix) && !hidden) {
        const picture = attr(root, 'render', 'svg') === 'canvas' ? drawCanvas(root, matrix) : drawSvg(root, matrix);
        plate.append(picture);
        plate.setAttribute('role', 'img');
        plate.setAttribute('tabindex', '0');
        plate.setAttribute('aria-label', attr(root, 'label', s.qrLabel));
        plate.setAttribute('aria-describedby', caption.id);
        plate.setAttribute('data-kp-qr-look', palette(root).look);
        if (st.said !== value) {
            st.said = value;
            say(root, s.qrReady);
        }
    } else if (hidden) {
        const cover = statePlate(document, { kind: 'empty', title: s.qrHidden, actionLabel: s.qrShow, actionAttribute: 'data-kp-qr-show' });
        cover.classList.add('kp-qr__cover');
        plate.append(cover);
    } else if (state === 'loading') {
        plate.append(el('kp-qr__wait'));
        st.card = openBusyCard(plate, { words: s.qrLoading, area: () => [plate], className: 'kp-qr__busy', arrive: false });
    } else if (state === 'empty') {
        const p = statePlate(document, { kind: 'empty', title: s.qrEmptyTitle, text: s.qrEmptyText });
        plate.append(p);
    } else if (state === 'expired') {
        const p = statePlate(document, { kind: 'error', title: s.qrExpired, text: s.qrExpiredText });
        p.classList.add('kp-qr__expired');
        plate.append(p);
    } else {
        const p = statePlate(document, {
            kind: 'error',
            title: st.spec.message ?? s.qrTooLongTitle,
            text: s.qrTooLongText,
            actionLabel: root.hasAttribute('data-kp-qr-retry') ? s.qrRetry : undefined,
            actionAttribute: 'data-kp-qr-retry-action',
        });
        plate.append(p);
    }

    // The caption: the link as text, wrapping at any character; it keeps its height in every state.
    const mode = attr(root, 'caption', 'link');
    caption.hidden = mode === 'none';
    const full = mode === 'link' ? value : mode === 'none' ? '' : mode;
    // A very long link is folded (never cut for good): the first 160 characters and "Show all N characters"; Copy copies the whole.
    const folded = full.length > QR_FOLD && !st.open;
    caption.textContent = folded ? full.slice(0, QR_FOLD) : full;
    caption.toggleAttribute('data-kp-qr-struck', state === 'expired');
    caption.toggleAttribute('data-kp-qr-empty', caption.textContent === '');
    if (state === 'loading') caption.textContent = '';

    // The actions.
    actions.replaceChildren();
    const live = state === 'ready' || state === 'error';
    if (attr(root, 'copy', 'true') !== 'false') {
        const copy = /** @type {HTMLButtonElement} */ (el('kp-button kp-qr__copy', 'button'));
        copy.type = 'button';
        copy.textContent = s.qrCopy;
        copy.setAttribute('data-kp-flash-words', `${s.qrCopied},${s.qrCopyFailed}`);
        copy.disabled = !live || value === '';
        if (copy.disabled) copy.setAttribute('data-kp-disabled-reason', value === '' ? s.qrNoLink : s.qrCopyOff);
        actions.append(copy);
    }
    if (full.length > QR_FOLD && state !== 'loading') {
        const more = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-qr__more', 'button'));
        more.type = 'button';
        more.setAttribute('aria-expanded', String(st.open));
        more.textContent = st.open ? s.qrShowLess : s.qrShowAllChars(full.length);
        actions.append(more);
    }
    const dl = attr(root, 'download', 'false');
    if ((dl === 'png' || dl === 'svg') && state === 'ready' && matrix && !('error' in matrix) && !hidden) {
        const b = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-qr__download', 'button'));
        b.type = 'button';
        b.setAttribute('data-kp-qr-download-as', dl);
        b.textContent = dl === 'png' ? s.qrDownloadPng : s.qrDownloadSvg;
        actions.append(b);
    }
    if (attr(root, 'reveal', 'shown') === 'click' && state === 'ready' && st.shown) {
        const b = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-qr__hide', 'button'));
        b.type = 'button';
        b.textContent = s.qrHide;
        actions.append(b);
    }
    attachDisabledReasons(actions);
    // A long link warns; the code is still made.
    let warn = /** @type {HTMLElement | null} */ (root.querySelector(':scope > .kp-qr__warn'));
    const limit = Number(attr(root, 'max', '512')) || 512;
    if (state === 'ready' && bytes > limit) {
        if (!warn) {
            warn = el('kp-qr__warn', 'p');
            root.append(warn);
        }
        warn.textContent = s.qrDense(bytes);
    } else warn?.remove();
}

/**
 * Give a code its link or its state.
 * @param {HTMLElement} root @param {QrSpec} spec
 */
export function setQr(root, spec) {
    if (!(root instanceof HTMLElement)) return;
    const st = stateOf(root);
    st.spec = { ...st.spec, ...spec };
    if (spec.value !== undefined) root.setAttribute('data-kp-qr-value', spec.value);
    if (spec.state === undefined && spec.value !== undefined) delete st.spec.state;
    render(root);
}

/** The code's SVG text, or null when none is drawn. @param {HTMLElement} root */
export function qrSvg(root) {
    const svg = root.querySelector('.kp-qr__plate svg');
    return svg ? new XMLSerializer().serializeToString(svg) : null;
}

/** @param {HTMLElement} root */
async function copyLink(root) {
    const button = /** @type {HTMLButtonElement | null} */ (root.querySelector('.kp-qr__copy'));
    const value = valueOf(root);
    if (!button || value === '') return;
    const s = getStrings();
    await runFlashButton(button, async () => {
        try {
            await navigator.clipboard.writeText(value);
        } catch {
            const box = document.createElement('textarea');
            box.value = value;
            document.body.append(box);
            box.select();
            const ok = document.execCommand('copy');
            box.remove();
            if (!ok) return { error: s.qrCopyFailed, word: s.qrCopyFailed };
        }
        root.dispatchEvent(new CustomEvent(QR_COPY_EVENT, { bubbles: true, detail: { value } }));
        return s.qrCopied;
    });
}

/** @param {Blob} blob @param {string} name */
function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** @param {HTMLElement} root @param {'png' | 'svg'} kind */
async function download(root, kind) {
    const text = qrSvg(root);
    const canvasEl = root.querySelector('.kp-qr__plate canvas');
    if (kind === 'svg' && text) return save(new Blob([text], { type: 'image/svg+xml' }), 'qr-code.svg');
    const box = /** @type {HTMLElement} */ (root.querySelector('.kp-qr__plate')).getBoundingClientRect();
    const px = Math.round(box.width * 4);
    if (canvasEl instanceof HTMLCanvasElement) return canvasEl.toBlob((b) => b && save(b, 'qr-code.png'));
    if (!text) return;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    await new Promise((resolve) => {
        img.onload = resolve;
        img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, px, px);
    }
    URL.revokeObjectURL(url);
    canvas.toBlob((b) => b && save(b, 'qr-code.png'));
}

/**
 * Wire every QR code under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachQr(root = document) {
    const roots = /** @type {HTMLElement[]} */ ([...(root instanceof HTMLElement && root.matches(QR) ? [root] : []), ...root.querySelectorAll(QR)]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const el_ of roots) {
        const st = stateOf(el_);
        if (st.off.length) continue;
        /** @param {MouseEvent} event */
        const onClick = (event) => {
            const t = event.target instanceof Element ? event.target : null;
            if (!t) return;
            if (t.closest('.kp-qr__copy')) return void copyLink(el_);
            if (t.closest('.kp-qr__more')) {
                st.open = !st.open;
                render(el_);
                return;
            }
            const dl = t.closest('[data-kp-qr-download-as]');
            if (dl) return void download(el_, dl.getAttribute('data-kp-qr-download-as') === 'png' ? 'png' : 'svg');
            if (t.closest('[data-kp-qr-show]')) {
                st.shown = true;
                render(el_);
                el_.dispatchEvent(new CustomEvent(QR_REVEAL_EVENT, { bubbles: true, detail: { shown: true } }));
                el_.querySelector('.kp-qr__plate')?.dispatchEvent(new Event('focus'));
                /** @type {HTMLElement | null} */ (el_.querySelector('.kp-qr__plate[tabindex]'))?.focus();
                return;
            }
            if (t.closest('.kp-qr__hide')) {
                st.shown = false;
                render(el_);
                el_.dispatchEvent(new CustomEvent(QR_REVEAL_EVENT, { bubbles: true, detail: { shown: false } }));
                /** @type {HTMLElement | null} */ (el_.querySelector('[data-kp-qr-show]'))?.focus();
                return;
            }
            if (t.closest('[data-kp-qr-retry-action]')) el_.dispatchEvent(new CustomEvent(QR_RETRY_EVENT, { bubbles: true }));
        };
        el_.addEventListener('click', onClick);
        // Every option is live: change the attribute and the code is drawn again.
        let queued = 0;
        const watcher = new MutationObserver(() => {
            window.cancelAnimationFrame(queued);
            queued = window.requestAnimationFrame(() => render(el_));
        });
        watcher.observe(el_, {
            attributes: true,
            attributeFilter: ['value', 'ecc', 'size', 'quiet', 'look', 'modules', 'render', 'caption', 'copy', 'download', 'reveal', 'expires', 'label', 'max', 'narrow'].map((n) => `data-kp-qr-${n}`),
        });
        const stopKeys = registerShortcuts(
            el_,
            [
                {
                    keys: 'Shift C',
                    what: getStrings().qrKey,
                    group: getStrings().qrKeyGroup,
                    when: () => el_.contains(document.activeElement) && valueOf(el_) !== '' && !el_.querySelector('.kp-qr__copy:disabled'),
                    reason: getStrings().qrKeyReason,
                    run: () => void copyLink(el_),
                },
            ],
            { layoutGuard: 'off' },
        );
        st.off = [() => el_.removeEventListener('click', onClick), () => watcher.disconnect(), stopKeys, () => window.clearTimeout(st.timer)];
        undo.push(() => {
            for (const stop of st.off) stop();
            st.off = [];
        });
        render(el_);
    }
    return () => undo.forEach((u) => u());
}
