// One open viewer: its dialog and the way it closes, its texts, its actions, its stage and the states of the stage.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { openBusyCard } from '../busy-card.js';
import { registerShortcuts } from '../shortcuts.js';
import { attachDisabledReasons } from '../reason.js';
import { drawActions } from './actions.js';
import { buildPlate } from './plate.js';
import { buildViewerParts } from './parts.js';
import { VIEWER_CLOSE_EVENT } from './values.js';

/** @typedef {import('../viewer.js').ViewerOptions} ViewerOptions */

/** Gives each viewer its own id. */
let serial = 0;

/**
 * @typedef {object} ViewerGiven
 * @property {ViewerOptions} options what the page asked for
 * @property {Document} doc
 * @property {import('../strings.js').Strings} strings
 * @property {ReturnType<typeof buildViewerParts>} parts the elements built for it
 */

export class Viewer extends Controller {
    /**
     * @param {HTMLDialogElement} host the dialog
     * @param {ViewerGiven} given
     */
    constructor(host, given) {
        super(host, given);
        this.doc = given.doc;
        this.strings = given.strings;
        this.parts = given.parts;
        this.dialog = host;
        this.viewerOptions = given.options;
        /** @type {import('../busy-card.js').BusyCard | null} */
        this.card = null;
        this.current = 'ready';
        /** What the page gets back, the same object every time. @type {import('../viewer.js').ViewerHandle} */
        this.handle = this.buildHandle();
    }

    /** @returns {import('../viewer.js').ViewerHandle} */
    buildHandle() {
        const { dialog, stage, content, foot, title, desc, facts } = this.parts;
        return {
            dialog,
            stage,
            content,
            foot,
            setTitle: (text) => this.setText(title, text),
            setDesc: (text) => this.setText(desc, text),
            setFacts: (text) => this.setText(facts, text),
            setPosition: (at) => this.setPosition(at),
            setActions: (actions) => drawActions(this.doc, foot, actions, this.strings),
            setContent: (...nodes) => content.replaceChildren(...nodes),
            setState: (next, detail) => this.setState(next, detail),
            state: () => this.current,
            close: () => dialog.close(),
        };
    }

    connect() {
        const { dialog, stage, foot, title, desc, facts, close } = this.parts;
        const options = this.viewerOptions;
        this.doc.body.append(dialog);
        this.setText(title, options.title);
        this.setText(desc, options.desc ?? '');
        this.setText(facts, options.facts ?? '');
        drawActions(this.doc, foot, options.actions ?? [], this.strings);
        // Registered in the order the old close undid them, newest listeners first: the busy card goes last.
        this.own(() => this.card?.remove());
        this.own(attachDisabledReasons(dialog));
        // Keys that live while it is open.
        if (options.keys && options.keys.length > 0) this.own(registerShortcuts(dialog, options.keys, { dev: false }));
        this.listen(dialog, 'close', () => this.finish());
        this.listen(close, 'click', () => dialog.close());
        // A click on the dim behind (the dialog itself, not a child) closes.
        this.listen(dialog, 'click', (event) => {
            if (event.target === dialog) dialog.close();
        });
        dialog.showModal();
        // Back at the top, as every dialog opens.
        stage.scrollTop = 0;
    }

    /** @param {HTMLElement} node @param {string} text */
    setText(node, text) {
        node.textContent = text;
        node.hidden = text === '';
    }

    /** "4 of 37", exact, announced politely. @param {{ index: number, total: number } | null} at */
    setPosition(at) {
        const { position } = this.parts;
        if (!at) {
            position.hidden = true;
            position.textContent = '';
            return;
        }
        position.hidden = false;
        position.textContent = this.strings.viewerPosition(at.index, at.total);
    }

    /**
     * @param {'ready' | 'loading' | 'error' | 'unsupported'} next
     * @param {{ message?: string, retry?: () => void, title?: string }} [detail]
     */
    setState(next, detail = {}) {
        const { stage, plate } = this.parts;
        this.current = next;
        stage.setAttribute('data-kp-state', next);
        stage.toggleAttribute('aria-busy', next === 'loading');
        plate.replaceChildren();
        plate.hidden = next !== 'error' && next !== 'unsupported';
        if (next === 'loading') {
            if (!this.card) this.card = openBusyCard(stage, { words: this.strings.viewerLoading, area: () => [stage], className: 'kp-viewer__busy', arrive: false });
        } else if (this.card) {
            const closing = this.card;
            this.card = null;
            void closing.close();
        }
        if (next === 'error' || next === 'unsupported') plate.append(buildPlate(this.doc, next, detail, this.viewerOptions.actions ?? [], this.strings));
    }

    /** The dialog closed: everything it held goes, then the page hears and the focus goes back. */
    finish() {
        if (this.destroyed) return;
        this.destroy();
        this.dialog.remove();
        this.viewerOptions.onClose?.();
        this.doc.dispatchEvent(new CustomEvent(VIEWER_CLOSE_EVENT, { bubbles: true, detail: { dialog: this.dialog } }));
        const opener = this.viewerOptions.opener;
        const doc = this.doc;
        if (opener instanceof HTMLElement && opener.isConnected && doc.activeElement !== opener && (doc.activeElement === doc.body || doc.activeElement === null)) {
            opener.focus({ preventScroll: true });
        }
    }
}

/**
 * Build a viewer's dialog, wire it and open it; a wiring that throws is undone and thrown again.
 * @param {ViewerOptions} options
 */
export function launchViewer(options) {
    const doc = options.doc ?? document;
    const strings = getStrings();
    const parts = buildViewerParts(doc, `kp-viewer-${++serial}`, options, strings);
    const viewer = new Viewer(parts.dialog, { options, doc, strings, parts });
    try {
        viewer.connect();
    } catch (error) {
        viewer.destroy();
        throw error;
    }
    return viewer.handle;
}
