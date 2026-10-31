// A thread wired: drawn (or redrawn) from a spec, its options switchable by attribute at runtime, and its clicks: Add,
// Retry, Jump to the newest, a fold, Copy and the page's own actions.

import { getStrings } from '../strings.js';
import { OPTION_ATTRIBUTES, THREAD_ACTION_EVENT, THREAD_ADD_EVENT, THREAD_FOLD_EVENT, THREAD_RETRY_EVENT } from './options.js';
import { ThreadView } from './view.js';

/** @typedef {import('../thread.js').ThreadSpec} ThreadSpec */

/** How long Copy says "Copied" [ms]. */
const COPIED_MS = 1500;

export class ThreadControl extends ThreadView {
    connect() {
        const el = this.host;
        this.listen(el, 'click', (event) => this.onClick(event));
        this.watchOptions();
    }

    /** Draw (or redraw) from a spec; a loading spec lays the busy card, the next spec waits for it to close. @param {ThreadSpec} spec */
    set(spec) {
        const el = this.host;
        this.spec = spec;
        el.classList.add('kp-thread');
        el.setAttribute('data-kp-thread', el.getAttribute('data-kp-thread') ?? '');
        if ((spec.state ?? 'ready') === 'loading') {
            this.pending = null;
            return this.drawLoading(spec);
        }
        this.drawAfterCard(spec);
    }

    /**
     * Every option is switchable at runtime: change its attribute and the thread redraws. The attribute then wins over the
     * option the spec carried, so a page that set both keeps working [Kenny, 2026-10-17 22:09: "some things are options that
     * the component can give, like Long messages and Order"].
     */
    watchOptions() {
        const el = this.host;
        /** @type {Record<string, string | null>} */
        const seen = {};
        for (const name of Object.keys(OPTION_ATTRIBUTES)) seen[name] = el.getAttribute(name);
        this.observe(
            new MutationObserver((records) => {
                /** @type {Record<string, unknown>} */
                const spec = { ...this.spec };
                let changed = false;
                for (const record of records) {
                    const name = /** @type {keyof typeof OPTION_ATTRIBUTES} */ (record.attributeName);
                    if (!name || !(name in OPTION_ATTRIBUTES) || el.getAttribute(name) === seen[name]) continue;
                    seen[name] = el.getAttribute(name);
                    delete spec[OPTION_ATTRIBUTES[name]];
                    changed = true;
                }
                if (changed) this.set(/** @type {ThreadSpec} */ (spec));
            }),
        ).observe(el, { attributes: true, attributeFilter: Object.keys(OPTION_ATTRIBUTES) });
    }

    /** @param {Event} event */
    onClick(event) {
        const el = this.host;
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('[data-kp-thread-add]')) el.dispatchEvent(new CustomEvent(THREAD_ADD_EVENT, { bubbles: true }));
        const retry = target.closest('[data-kp-thread-retry]');
        if (retry) {
            const key = retry.closest('[data-kp-message]')?.getAttribute('data-kp-message');
            el.dispatchEvent(new CustomEvent(THREAD_RETRY_EVENT, { bubbles: true, detail: key ? { key } : {} }));
        }
        if (target.closest('.kp-thread__jump')) this.scrollToNewest(true);
        const item = /** @type {HTMLElement | null} */ (target.closest('[data-kp-message]'));
        const key = item?.getAttribute('data-kp-message');
        if (item && key) this.onMessageClick(target, item, key);
    }

    /** A click inside one message: its fold, Copy, or one of the page's actions. @param {Element} target @param {HTMLElement} item @param {string} key */
    onMessageClick(target, item, key) {
        const el = this.host;
        if (target.closest('.kp-thread__fold')) {
            const open = !this.expanded.has(key);
            if (open) this.expanded.add(key);
            else this.expanded.delete(key);
            this.applyFold(item, key);
            el.dispatchEvent(new CustomEvent(THREAD_FOLD_EVENT, { bubbles: true, detail: { key, expanded: open } }));
        }
        const copy = /** @type {HTMLElement | null} */ (target.closest('.kp-thread__copy'));
        if (copy) void copyText(copy, this.spec.messages?.find((m) => m.key === key)?.text ?? '');
        const act = target.closest('[data-kp-thread-act]');
        if (act) el.dispatchEvent(new CustomEvent(THREAD_ACTION_EVENT, { bubbles: true, detail: { key, id: act.getAttribute('data-kp-thread-act') } }));
    }
}

/** Copy the text; the button says so for a moment and keeps its width. @param {HTMLElement} button @param {string} text */
async function copyText(button, text) {
    const strings = getStrings();
    try {
        await button.ownerDocument.defaultView?.navigator.clipboard.writeText(text);
    } catch {
        // No clipboard (insecure page, refused): the button says nothing was copied.
        button.textContent = strings.threadCopyFailed;
        return;
    }
    const before = button.getAttribute('data-kp-label') ?? button.textContent ?? '';
    button.setAttribute('data-kp-label', before);
    button.style.minInlineSize = `${button.offsetWidth}px`;
    button.textContent = strings.copied;
    button.setAttribute('data-kp-copied', '');
    button.ownerDocument.defaultView?.setTimeout(() => {
        button.textContent = before;
        button.removeAttribute('data-kp-copied');
        button.style.minInlineSize = '';
    }, COPIED_MS);
}
