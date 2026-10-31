// One contents list: built once, redrawn when the page's headings or its own options change, following the reader, and taking them to a section.

import { PAGE_ATTRIBUTES, OPTION_ATTRIBUTES, PANE_OFFSET_FRACTION, WAIT_BARS } from './values.js';
import { ContentsDraw } from './draw.js';
import { getStrings } from '../strings.js';

export class ContentsList extends ContentsDraw {
    /**
     * @param {HTMLElement} host the nav
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        /** What the page gets back, the same object every time. @type {import('../page-contents.js').ContentsHandle} */
        this.handle = {
            current: () => this.current,
            refresh: () => this.draw(),
            setItems: (items) => {
                this.setGiven(items ? [...items] : null);
                this.draw();
            },
        };
    }

    connect() {
        const { host, view } = this;
        const id = this.ensureId();
        host.classList.add('kp-contents');
        if (!host.hasAttribute('aria-label') && !host.hasAttribute('aria-labelledby')) host.setAttribute('aria-label', getStrings().contentsLabel);
        this.build(id);
        // Registered first, so it runs last on detach: the list is emptied.
        this.own(() => {
            host.replaceChildren();
            host.removeAttribute('data-kp-contents-sig');
        });
        this.listen(host, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(view, 'scroll', this.onScroll, { passive: true });
        this.listen(view, 'resize', this.onScroll);
        this.observe(
            new view.MutationObserver((records) => {
                if (records.some((r) => !host.contains(r.target))) queueMicrotask(() => this.draw());
            }),
        ).observe(this.scope(), { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: PAGE_ATTRIBUTES });
        this.observe(new view.MutationObserver(() => this.draw())).observe(host, { attributes: true, attributeFilter: OPTION_ATTRIBUTES });
        this.own(() => this.pane?.removeEventListener('scroll', this.onScroll));
        this.draw();
        this.own(() => view.cancelAnimationFrame(this.raf));
    }

    /** The title, the list and the loading bars. @param {string} id */
    build(id) {
        const { title, list, wait } = this;
        title.className = 'kp-contents__title';
        title.id = `${id}-title`;
        list.className = 'kp-contents__list';
        wait.className = 'kp-contents__wait';
        wait.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < WAIT_BARS; i += 1) {
            const bone = this.doc.createElement('span');
            bone.className = 'kp-skeleton kp-contents__bone';
            wait.append(bone);
        }
        this.host.replaceChildren(title, list, wait);
    }

    /** Scroll to a section: in its pane when it has one (the page does not move), else the page. @param {import('./core.js').ContentsEntry} hit */
    scrollTo(hit) {
        const own = this.scroller();
        if (own) {
            // The sections scroll in a pane: move the pane (never the page) so the section's top lands on the offset line.
            const gap =
                hit.target.getBoundingClientRect().top -
                own.getBoundingClientRect().top -
                Math.min(this.offset(), own.clientHeight / PANE_OFFSET_FRACTION);
            own.scrollTo({ top: Math.max(0, own.scrollTop + gap), behavior: this.motion() });
        } else hit.target.scrollIntoView({ behavior: this.motion(), block: 'start' });
    }

    /** A press on an entry: scroll there, focus the heading, write the address, mark it. @param {MouseEvent} event */
    onClick(event) {
        const link = event.target instanceof Element ? event.target.closest('.kp-contents__link') : null;
        if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const hit = this.entries.find((e) => e.link === link);
        if (!hit) return;
        event.preventDefault();
        this.scrollTo(hit);
        if (!hit.target.hasAttribute('tabindex') && !hit.target.matches('a[href], button, input, select, textarea, summary'))
            hit.target.tabIndex = -1;
        hit.target.focus({ preventScroll: true });
        if (this.host.getAttribute('data-kp-contents-hash') !== 'off') {
            try {
                this.view.history.replaceState(this.view.history.state, '', `#${hit.item.id}`);
            } catch {
                /* a sandboxed frame keeps the address as it is */
            }
        }
        this.mark(hit.item.id);
    }
}
