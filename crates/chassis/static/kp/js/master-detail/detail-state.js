// The detail pane's state: empty, loading, error or ready; its plates, its busy card and the watch that lets a component's own failed plate win [kyugaps-1019, KYU 54].

import { openBusyCard } from '../busy-card.js';
import { arriveShown } from '../motion.js';
import { statePlate } from '../state-plate.js';
import { getStrings } from '../strings.js';
import { OWN_FAILURE } from './constants.js';

/** The state of the detail pane of one layout. */
export class DetailState {
    /**
     * @param {HTMLElement} root
     * @param {HTMLElement} detail
     * @param {import('./parts.js').DetailParts} parts
     */
    constructor(root, detail, parts) {
        this.root = root;
        this.detail = detail;
        this.doc = root.ownerDocument;
        this.body = parts.body;
        this.stateBox = parts.stateBox;
        /** @type {import('../busy-card.js').BusyCard | null} */
        this.busy = null;
        /** @type {import('./constants.js').PaneState} */
        this.state = 'ready';
        this.drawn = false;
        /** The element the busy card lies on: the detail pane, or, where the detail is a closed sheet on a phone, the layout itself. @type {HTMLElement | null} */
        this.busyAt = null;
        this.busyWords = '';
        /** Stops the list's size being watched for the card laid on it. @type {() => void} */
        this.unwatchList = () => {};
        /** Stops the watch for a component's own failed plate. @type {() => void} */
        this.stopOwnWatch = () => {};
    }

    /** Whether the detail is on screen (not a closed sheet on a phone). */
    detailShown() {
        return this.detail.getBoundingClientRect().width > 0 && getComputedStyle(this.detail).display !== 'none';
    }

    /**
     * The loading look covers the data area that is on screen: the detail pane, and, where the detail is a closed sheet on a phone
     * (`display: none`, a card of 0 x 0 in it), the list, laid on the master-detail itself; the sheet opening moves it back
     * [kyugaps-1019, gap kyu 48].
     * @param {boolean} arrive
     */
    layBusy(arrive) {
        this.unwatchList();
        const root = this.root;
        const onDetail = this.detailShown();
        this.busyAt = onDetail ? this.detail : root;
        const lists = () => [...root.querySelectorAll(':scope > [data-kp-pane="list"]')].filter((pane) => pane.getBoundingClientRect().width > 0);
        const { body, stateBox, detail } = this;
        const card = openBusyCard(this.busyAt, {
            words: this.busyWords,
            area: () => (onDetail ? [body.hidden ? detail : stateBox.hidden ? body : stateBox] : lists()),
            className: 'kp-pane__busy',
            arrive,
        });
        // The list grows and shrinks as the panes fold (its arrival is animated): the card follows it.
        if (!onDetail && typeof ResizeObserver === 'function') {
            const watcher = new ResizeObserver(() => card.place());
            for (const pane of root.querySelectorAll(':scope > [data-kp-pane="list"]')) watcher.observe(pane);
            this.unwatchList = () => watcher.disconnect();
        }
        return card;
    }

    /** The loading look follows the pane that is on screen when the layout folds or the sheet opens or closes [kyugaps-1019]. */
    reseatBusy() {
        if (!this.busy || this.busyAt === (this.detailShown() ? this.detail : this.root)) return;
        this.busy.remove();
        this.busy = this.layBusy(false);
    }

    /** Whether a component in the detail body shows its own failed plate on screen. */
    ownFailure() {
        return [...this.body.querySelectorAll(OWN_FAILURE)].some((el) => el.getBoundingClientRect().width > 0);
    }

    /**
     * A failure asked for before the detail's own component drew its plate (js/code.js draws it after its busy card has closed) is
     * covered by the master-detail's plate at first. While the state reads `error` and no own plate stands, the body is watched:
     * when a component's own failed plate appears, the state is applied again and the master-detail's plate gives way [KYU 54].
     * @param {import('./constants.js').PaneStateOptions} options
     */
    watchOwn(options) {
        this.stopOwnWatch();
        if (typeof MutationObserver !== 'function') return;
        const seen = new MutationObserver(() => {
            if (this.state === 'error' && !this.root.hasAttribute('data-kp-error-own') && this.ownFailure()) this.setState('error', options);
        });
        seen.observe(this.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-kp-state', 'class', 'hidden'] });
        this.stopOwnWatch = () => {
            seen.disconnect();
            this.stopOwnWatch = () => {};
        };
    }

    /** The plate that says what an empty or failed detail needs. @param {import('./constants.js').PaneState} next @param {import('./constants.js').PaneStateOptions} options */
    plateFor(next, options) {
        const s = getStrings();
        if (next === 'empty') {
            return statePlate(this.doc, {
                kind: 'empty',
                title: options.title ?? s.paneEmpty,
                ...(options.text ? { text: options.text } : {}),
                ...(options.actionLabel ? { actionLabel: options.actionLabel } : {}),
                ...(options.onAction ? { onAction: options.onAction } : {}),
            });
        }
        return statePlate(this.doc, {
            kind: 'error',
            title: options.title ?? s.paneErrorTitle,
            text: options.text ?? s.paneErrorText,
            actionLabel: s.paneRetry,
            actionAttribute: 'data-kp-pane-retry',
        });
    }

    /** The marks the layout and its panes carry for a state. @param {import('./constants.js').PaneState} next @param {boolean} own */
    paintMarks(next, own) {
        const root = this.root;
        root.setAttribute('data-kp-state', next);
        root.toggleAttribute('data-kp-error-own', own);
        // A failure, and an empty master-detail with nothing in its list, cover the whole master-detail, list included
        // [states-two-1019]; an empty detail beside a list with items ("Pick an item on the left") stays in the detail pane, beside the
        // list it points at.
        const wide = (next === 'error' && !own) || (next === 'empty' && !root.querySelector('[data-kp-pane="list"] [data-kp-pane-key]'));
        root.toggleAttribute('data-kp-state-wide', wide);
        for (const pane of root.querySelectorAll(':scope > [data-kp-pane="list"], :scope > [data-kp-pane="aside"]')) pane.toggleAttribute('inert', wide);
        const loading = next === 'loading';
        this.body.toggleAttribute('inert', loading || next === 'empty' || (next === 'error' && !own));
        if (loading) this.body.setAttribute('aria-busy', 'true');
        else this.body.removeAttribute('aria-busy');
    }

    /** The busy card: laid when loading starts, closed when it ends. @param {boolean} loading @param {import('./constants.js').PaneStateOptions} options */
    paintBusy(loading, options) {
        if (loading) this.busyWords = options.words ?? getStrings().paneLoading;
        if (loading && !this.busy) {
            this.busy = this.layBusy(this.drawn);
        } else if (!loading && this.busy) {
            const card = this.busy;
            this.busy = null;
            this.busyAt = null;
            this.unwatchList();
            void card.close();
        }
    }

    /**
     * Set the detail pane's state. The detail pane keeps its place and size in every state.
     * @param {import('./constants.js').PaneState} next
     * @param {import('./constants.js').PaneStateOptions} [options]
     */
    setState(next, options = {}) {
        this.state = next;
        // A component of the detail that shows its own failure keeps its plate: the master-detail draws none over it.
        // (on screen: where the detail is a closed sheet on a phone its plate is 0 x 0, and the master-detail's plate is the one to read).
        const own = next === 'error' && this.ownFailure();
        if (next === 'error' && !own) this.watchOwn(options);
        else this.stopOwnWatch();
        this.paintMarks(next, own);
        if (next === 'empty' || (next === 'error' && !own)) {
            const plate = this.plateFor(next, options);
            this.stateBox.replaceChildren(plate);
            this.stateBox.hidden = false;
            if (this.drawn) arriveShown(plate);
        } else {
            this.stateBox.hidden = true;
            this.stateBox.replaceChildren();
        }
        this.paintBusy(next === 'loading', options);
        this.drawn = true;
    }

    /** Let go of the busy card and the watchers. */
    release() {
        this.busy?.remove();
        this.unwatchList();
        this.stopOwnWatch();
    }
}
