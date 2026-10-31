// The quick info of one period (opt-in, `open: 'info'`): the theme's popover plate under the pressed cell.
import { attachHoverCards, HOVERCARD_ATTRIBUTE } from '../hovercard.js';
import { arriveShown, playClose, stopClose } from '../motion.js';
import { raiseOverlay, placeBlockSide } from '../top-layer.js';
import { Controller } from '../controller.js';
import { UPTIME_OPEN_EVENT } from './constants.js';
import { make } from './helpers.js';
import { fillPanel } from './panel.js';
import { SPECS, uptimeState } from './state.js';

/** Gap in px between the cell and the plate under it. */
const PLATE_GAP = 6;
/** Smallest distance in px between the plate and the window's edge. */
const WINDOW_MARGIN = 8;
/** Attribute that parks a cell's hover-card text while the quick info is open. */
const TIP_PARKED = 'data-kp-uptime-tip';

/** The panel, its anchor cell and the open state of one strip; the methods open, move and shut it. */
export class UptimeInfo extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The plate, made on the first opening. @type {HTMLElement | null} */
        this.panel = null;
        /** The cell the plate hangs under. @type {HTMLElement | null} */
        this.anchor = null;
        /** Lowers the plate from the top layer. @type {(() => void) | null} */
        this.lower = null;
        /** Whether the plate is open. */
        this.shown = false;
    }

    /** The hover cards of this strip rest while its quick info is open, and come back after. @param {boolean} on */
    tips(on) {
        for (const c of this.host.querySelectorAll('.kp-uptime__cell')) {
            const from = on ? TIP_PARKED : HOVERCARD_ATTRIBUTE;
            const to = on ? HOVERCARD_ATTRIBUTE : TIP_PARKED;
            const words = c.getAttribute(from);
            if (words === null) continue;
            c.setAttribute(to, words);
            c.removeAttribute(from);
        }
    }

    /** Under its cell, its start edge on the cell's, kept inside the strip and the window. @param {HTMLElement} p */
    place(p) {
        if (!this.anchor) return;
        const el = this.host;
        const box = this.anchor.getBoundingClientRect();
        const strip = el.getBoundingClientRect();
        const width = p.offsetWidth;
        const start = getComputedStyle(el).direction === 'rtl' ? box.right - width : box.left;
        const inStrip = Math.max(strip.left, Math.min(start, strip.right - width));
        const left = Math.max(WINDOW_MARGIN, Math.min(inStrip, el.ownerDocument.documentElement.clientWidth - width - WINDOW_MARGIN));
        p.style.setProperty('left', `${left}px`);
        p.style.setProperty('top', `${box.bottom + PLATE_GAP}px`);
        placeBlockSide(p, box);
    }

    /** The plate, made and inserted on first use. @returns {HTMLElement} */
    ensurePanel() {
        if (this.panel) return this.panel;
        const panel = make(this.host, 'div', 'kp-popover kp-uptime__info');
        panel.id = `kp-uptime-info-${(uptimeState.infoMade += 1)}`;
        panel.setAttribute('role', 'dialog');
        panel.hidden = true;
        this.host.append(panel);
        this.panel = panel;
        return panel;
    }

    /** Open the quick info of the period a cell stands for, or move it there. @param {HTMLElement} cell */
    openInfo(cell) {
        const el = this.host;
        const periods = SPECS.get(el)?.periods ?? [];
        const index = periods.findIndex((p) => p.key === cell.dataset.kpKey);
        if (index < 0) return;
        const panel = this.ensurePanel();
        const detail = { key: cell.dataset.kpKey, index, period: periods[index], panel };
        if (!el.dispatchEvent(new CustomEvent(UPTIME_OPEN_EVENT, { bubbles: true, cancelable: true, detail }))) return;
        fillPanel(el, panel, periods[index]);
        this.anchor?.setAttribute('aria-expanded', 'false');
        this.anchor = cell;
        cell.setAttribute('aria-expanded', 'true');
        cell.setAttribute('aria-controls', panel.id);
        if (this.shown) {
            this.place(panel);
            return;
        }
        this.show(panel);
    }

    /** First opening: the hover cards rest, the plate leaves hidden and goes up into the top layer. @param {HTMLElement} panel */
    show(panel) {
        this.shown = true;
        attachHoverCards(this.host.ownerDocument).hide();
        this.tips(false);
        stopClose(panel);
        panel.hidden = false;
        if (this.lower) this.place(panel);
        else {
            this.lower = raiseOverlay(panel, (p) => this.place(p));
            arriveShown(panel);
        }
    }

    /** @param {boolean} refocus @param {boolean} [now] shut at once, without the close (a redraw) */
    async closeInfo(refocus, now = false) {
        if (!this.shown || !this.panel) return;
        this.shown = false;
        const panel = this.panel;
        const cell = this.anchor;
        cell?.setAttribute('aria-expanded', 'false');
        if (!now) {
            const done = await playClose(panel);
            if (!done || this.shown || this.destroyed) return;
        }
        panel.hidden = true;
        this.lower?.();
        this.lower = null;
        stopClose(panel);
        this.tips(true);
        this.anchor = null;
        if (refocus && cell?.isConnected) cell.focus();
    }

    /** Shut the quick info at once and drop the plate: a redraw of the strip starts over. */
    reset() {
        void this.closeInfo(false, true);
        this.panel?.remove();
        this.panel = null;
    }
}
