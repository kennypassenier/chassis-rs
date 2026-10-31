// The avatar part of a mark [kpadopt5-people]: the status dot, how a screen reader hears the mark, and the photo that fades in over the letters.

import { getStrings } from '../strings.js';

/** The attributes of a mark that redraw it when they change. */
export const AVATAR_ATTRIBUTES = ['data-kp-idmark-hue', 'data-kp-idmark-src', 'data-kp-idmark-status', 'data-kp-idmark-alt', 'data-kp-idmark-loading'];

/** The statuses a mark can show. */
export const IDMARK_STATUSES = Object.freeze(['online', 'away', 'busy']);

/** Whether this call gave `aria-hidden` to the mark itself (a mark the markup hid keeps it). @type {WeakSet<Element>} */
const OWN_LABEL = new WeakSet();
/** The photo a mark last asked for. @type {WeakMap<Element, string>} */
const ASKED = new WeakMap();

/** A status dot with its word in the label: the mark becomes an image called "Ada, online". @param {HTMLElement} el @param {string} status */
function paintStatus(el, status) {
    el.querySelector(':scope > .kp-idmark__status')?.remove();
    if (status === 'none') return;
    const dot = el.ownerDocument.createElement('span');
    dot.className = 'kp-idmark__status';
    dot.setAttribute('data-kp-status', status);
    el.append(dot);
}

/** The mark's role and label: an image called by the name when it has a status or asks for it, hidden otherwise. @param {HTMLElement} el @param {string} name @param {string} status @param {string} alt */
function paintLabel(el, name, status, alt) {
    const strings = getStrings();
    const statusWord =
        status === 'none'
            ? ''
            : /** @type {Record<string, string>} */ ({ online: strings.idmarkOnline, away: strings.idmarkAway, busy: strings.idmarkBusy })[status];
    const speaks = name !== '' && (alt === 'name' || status !== 'none');
    if (speaks) {
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', statusWord ? strings.idmarkLabel(name, statusWord) : name);
        if (statusWord) el.title = strings.idmarkLabel(name, statusWord);
        el.removeAttribute('aria-hidden');
        OWN_LABEL.add(el);
    } else if (OWN_LABEL.has(el)) {
        el.removeAttribute('role');
        el.removeAttribute('aria-label');
        el.setAttribute('aria-hidden', 'true');
        OWN_LABEL.delete(el);
    }
}

/** The photo: the letters stay underneath until it has loaded; the plate's size is fixed, so nothing shifts. @param {HTMLElement} el @param {string} name @param {string} src */
function paintPhoto(el, name, src) {
    const doc = el.ownerDocument;
    el.querySelector(':scope > .kp-idmark__photo')?.remove();
    ASKED.set(el, src);
    if (src === '' || name === '') {
        el.removeAttribute('data-kp-photo');
        return;
    }
    const img = doc.createElement('img');
    img.className = 'kp-idmark__photo';
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.loading = el.getAttribute('data-kp-idmark-loading') === 'eager' ? 'eager' : 'lazy';
    /** @param {'loaded' | 'failed'} state */
    const settle = (state) => {
        if (ASKED.get(el) !== src) return;
        if (state === 'failed') img.remove();
        el.setAttribute('data-kp-photo', state);
        el.dispatchEvent(new CustomEvent('kp-idmark-photo', { bubbles: true, detail: { state, src } }));
    };
    img.addEventListener('load', () => settle('loaded'));
    img.addEventListener('error', () => settle('failed'));
    el.setAttribute('data-kp-photo', 'loading');
    img.src = src;
    el.prepend(img);
    if (img.complete && img.naturalWidth > 0) settle('loaded');
}

/**
 * The avatar part of a mark: its photo, its status dot and how a screen reader
 * hears it.
 * @param {HTMLElement} el @param {string} name
 */
export function decorateAvatar(el, name) {
    const src = (el.getAttribute('data-kp-idmark-src') ?? '').trim();
    const rawStatus = el.getAttribute('data-kp-idmark-status') ?? 'none';
    const status = IDMARK_STATUSES.includes(rawStatus) ? rawStatus : 'none';
    const alt = el.getAttribute('data-kp-idmark-alt') === 'name' ? 'name' : 'decorative';
    paintStatus(el, status);
    paintLabel(el, name, status, alt);
    paintPhoto(el, name, src);
}
