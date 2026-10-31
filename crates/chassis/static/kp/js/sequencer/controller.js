// One sequencer: built, painted, and answering its zoom, its link actions, its keys, pointers, focus and wheel.
import { resolveStrings } from '../strings.js';
import { watchOptions } from '../live-options.js';
import { Controller } from '../controller.js';
import { announce, readOptions, sequencers } from './instance.js';
import { build } from './build.js';
import { sequencerClampZoom } from './timeline.js';
import { paint } from './paint.js';
import { afterLayout, select, setZoom } from './edit.js';
import { cancelEdit, startLink, stopLink, unlink } from './drag.js';
import { onKey } from './keyboard.js';
import { onCancel, onDown, onMove, onUp } from './pointer.js';
/** @typedef {import('./instance.js').SequencerModel} SequencerModel */
/** @typedef {import('./units.js').SequencerAttachOptions} SequencerAttachOptions */

/** One press of Zoom in multiplies the zoom by this. */
const ZOOM_IN = 1.25;
/** One press of Zoom out multiplies the zoom by this. */
const ZOOM_OUT = 0.8;
/** How strongly a ctrl+wheel delta zooms: the zoom is multiplied by exp(-deltaY * this). */
const WHEEL_ZOOM = 0.01;
/** The options drawn again at once when they change at run time. */
const LIVE_OPTIONS = [
    'data-kp-sequencer-unit',
    'data-kp-sequencer-snap',
    'data-kp-sequencer-snap-items',
    'data-kp-sequencer-overlap',
    'data-kp-sequencer-lanes',
    'data-kp-sequencer-editable',
    'data-kp-sequencer-span',
    'data-kp-sequencer-toolbar',
    'data-kp-sequencer-hint',
    'data-kp-sequencer-zoom',
];

/** One sequencer: its model is the `sequencers` registry entry the setters read; the last plot width sits on the instance. */
export class SequencerControl extends Controller {
    /** @param {HTMLElement} host @param {SequencerAttachOptions} [options] */
    constructor(host, options = {}) {
        super(host, options);
        /** The model build() lays in connect(); every part reads it. */
        this.c = /** @type {SequencerModel} */ (/** @type {unknown} */ (null));
        /** The plot width last laid out, so a resize that keeps it does nothing. */
        this.lastWidth = 0;
    }

    connect() {
        const el = this.host;
        const c = (this.c = build(el, resolveStrings(/** @type {SequencerAttachOptions} */ (this.options).strings)));
        sequencers.set(el, c);
        // Registered first, so it runs last: the busy card closes and the setters lose the sequencer after everything else.
        this.own(() => {
            c.busy?.close();
            sequencers.delete(el);
        });
        readOptions(c);
        c.zoom = sequencerClampZoom(Number(el.dataset.kpSequencerZoom) || 1);
        const now = Number(el.dataset.kpSequencerNow);
        c.nowAt = el.dataset.kpSequencerNow !== undefined && Number.isFinite(now) ? now : null;
        if (el.dataset.kpState === 'loading') c.state = 'loading';
        paint(c);
        // Wired in the reverse of the old teardown order, so destroy() undoes them in that order.
        this.watchWidth();
        this.own(watchOptions(el, LIVE_OPTIONS, (names) => this.onOptions(names)));
        this.own(() => {
            window.clearTimeout(c.scrollTimer);
            window.cancelAnimationFrame(c.frameTimer);
        });
        this.wire();
    }

    /** The listeners, newest last: destroy() removes click first, the wheel last, as before. */
    wire() {
        const c = this.c;
        const el = this.host;
        this.listen(c.scroll, 'wheel', (e) => this.onWheel(/** @type {WheelEvent} */ (e)), { passive: false });
        this.listen(el, 'focusout', (e) => this.onFocusOut(/** @type {FocusEvent} */ (e)));
        this.listen(el, 'focusin', (e) => this.onFocusIn(/** @type {FocusEvent} */ (e)));
        this.listen(el, 'pointercancel', (e) => onCancel(c, /** @type {PointerEvent} */ (e)));
        this.listen(el, 'pointerup', (e) => onUp(c, /** @type {PointerEvent} */ (e)));
        this.listen(el, 'pointermove', (e) => onMove(c, /** @type {PointerEvent} */ (e)));
        this.listen(el, 'pointerdown', (e) => onDown(c, /** @type {PointerEvent} */ (e)));
        this.listen(el, 'keydown', (e) => onKey(c, /** @type {KeyboardEvent} */ (e)));
        this.listen(el, 'click', (e) => this.onClick(e));
    }

    /** Another plot width lays the bars out again on the next frame, unless a drag is moving them. */
    watchWidth() {
        const c = this.c;
        if (typeof ResizeObserver === 'undefined') return;
        c.observer = this.observe(
            new ResizeObserver(() => {
                const width = c.plot.clientWidth;
                if (width === this.lastWidth) return;
                this.lastWidth = width;
                window.cancelAnimationFrame(c.frameTimer);
                c.frameTimer = window.requestAnimationFrame(() => {
                    if (!c.press?.moved) afterLayout(c);
                });
            }),
        );
        c.observer.observe(c.plot);
    }

    /** An option changed at run time: read them again and paint, unless an edit is in progress. @param {string[]} names */
    onOptions(names) {
        const c = this.c;
        readOptions(c);
        if (names.includes('data-kp-sequencer-zoom')) c.zoom = sequencerClampZoom(Number(this.host.dataset.kpSequencerZoom) || 1);
        if (!c.press && !c.kb) {
            c.tickKey = '';
            paint(c);
        }
    }

    /** A zoom button, a link action, or a press on the empty track that lets go of the selection. @param {Event} e */
    onClick(e) {
        const c = this.c;
        const target = /** @type {HTMLElement} */ (e.target);
        const zoomButton = target.closest?.('[data-kp-sequencer-zoom]');
        if (zoomButton instanceof HTMLElement) return this.pressZoom(zoomButton);
        const action = target.closest?.('[data-kp-sequencer-action]');
        if (action instanceof HTMLElement && c.selected) {
            const which = action.dataset.kpSequencerAction;
            if (which === 'link') startLink(c, c.selected);
            else if (which === 'unlink') unlink(c, c.selected);
            else if (which === 'cancel') stopLink(c);
            return;
        }
        if (!target.closest?.('.kp-sequencer__item') && target.closest?.('.kp-gantt__track, .kp-gantt__lane, .kp-sequencer__items')) {
            if (c.linking) stopLink(c);
            else select(c, null);
        }
    }

    /** @param {HTMLElement} zoomButton */
    pressZoom(zoomButton) {
        const c = this.c;
        if (zoomButton.getAttribute('aria-disabled') === 'true') return;
        const key = zoomButton.dataset.kpSequencerZoom;
        if (setZoom(c, key === 'fit' ? 1 : c.zoom * (key === 'in' ? ZOOM_IN : ZOOM_OUT)))
            announce(c, `${c.strings.sequencerZoomLabel} ${c.strings.sequencerZoomValue(Math.round(c.zoom * 100))}`);
    }

    /** A bar that takes the focus is the selection and the tab stop. @param {FocusEvent} e */
    onFocusIn(e) {
        const c = this.c;
        const bar = /** @type {HTMLElement} */ (e.target).closest?.('.kp-sequencer__item');
        if (bar instanceof HTMLElement && bar.dataset.kpId && !c.press) {
            c.focusId = bar.dataset.kpId;
            select(c, bar.dataset.kpId);
        }
    }

    /** A bar picked up with the keyboard is put back when the focus leaves the sequencer. @param {FocusEvent} e */
    onFocusOut(e) {
        const c = this.c;
        const bar = /** @type {HTMLElement} */ (e.target).closest?.('.kp-sequencer__item');
        if (c.kb && bar instanceof HTMLElement && bar.dataset.kpId === c.kb.id && !c.el.contains(/** @type {Node | null} */ (e.relatedTarget)))
            cancelEdit(c, 'blur');
    }

    /** ctrl+wheel zooms around the pointer. @param {WheelEvent} e */
    onWheel(e) {
        if (!e.ctrlKey) return;
        e.preventDefault();
        setZoom(this.c, this.c.zoom * Math.exp(-e.deltaY * WHEEL_ZOOM), e.clientX);
    }
}
