// What a page and the controls do with a code: give it a link or a state, read its SVG, copy the link and download the
// picture.

import { runFlashButton } from '../flash.js';
import { getStrings } from '../strings.js';
import { render } from './render.js';
import { QR_COPY_EVENT, stateOf, valueOf } from './state.js';

/** @typedef {import('../qr.js').QrSpec} QrSpec */

/** How long a download's object URL is kept after the click [ms]. */
const REVOKE_AFTER_MS = 1000;
/** A PNG made from the SVG is this many times the plate's drawn width [px per CSS px]. */
const PNG_SCALE = 4;

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
export async function copyLink(root) {
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
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

/** @param {HTMLElement} root @param {'png' | 'svg'} kind */
export async function download(root, kind) {
    const text = qrSvg(root);
    const canvasEl = root.querySelector('.kp-qr__plate canvas');
    if (kind === 'svg' && text) return save(new Blob([text], { type: 'image/svg+xml' }), 'qr-code.svg');
    const box = /** @type {HTMLElement} */ (root.querySelector('.kp-qr__plate')).getBoundingClientRect();
    const px = Math.round(box.width * PNG_SCALE);
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

