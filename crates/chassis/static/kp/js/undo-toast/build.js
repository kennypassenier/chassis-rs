// The undo toast's settings, read from the options and the page's defaults, and the content it carries: the clock, the words and the sentence a screen reader hears once.

import { UNDO_MS } from '../patterns.js';
import { getStrings } from '../strings.js';
import { MS_PER_SECOND, UNDO_MAX } from './values.js';

/**
 * A default the page set on <html> or the toast region.
 * @param {string} name `ms`, `mode` …
 * @param {HTMLElement | null} region
 */
function declared(name, region) {
    const attr = `data-kp-undo-${name}`;
    return region?.getAttribute(attr) ?? (typeof document !== 'undefined' ? document.documentElement.getAttribute(attr) : null);
}

/**
 * What the toast does, from its options and the defaults the page declared.
 * @param {import('../undo-toast.js').UndoToastOptions} options
 */
export function readSettings(options) {
    const region = options.region ?? null;
    const msDeclared = declared('ms', region);
    const ms = Math.max(0, options.ms ?? (msDeclared !== null && msDeclared !== '' ? Number(msDeclared) : UNDO_MS));
    const mode = (options.mode ?? declared('mode', region)) === 'revert' ? 'revert' : 'defer';
    const clockRaw = options.clock ?? declared('clock', region);
    const clock = clockRaw === 'bar' || clockRaw === 'text' || clockRaw === 'none' ? clockRaw : 'ring';
    const keyRaw = options.key ?? declared('key', region);
    /** @type {string | false} */
    const key = keyRaw === false || keyRaw === 'false' ? false : String(keyRaw || 'Mod+Z');
    const leaveRaw = options.leave ?? declared('leave', region);
    const leaves = leaveRaw === 'commit' || leaveRaw === 'cancel' ? leaveRaw : 'carry';
    const max = Math.max(1, options.max ?? (Number(declared('max', region)) || UNDO_MAX));
    const seconds = Math.max(1, Math.round(ms / MS_PER_SECOND));
    return { region, ms, mode, clock, key, leaves, max, seconds };
}

/** The clock's ring: a track and a fill circle, drawn as an SVG. @param {Document} doc */
function buildRing(doc) {
    const ring = doc.createElement('span');
    ring.className = 'kp-undo__ringbox';
    ring.setAttribute('aria-hidden', 'true');
    const circles = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    circles.setAttribute('class', 'kp-undo__ring');
    circles.setAttribute('viewBox', '0 0 24 24');
    for (const part of ['track', 'fill']) {
        const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('class', `kp-undo__ring-${part}`);
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '10');
        circle.setAttribute('pathLength', '1');
        circles.append(circle);
    }
    ring.append(circles);
    return ring;
}

/**
 * The content: the clock, the words (and for a screen reader the sentence once), no markup to keep in step.
 * @param {Document} doc @param {string} text @param {ReturnType<typeof readSettings>} settings
 * @returns {{ body: HTMLElement, ring: HTMLElement | null, secs: HTMLElement | null, words: HTMLElement, said: HTMLElement }}
 */
export function buildBody(doc, text, { ms, clock, seconds }) {
    const strings = getStrings();
    const body = doc.createElement('span');
    body.className = 'kp-undo';
    const ring = clock === 'ring' ? buildRing(doc) : null;
    if (ring) body.append(ring);
    const words = doc.createElement('span');
    words.className = 'kp-undo__text';
    words.setAttribute('aria-hidden', 'true');
    words.textContent = text;
    const said = doc.createElement('span');
    said.className = 'kp-sr-only';
    said.textContent = ms > 0 ? strings.undoToastAnnounce(text, seconds) : text;
    body.append(words, said);
    /** @type {HTMLElement | null} */
    let secs = null;
    if (clock === 'text' || clock === 'ring') {
        secs = doc.createElement('span');
        secs.className = clock === 'ring' ? 'kp-undo__secs' : 'kp-undo__clock';
        secs.setAttribute('aria-hidden', 'true');
        secs.textContent = clock === 'ring' ? String(seconds) : strings.undoToastClock(seconds);
        if (ring) ring.append(secs);
        else body.append(secs);
    }
    if (clock === 'bar') {
        const bar = doc.createElement('span');
        bar.className = 'kp-undo__bar';
        bar.setAttribute('aria-hidden', 'true');
        body.append(bar);
    }
    return { body, ring, secs, words, said };
}
