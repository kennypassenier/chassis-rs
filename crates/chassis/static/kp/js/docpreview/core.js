// One open preview's state: the options, the viewer, the group it steps through and where it is, the frame, and the load that is running.

import { Controller } from '../controller.js';
import { resolveLocale } from '../locale.js';
import { getStrings } from '../strings.js';
import { DEFAULT_ACTIONS } from './values.js';
import { plainFileName } from './kinds.js';

/** @typedef {import('../docpreview.js').PreviewOptions} PreviewOptions */
/** @typedef {import('../viewer.js').ViewerHandle} ViewerHandle */
/** @typedef {{ url: string, title?: string | undefined, name?: string | undefined }} PreviewEntry */

/** One load of one document: whether it is still the one that counts, and its timeout. A later load makes an earlier one stale. */
export class PreviewLoad {
    constructor() {
        this.live = true;
        /** The timeout's id, 0 for none. */
        this.timer = 0;
    }

    /** Stop counting: late answers of this load do nothing. */
    stop() {
        this.live = false;
        window.clearTimeout(this.timer);
    }
}

export class PreviewCore extends Controller {
    /**
     * @param {HTMLElement} host the viewer's dialog
     * @param {{ preview: PreviewOptions, viewer: ViewerHandle, group: PreviewEntry[] | null }} init
     */
    constructor(host, init) {
        super(host, init);
        this.preview = init.preview;
        this.viewer = init.viewer;
        this.group = init.group;
        this.doc = init.preview.doc ?? document;
        this.strings = getStrings();
        this.locale = resolveLocale(undefined, this.doc.documentElement);
        /** Where in the group the shown document is. */
        this.at = Math.max(0, Math.min(init.preview.index ?? 0, (init.group?.length ?? 1) - 1));
        /** @type {HTMLIFrameElement | null} */
        this.frame = null;
        /** @type {PreviewLoad | null} */
        this.current = null;
    }

    /** The document shown now. @returns {PreviewEntry} */
    entry() {
        return this.group ? this.group[this.at] : { url: this.preview.url, title: this.preview.title, name: this.preview.name };
    }

    /**
     * The foot's buttons for a document.
     * @param {string} url
     * @param {string} name
     * @returns {import('../viewer.js').ViewerAction[]}
     */
    actionsFor(url, name) {
        return (this.preview.actions ?? DEFAULT_ACTIONS).map((kind) => ({
            kind,
            href: url,
            name,
            ...(kind === 'print' ? { run: () => this.printFrame() } : {}),
        }));
    }

    /** The title of the document shown. @param {PreviewEntry} entry */
    titleOf(entry) {
        return entry.title ?? this.preview.title ?? plainFileName(entry.url);
    }

    /** Print the frame. */
    printFrame() {
        try {
            this.frame?.contentWindow?.focus();
            this.frame?.contentWindow?.print();
        } catch {
            // A frame from another origin cannot be printed from here; "Open in a new tab" is the way.
        }
    }

    /** Whether the foot has the button for an action. @param {string} kind */
    hasAction(kind) {
        return this.viewer.foot.querySelector(`[data-kp-viewer-action="${kind}"]`) !== null;
    }

    /** Press the foot's button for an action. @param {string} kind */
    pressAction(kind) {
        /** @type {HTMLElement | null} */ (this.viewer.foot.querySelector(`[data-kp-viewer-action="${kind}"]`))?.click();
    }

    /** Whether Print is offered and there is a frame to print. */
    canPrint() {
        return this.frame !== null && (this.preview.actions ?? []).includes('print');
    }

    /** Whether there is a document `by` places away in the group. @param {number} by */
    canStep(by) {
        return this.group !== null && this.at + by >= 0 && this.at + by < this.group.length;
    }

    /** Go to the document `by` places away in the group. @param {number} by */
    step(by) {
        if (!this.group || !this.canStep(by)) return;
        this.at += by;
        this.load();
    }

    /** Show the document at `at`. The run overrides it. */
    load() {}

    /** @param {HTMLIFrameElement | null} frame */
    setFrame(frame) {
        this.frame = frame;
    }

    /** Start a load: the one before it goes stale. @returns {PreviewLoad} */
    beginLoad() {
        this.stopLoad();
        this.current = new PreviewLoad();
        return this.current;
    }

    /** Stop the load that is running, if there is one. */
    stopLoad() {
        this.current?.stop();
    }

    /** The viewer was closed: stop loading, say so, and undo. */
    closed() {
        this.stopLoad();
        this.doc.dispatchEvent(new CustomEvent('kp-preview-close', { bubbles: true, detail: { url: this.entry().url } }));
        this.destroy();
    }
}
