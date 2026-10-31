// Drawing a code and everything around it: the plate (the code, or what stands in its place at its size), the caption,
// the actions and the density warning, and the expiry timer.

import { openBusyCard } from '../busy-card.js';
import { attachDisabledReasons } from '../reason.js';
import { statePlate } from '../state-plate.js';
import { getStrings } from '../strings.js';
import { drawCanvas, drawSvg, palette } from './draw.js';
import { qrMatrix } from './matrix.js';
import { QR_EXPIRED_EVENT, QR_FOLD, QR_LEVELS, attr, el, say, stateOf, valueOf } from './state.js';

/** @typedef {import('./state.js').QrState} QrState */
/** @typedef {ReturnType<typeof getStrings>} Strings */
/** @typedef {'ready' | 'loading' | 'empty' | 'error' | 'expired'} QrShown */

/** The longest wait a browser timer takes (2^31 - 1 ms); an expiry further away is not timed. */
const TIMER_MAX_MS = 2 ** 31 - 1;
/** The code's size when the page names none, and what `lg` means. */
const SIZE_DEFAULT = '12rem';
const SIZE_LG = '16rem';
/** The bytes above which a long link warns that the code is dense, unless `data-kp-qr-max` says. */
const DENSE_BYTES = 512;
/** The plate's attributes a draw sets afresh. */
const PLATE_ATTRIBUTES = ['role', 'tabindex', 'aria-label', 'aria-describedby', 'data-kp-qr-look'];

/** Numbers the captions of a page, for their ids. */
let serial = 0;

/** @param {HTMLElement} root */
function ensureParts(root) {
    if (root.querySelector(':scope > .kp-qr__plate')) return;
    root.classList.add('kp-qr');
    const plate = el('kp-qr__plate');
    const caption = el('kp-qr__caption', 'p');
    serial += 1;
    caption.id = `kp-qr-${serial}-link`;
    root.append(plate, caption, el('kp-qr__actions'));
}

/** Time the link's expiry (`data-kp-qr-expires`): at that moment the code is drawn as expired and the event fires. @param {HTMLElement} root @param {QrState} st */
function timeExpiry(root, st) {
    window.clearTimeout(st.timer);
    const expires = root.getAttribute('data-kp-qr-expires');
    st.expired = false;
    if (!expires) return;
    const left = Date.parse(expires) - Date.now();
    if (left <= 0) st.expired = true;
    else if (left < TIMER_MAX_MS)
        st.timer = window.setTimeout(() => {
            st.expired = true;
            render(root);
            root.dispatchEvent(new CustomEvent(QR_EXPIRED_EVENT, { bubbles: true }));
        }, left);
}

/** Make the code, or say why not, and draw everything around it. @param {HTMLElement} root */
export function render(root) {
    ensureParts(root);
    const st = stateOf(root);
    const s = getStrings();
    const plate = /** @type {HTMLElement} */ (root.querySelector(':scope > .kp-qr__plate'));
    const caption = /** @type {HTMLElement} */ (root.querySelector(':scope > .kp-qr__caption'));
    const value = valueOf(root);
    if (st.mode !== attr(root, 'reveal', 'shown')) {
        st.mode = attr(root, 'reveal', 'shown');
        st.shown = st.mode !== 'click';
    }
    const size = attr(root, 'size', SIZE_DEFAULT);
    root.style.setProperty('--kp-qr-size', size === 'lg' ? SIZE_LG : size);
    timeExpiry(root, st);
    /** @type {QrShown} */
    let state = st.spec.state ?? (value === '' ? 'empty' : 'ready');
    if (st.card && state !== 'loading') {
        st.card.remove();
        st.card = null;
    }
    plate.replaceChildren();
    for (const name of PLATE_ATTRIBUTES) plate.removeAttribute(name);
    root.toggleAttribute('aria-busy', state === 'loading');
    /** @type {ReturnType<typeof qrMatrix> | null} */
    let matrix = null;
    if (state === 'ready' && !st.expired) {
        const level = attr(root, 'ecc', 'M');
        matrix = qrMatrix(value, /** @type {any} */ (QR_LEVELS.includes(level) ? level : 'M'));
        if ('error' in matrix) {
            state = 'error';
            st.spec = { ...st.spec, message: st.spec.message ?? s.qrTooLongTitle };
        }
    }
    if (st.expired && value !== '') state = 'expired';
    root.setAttribute('data-kp-state', state);
    const hidden = state === 'ready' && !st.shown;
    const drawn = state === 'ready' && matrix !== null && !('error' in matrix) && !hidden;
    if (drawn && matrix && !('error' in matrix)) drawCode(root, plate, caption, matrix, st, s);
    else renderStandIn(root, plate, state, hidden, st, s);
    const full = renderCaption(root, caption, value, state, st);
    renderActions(root, value, full, state, drawn, hidden, st, s);
    renderWarn(root, new TextEncoder().encode(value).length, state, s);
}

/**
 * The code on the plate, named and described by the caption; a new link is announced once.
 * @param {HTMLElement} root @param {HTMLElement} plate @param {HTMLElement} caption @param {{ size: number, rows: boolean[][] }} matrix @param {QrState} st @param {Strings} s
 */
function drawCode(root, plate, caption, matrix, st, s) {
    plate.append(attr(root, 'render', 'svg') === 'canvas' ? drawCanvas(root, matrix) : drawSvg(root, matrix));
    plate.setAttribute('role', 'img');
    plate.setAttribute('tabindex', '0');
    plate.setAttribute('aria-label', attr(root, 'label', s.qrLabel));
    plate.setAttribute('aria-describedby', caption.id);
    plate.setAttribute('data-kp-qr-look', palette(root).look);
    const value = valueOf(root);
    if (st.said !== value) {
        st.said = value;
        say(root, s.qrReady);
    }
}

/**
 * What stands in the code's place at its size: the cover of a hidden code, the busy card, or the empty, expired or failed plate.
 * @param {HTMLElement} root @param {HTMLElement} plate @param {QrShown} state @param {boolean} hidden @param {QrState} st @param {Strings} s
 */
function renderStandIn(root, plate, state, hidden, st, s) {
    if (hidden) {
        const cover = statePlate(document, { kind: 'empty', title: s.qrHidden, actionLabel: s.qrShow, actionAttribute: 'data-kp-qr-show' });
        cover.classList.add('kp-qr__cover');
        plate.append(cover);
    } else if (state === 'loading') {
        plate.append(el('kp-qr__wait'));
        st.card = openBusyCard(plate, { words: s.qrLoading, area: () => [plate], className: 'kp-qr__busy', arrive: false });
    } else if (state === 'empty') {
        plate.append(statePlate(document, { kind: 'empty', title: s.qrEmptyTitle, text: s.qrEmptyText }));
    } else if (state === 'expired') {
        const p = statePlate(document, { kind: 'error', title: s.qrExpired, text: s.qrExpiredText });
        p.classList.add('kp-qr__expired');
        plate.append(p);
    } else {
        const retry = root.hasAttribute('data-kp-qr-retry') ? s.qrRetry : undefined;
        const title = st.spec.message ?? s.qrTooLongTitle;
        plate.append(statePlate(document, { kind: 'error', title, text: s.qrTooLongText, actionLabel: retry, actionAttribute: 'data-kp-qr-retry-action' }));
    }
}

/**
 * The caption: the link as text, wrapping at any character; it keeps its height in every state. A very long link is folded
 * (never cut for good): the first QR_FOLD characters and "Show all N characters"; Copy copies the whole. Returns the full text.
 * @param {HTMLElement} root @param {HTMLElement} caption @param {string} value @param {QrShown} state @param {QrState} st
 */
function renderCaption(root, caption, value, state, st) {
    const mode = attr(root, 'caption', 'link');
    caption.hidden = mode === 'none';
    const full = mode === 'link' ? value : mode === 'none' ? '' : mode;
    const folded = full.length > QR_FOLD && !st.open;
    caption.textContent = folded ? full.slice(0, QR_FOLD) : full;
    caption.toggleAttribute('data-kp-qr-struck', state === 'expired');
    caption.toggleAttribute('data-kp-qr-empty', caption.textContent === '');
    if (state === 'loading') caption.textContent = '';
    return full;
}

/** @param {string} className @param {string} text */
function button(className, text) {
    const b = /** @type {HTMLButtonElement} */ (el(className, 'button'));
    b.type = 'button';
    b.textContent = text;
    return b;
}

/**
 * The actions: Copy, Show all / Show less, Download and Hide, as the options and the state allow.
 * @param {HTMLElement} root @param {string} value @param {string} full @param {QrShown} state @param {boolean} drawn @param {boolean} hidden @param {QrState} st @param {Strings} s
 */
function renderActions(root, value, full, state, drawn, hidden, st, s) {
    const actions = /** @type {HTMLElement} */ (root.querySelector(':scope > .kp-qr__actions'));
    actions.replaceChildren();
    const live = state === 'ready' || state === 'error';
    if (attr(root, 'copy', 'true') !== 'false') {
        const copy = button('kp-button kp-qr__copy', s.qrCopy);
        copy.setAttribute('data-kp-flash-words', `${s.qrCopied},${s.qrCopyFailed}`);
        copy.disabled = !live || value === '';
        if (copy.disabled) copy.setAttribute('data-kp-disabled-reason', value === '' ? s.qrNoLink : s.qrCopyOff);
        actions.append(copy);
    }
    if (full.length > QR_FOLD && state !== 'loading') {
        const more = button('kp-button kp-button--ghost kp-qr__more', st.open ? s.qrShowLess : s.qrShowAllChars(full.length));
        more.setAttribute('aria-expanded', String(st.open));
        actions.append(more);
    }
    const dl = attr(root, 'download', 'false');
    if ((dl === 'png' || dl === 'svg') && drawn && !hidden) {
        const b = button('kp-button kp-button--ghost kp-qr__download', dl === 'png' ? s.qrDownloadPng : s.qrDownloadSvg);
        b.setAttribute('data-kp-qr-download-as', dl);
        actions.append(b);
    }
    if (attr(root, 'reveal', 'shown') === 'click' && state === 'ready' && st.shown) actions.append(button('kp-button kp-button--ghost kp-qr__hide', s.qrHide));
    attachDisabledReasons(actions);
}

/** A long link warns; the code is still made. @param {HTMLElement} root @param {number} bytes @param {QrShown} state @param {Strings} s */
function renderWarn(root, bytes, state, s) {
    let warn = /** @type {HTMLElement | null} */ (root.querySelector(':scope > .kp-qr__warn'));
    const limit = Number(attr(root, 'max', String(DENSE_BYTES))) || DENSE_BYTES;
    if (state === 'ready' && bytes > limit) {
        if (!warn) {
            warn = el('kp-qr__warn', 'p');
            root.append(warn);
        }
        warn.textContent = s.qrDense(bytes);
    } else warn?.remove();
}
