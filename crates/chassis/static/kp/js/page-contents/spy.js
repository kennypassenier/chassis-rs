// The scroll-spy: which entry is current as the reader scrolls, marked on the list, announced by an event, and followed in a pane of its own.

import { CONTENTS_EVENT, END_SLACK_PX } from './values.js';
import { currentSection } from './slug.js';
import { ContentsRead } from './read.js';

export class ContentsSpy extends ContentsRead {
    /** Mark an entry as the current one and say so when it changed. @param {string | null} next */
    mark(next) {
        const previous = this.current;
        this.setCurrent(next);
        for (const { item, link } of this.entries) {
            const on = item.id === next;
            link.toggleAttribute('data-kp-current', on);
            if (on) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
        }
        if (previous !== next && next !== null) {
            const hit = this.entries.find((e) => e.item.id === next);
            this.host.dispatchEvent(new CustomEvent(CONTENTS_EVENT, { bubbles: true, detail: { id: next, label: hit?.item.label ?? '', previous } }));
        }
    }

    /** Whether the page, or the pane the sections scroll in, is scrolled to its foot. @param {HTMLElement | null} own */
    atEnd(own) {
        const root = own ?? this.doc.scrollingElement ?? this.doc.documentElement;
        return own
            ? own.scrollTop + own.clientHeight >= own.scrollHeight - END_SLACK_PX && own.scrollTop > 0
            : root.scrollTop + this.view.innerHeight >= root.scrollHeight - END_SLACK_PX && root.scrollTop > 0;
    }

    /** Find the current section from the boxes of the sections and mark it. */
    spy() {
        this.setFrame(0);
        if (!this.entries.length) return;
        this.bindPane();
        const own = this.scroller();
        const edge = own ? own.getBoundingClientRect().top : 0;
        const at = currentSection(
            this.entries.map((e) => {
                const box = e.target.getBoundingClientRect();
                return { top: box.top - edge, bottom: box.bottom - edge };
            }),
            this.offset(),
            this.atEnd(own),
        );
        this.mark(at < 0 ? (this.entries[0]?.item.id ?? null) : this.entries[at].item.id);
    }

    /** Ask for a spy on the next frame. */
    queueSpy() {
        if (!this.raf) this.setFrame(this.view.requestAnimationFrame(() => this.spy()));
    }

    /** A pane with its own scroll: its scroll does not bubble to the window, so it is listened to itself (and again when the sections move to another pane). */
    bindPane() {
        const next = this.scroller();
        if (next === this.pane) return;
        this.pane?.removeEventListener('scroll', this.onScroll);
        this.setPane(next);
        this.pane?.addEventListener('scroll', this.onScroll, { passive: true });
    }
}
