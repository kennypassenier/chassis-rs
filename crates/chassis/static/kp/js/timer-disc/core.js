// One disc's options and its parts: what it reads from its attributes (again when they change), and the face, caption, line and status it builds.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { motionAllowed } from '../calm.js';
import { parseDuration, parseUntil, timerZone } from '../countdown.js';

export class DiscCore extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {{ now?: () => number, wall?: () => number }} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        this.s = getStrings();
        this.doc = host.ownerDocument;
        this.view = this.doc.defaultView ?? window;
        /** The device's date and time, which an `until` option is counted against. */
        this.wallNow = options.wall ?? (() => Date.now());
        this.seconds = 0;
        this.scaleSeconds = 0;
        this.name = '';
        this.disabled = false;
        this.bare = false;
        /** The moment the disc counts down to, epoch ms, when the `until` option names one. @type {number | null} */
        this.until = null;
        this.read();
        this.parts = this.buildParts();
    }

    /** The options, read again when an attribute changes. */
    read() {
        const el = this.host;
        const at = this.wallNow();
        this.until = parseUntil(el.dataset.kpTimerDiscUntil, at, timerZone(el, 'data-kp-timer-disc-timezone'));
        this.seconds = this.until !== null ? Math.max(0, Math.ceil((this.until - at) / 1000)) : parseDuration(el.dataset.kpTimerDisc);
        this.scaleSeconds = parseDuration(el.dataset.kpTimerDiscScale ? `${el.dataset.kpTimerDiscScale}m` : '') || 0;
        this.name = el.dataset.kpTimerDiscName ?? '';
        this.disabled = el.hasAttribute('data-kp-timer-disc-disabled');
        // A moment does not wait: counting down to one has no Start, Pause or Reset.
        this.bare = this.until !== null || el.dataset.kpTimerDiscControls === 'none';
    }

    /** Whether motion is off, so the edge steps instead of gliding. */
    still() {
        return !motionAllowed(this.doc);
    }

    /** The face with its sector, marks and hub, the caption, the status line and the spoken status. */
    buildParts() {
        const { doc } = this;
        const face = doc.createElement('div');
        face.className = 'kp-timer-disc__face';
        face.setAttribute('role', 'img');
        const sector = doc.createElement('span');
        sector.className = 'kp-timer-disc__sector';
        const marks = doc.createElement('span');
        marks.className = 'kp-timer-disc__marks';
        const hub = doc.createElement('span');
        hub.className = 'kp-timer-disc__hub';
        for (const part of [sector, marks, hub]) part.setAttribute('aria-hidden', 'true');
        face.append(sector, marks, hub);
        const caption = doc.createElement('p');
        caption.className = 'kp-timer-disc__caption';
        const line = doc.createElement('p');
        line.className = 'kp-timer-disc__status';
        const said = doc.createElement('span');
        said.className = 'kp-sr-only';
        said.setAttribute('role', 'status');
        return { face, caption, line, said };
    }
}
