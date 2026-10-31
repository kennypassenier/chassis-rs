// One request inspector: its memory on the instance, its card and its states, the clicks (copy, show a secret, older,
// filter, send a test), the status filter, Retry, and a draw again when an option changes.

import { attachCardStates } from '../card-state.js';
import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { copy } from './copy.js';
import { MASK, REQUESTS_MAX, REQUESTS_RETRY_EVENT, REQUESTS_TEST_EVENT, readOptions } from './format.js';
import { draw, partsOf } from './list.js';

/** @typedef {import('./format.js').Memory} Memory */
/** @typedef {import('./format.js').InspectorOptions} InspectorOptions */

/** The options a page may change later. */
const OPTIONS = ['data-kp-secrets-in-copy', 'data-kp-requests-open', 'data-kp-copy-as', 'data-kp-secret-headers', 'data-kp-requests-max'];

export class RequestInspector extends Controller {
    /** @param {HTMLElement} el @param {InspectorOptions} [given] */
    constructor(el, given = {}) {
        super(el, given);
        const options = { ...readOptions(el), ...given };
        /** @type {Memory} */
        this.memory = { list: [], filter: 'all', shown: options.max ?? REQUESTS_MAX, opened: new Set(), closed: new Set(), options, given };
    }

    connect() {
        const el = this.host;
        partsOf(el);
        el.style.setProperty('--kp-card-stage-min', 'var(--kp-inspector-min, 22rem)');
        el.setAttribute('data-kp-state', el.getAttribute('data-kp-state') ?? 'loading');
        this.own(attachCardStates(el));
        draw(el, this.memory);
        const view = el.ownerDocument.defaultView;
        if (view && 'MutationObserver' in view) this.observe(new view.MutationObserver(() => draw(el, this.memory))).observe(el, { attributes: true, attributeFilter: OPTIONS });
        this.listen(el, 'click', (event) => this.onClick(event));
        this.listen(el, 'kp-segmented-change', (event) => this.onFilter(event));
        this.listen(el, 'kp-card-retry', () => el.dispatchEvent(new CustomEvent(REQUESTS_RETRY_EVENT, { bubbles: true })));
    }

    /** @param {Event} event */
    onClick(event) {
        const el = this.host;
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const copyButton = /** @type {HTMLButtonElement | null} */ (target.closest('[data-kp-requests-copy]'));
        if (copyButton) return void copy(el, this.memory, copyButton);
        const secret = /** @type {HTMLButtonElement | null} */ (target.closest('[data-kp-request-secret]'));
        if (secret) return this.flipSecret(secret);
        if (target.closest('[data-kp-requests-older]')) {
            this.memory.shown += this.memory.options.max ?? REQUESTS_MAX;
            return draw(el, this.memory);
        }
        const filter = /** @type {HTMLElement | null} */ (target.closest('[data-kp-requests-filter]'));
        if (filter) {
            this.memory.filter = filter.dataset.kpRequestsFilter ?? 'all';
            return draw(el, this.memory);
        }
        if (target.closest('[data-kp-requests-send]')) el.dispatchEvent(new CustomEvent(REQUESTS_TEST_EVENT, { bubbles: true }));
    }

    /** Show a secret header's value, or mask it again. @param {HTMLButtonElement} secret */
    flipSecret(secret) {
        const strings = getStrings();
        const text = /** @type {HTMLElement | null} */ (secret.previousElementSibling);
        const shown = secret.getAttribute('aria-pressed') !== 'true';
        secret.setAttribute('aria-pressed', String(shown));
        secret.textContent = shown ? strings.reqSecretHide : strings.reqSecretShow;
        if (!text) return;
        text.textContent = shown ? (text.dataset.value ?? '') : MASK;
        if (shown) text.removeAttribute('aria-label');
        else text.setAttribute('aria-label', strings.reqSecretMasked);
    }

    /** The code blocks inside have a segmented control of their own: only the status filter counts. @param {Event} event */
    onFilter(event) {
        if (!(event.target instanceof Element) || !event.target.closest('.kp-inspector__filter')) return;
        const detail = /** @type {CustomEvent<{ value: string | null }>} */ (event).detail;
        this.memory.filter = detail?.value ?? 'all';
        this.memory.shown = this.memory.options.max ?? REQUESTS_MAX;
        draw(this.host, this.memory);
    }
}
