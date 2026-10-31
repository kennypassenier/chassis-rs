// One diff view: its clicks (a file, all files, a fold, the rest of a long file, a path's copy, retry) and its live options.
import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { copyPath, fileOf, toggleFile } from './actions.js';
import { DIFF_EXPAND_EVENT, DIFF_RETRY_EVENT } from './constants.js';
import { fillBody } from './lines.js';
import { stateOf } from './model.js';
import { say } from './read.js';
import { render } from './render.js';

/** The diff attributes that redraw it when they change: every option is live. */
const LIVE = ['open', 'context', 'words', 'bar', 'copy', 'max-lines', 'label'].map((name) => `data-kp-diff-${name}`);

/** One diff: its state is the registry entry every part reads; the frame a redraw is queued for sits on the instance. */
export class DiffControl extends Controller {
    /** @param {HTMLElement} host */
    constructor(host) {
        super(host);
        this.st = stateOf(host);
        /** The animation frame a redraw waits for, 0 when none. */
        this.queued = 0;
    }

    connect() {
        const root = this.host;
        // Registered first, so it runs last: a queued redraw is dropped after the watch and the listener are gone.
        this.own(() => window.cancelAnimationFrame(this.queued));
        this.listen(root, 'click', (event) => this.onClick(event));
        // An option changed (its attribute): the diff is drawn again on the next frame, once for a batch of changes.
        this.observe(
            new MutationObserver(() => {
                window.cancelAnimationFrame(this.queued);
                this.queued = window.requestAnimationFrame(() => render(root));
            }),
        ).observe(root, { attributes: true, attributeFilter: LIVE });
        render(root);
    }

    /** @param {Event} event */
    onClick(event) {
        const root = this.host;
        const t = event.target instanceof Element ? event.target : null;
        if (!t) return;
        const toggle = t.closest('.kp-diffview__toggle');
        const all = t.closest('[data-kp-diff-all]');
        const fold = t.closest('.kp-diff__fold');
        const more = t.closest('[data-kp-diff-more]');
        const copy = t.closest('.kp-diffview__copy');
        if (toggle) {
            const path = toggle.closest('.kp-diffview__file')?.getAttribute('data-kp-diff-path') ?? '';
            toggleFile(root, path, toggle.getAttribute('aria-expanded') !== 'true');
        } else if (all instanceof HTMLButtonElement) this.toggleAll(all);
        else if (fold instanceof HTMLElement) this.toggleFold(fold);
        else if (more) this.showRest(more);
        else if (copy instanceof HTMLButtonElement) void copyPath(root, copy);
        else if (t.closest('[data-kp-diff-retry-action]')) root.dispatchEvent(new CustomEvent(DIFF_RETRY_EVENT, { bubbles: true }));
    }

    /** Expand or collapse every file that is not that way yet. @param {HTMLButtonElement} button */
    toggleAll(button) {
        if (button.disabled) return;
        const open = button.getAttribute('data-kp-diff-all') === 'expand';
        for (const section of this.host.querySelectorAll('.kp-diffview__file')) {
            const path = section.getAttribute('data-kp-diff-path') ?? '';
            if ((section.getAttribute('data-kp-diff-file-open') === 'true') !== open) toggleFile(this.host, path, open);
        }
    }

    /** Show or hide one run of unchanged lines, keep the focus on its fold, and say how many lines moved. @param {HTMLElement} fold */
    toggleFold(fold) {
        const { host: root, st } = this;
        const s = getStrings();
        const key = fold.getAttribute('data-kp-diff-fold-key') ?? '';
        const lines = Number(fold.getAttribute('data-kp-diff-fold-lines'));
        const path = key.split('|')[0];
        const open = !st.folds.has(key);
        if (open) st.folds.add(key);
        else st.folds.delete(key);
        const found = fileOf(root, path);
        if (!found) return;
        fillBody(root, st, found.file, /** @type {HTMLElement} */ (found.section.querySelector('.kp-diffview__body')));
        /** @type {HTMLElement | null} */ (root.querySelector(`[data-kp-diff-fold-key="${CSS.escape(key)}"]`))?.focus();
        say(root, open ? s.diffUnchangedShown(lines) : s.diffUnchangedHidden(lines));
        root.dispatchEvent(new CustomEvent(DIFF_EXPAND_EVENT, { bubbles: true, detail: { path, lines, open } }));
    }

    /** Draw the rest of a long file, past its line cap. @param {Element} more */
    showRest(more) {
        const { host: root, st } = this;
        const path = more.closest('.kp-diffview__file')?.getAttribute('data-kp-diff-path') ?? '';
        const found = fileOf(root, path);
        if (!found) return;
        st.all.add(path);
        const body = /** @type {HTMLElement} */ (found.section.querySelector('.kp-diffview__body'));
        fillBody(root, st, found.file, body);
        body.focus({ preventScroll: true });
    }
}
