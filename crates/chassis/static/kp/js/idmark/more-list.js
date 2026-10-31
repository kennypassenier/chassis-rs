// The "+N" button of a mark group and the list of the names it hides: a disclosure that closes on Escape or a press outside.

import { getStrings } from '../strings.js';
import { setIdmark } from './draw.js';

/** Numbers the lists of a page, for the id the button controls. */
let moreSeq = 0;

export class IdmarkMoreList {
    /**
     * @param {Document} doc
     * @param {readonly import('../idmark.js').IdmarkPerson[]} rest the people left out of the group
     * @param {{ round: boolean, colours: Map<string, number> }} look
     */
    constructor(doc, rest, look) {
        this.doc = doc;
        this.rest = rest;
        this.look = look;
        this.strings = getStrings();
        this.id = `kp-idmark-more-${++moreSeq}`;
        this.more = doc.createElement('button');
        this.panel = doc.createElement('div');
        /** A press outside the button and the list closes the list. @param {Event} event */
        this.away = (event) => {
            if (!(event.target instanceof Node) || (!this.panel.contains(event.target) && !this.more.contains(event.target))) this.close();
        };
    }

    /** The button and the hidden list, wired. @returns {HTMLElement[]} */
    build() {
        const { more, panel, rest, strings } = this;
        more.type = 'button';
        more.className = 'kp-idmark-group__more';
        more.textContent = `+${rest.length}`;
        more.setAttribute('aria-haspopup', 'true');
        more.setAttribute('aria-expanded', 'false');
        more.setAttribute('aria-controls', this.id);
        more.setAttribute('aria-label', strings.idmarkMore(rest.length));
        panel.className = 'kp-idmark-group__list';
        panel.id = this.id;
        panel.hidden = true;
        const heading = this.doc.createElement('p');
        heading.className = 'kp-idmark-group__list-title';
        heading.textContent = strings.idmarkMoreTitle(rest.length);
        panel.append(heading, this.names());
        more.addEventListener('click', () => this.toggle());
        panel.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.close();
                more.focus();
            }
        });
        more.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !panel.hidden) {
                event.stopPropagation();
                this.close();
            }
        });
        return [more, panel];
    }

    /** The names left out, each with its small mark. */
    names() {
        const { doc, look } = this;
        const ul = doc.createElement('ul');
        for (const person of this.rest) {
            const li = doc.createElement('li');
            const row = doc.createElement('span');
            row.className = 'kp-idmark-name';
            const mark = doc.createElement('span');
            mark.className = `kp-idmark kp-idmark--sm${look.round ? ' kp-idmark--round' : ''}`;
            mark.setAttribute('data-kp-idmark', person.name);
            if (person.src) mark.setAttribute('data-kp-idmark-src', person.src);
            mark.setAttribute('aria-hidden', 'true');
            setIdmark(mark, person.name, { slot: look.colours.get(person.name.trim()), title: false });
            const text = doc.createElement('span');
            text.textContent = person.name;
            row.append(mark, text);
            li.append(row);
            ul.append(li);
        }
        return ul;
    }

    toggle() {
        const open = this.panel.hidden;
        this.panel.hidden = !open;
        this.more.setAttribute('aria-expanded', String(open));
        if (open) this.doc.addEventListener('pointerdown', this.away, true);
        else this.doc.removeEventListener('pointerdown', this.away, true);
    }

    close() {
        this.panel.hidden = true;
        this.more.setAttribute('aria-expanded', 'false');
        this.doc.removeEventListener('pointerdown', this.away, true);
    }
}
