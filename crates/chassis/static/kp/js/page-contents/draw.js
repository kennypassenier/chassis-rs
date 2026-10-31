// Drawing the list: the title, the loading bars, and one item per entry, only when the entries changed.

import { ContentsSpy } from './spy.js';
import { getStrings } from '../strings.js';

/** @typedef {import('./core.js').ContentsEntry} ContentsEntry */

export class ContentsDraw extends ContentsSpy {
    /** One list item for an entry. @param {import('../page-contents.js').ContentsItem} item @param {HTMLElement} target @returns {ContentsEntry} */
    entryFor(item, target) {
        const doc = this.doc;
        const li = doc.createElement('li');
        li.className = 'kp-contents__item';
        li.dataset.kpLevel = String(item.level ?? 0);
        const link = doc.createElement('a');
        link.className = 'kp-contents__link';
        link.href = `#${item.id}`;
        const label = doc.createElement('span');
        label.className = 'kp-contents__label';
        label.textContent = item.label;
        link.append(label);
        if (item.count !== undefined && item.count !== '') {
            const count = doc.createElement('span');
            count.className = 'kp-contents__count';
            count.textContent = String(item.count);
            link.append(count);
        }
        li.append(link);
        return { item, target, link, li };
    }

    /** Read the entries again and draw them; unchanged entries only get a spy. */
    draw() {
        const nav = this.host;
        const next = this.read();
        const state = nav.getAttribute('data-kp-state');
        this.title.hidden = nav.getAttribute('data-kp-contents-title') === 'none';
        this.title.textContent = getStrings().contentsTitle;
        const signature = JSON.stringify(next.map((e) => [e.item.id, e.item.label, e.item.level ?? 0, e.item.count ?? '']));
        this.wait.hidden = state !== 'loading';
        nav.toggleAttribute('aria-busy', state === 'loading');
        nav.hidden = state !== 'loading' && next.length < this.least();
        if (nav.getAttribute('data-kp-contents-sig') === signature) {
            this.bindPane();
            return this.queueSpy();
        }
        nav.setAttribute('data-kp-contents-sig', signature);
        const entries = next.map(({ item, target }) => this.entryFor(item, target));
        this.setEntries(entries, null);
        this.list.replaceChildren(...entries.map((e) => e.li));
        this.bindPane();
        this.queueSpy();
    }
}
