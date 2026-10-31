// The list view of the columns on a narrow screen.
import { getStrings } from '../strings.js';
import { openBusyCard } from '../busy-card.js';
import { allowed, columnFacts, editable, el, glyphOf, stateOf, wordOf } from './facts.js';
/** @typedef {import('./types.js').AvailabilityPerson} AvailabilityPerson */

/** The busy card over a loading by-column list. @type {WeakMap<Element, import('../busy-card.js').BusyCard>} */
const LIST_CARDS = new WeakMap();

/**
 * A loading list per column holds the data table's busy card, centred over the whole list; any other state holds none.
 * @param {HTMLElement} root @param {HTMLElement} body @param {boolean} on
 */
export function syncListCard(root, body, on) {
    const card = LIST_CARDS.get(root);
    if (!on) {
        if (card) {
            LIST_CARDS.delete(root);
            card.remove();
        }
        return;
    }
    const list = /** @type {HTMLElement | null} */ (body.querySelector(':scope > .kp-availability__columns'));
    if (!list) return;
    if (card) {
        if (card.layer.parentElement !== body) body.append(card.layer);
        card.place();
        return;
    }
    LIST_CARDS.set(
        root,
        openBusyCard(body, { words: getStrings().heatLoading, area: () => [list], className: 'kp-availability__busy', arrive: false }),
    );
}

/**
 * A list per column, the same data for a narrow screen. `waiting`: the rows stand without answers, for a loading state.
 * @param {HTMLElement} root @param {AvailabilityPerson[]} people @param {boolean} [waiting]
 */
export function columnsList(root, people, waiting = false) {
    const st = stateOf(root);
    const s = getStrings();
    const wrap = el('kp-availability__columns');
    if (waiting) {
        wrap.classList.add('kp-availability__columns--waiting');
        wrap.inert = true;
    }
    for (const c of st.set.columns) {
        const f = columnFacts(root, c.key);
        const sec = el('kp-availability__column', 'section');
        sec.setAttribute('data-col-key', c.key);
        const h = el('kp-availability__column-head', 'h4');
        h.textContent = c.sub ? `${c.label}, ${c.sub}` : c.label;
        const sum = el('kp-availability__column-sum', 'span');
        sum.textContent = s.availabilityCount(f.yes, f.total);
        sec.append(h, sum);
        const ul = el('kp-availability__column-list', 'ul');
        for (const p of people) {
            const li = el('kp-availability__column-row', 'li');
            const name = el('kp-availability__column-name', 'span');
            name.textContent = p.mine ? s.availabilityYou(p.name) : p.name;
            li.append(name);
            const a = st.set.answers[p.id]?.[c.key];
            if (editable(root, p.id, c.key)) {
                const group = el('kp-availability__column-answers');
                group.setAttribute('role', 'group');
                group.setAttribute('aria-label', s.availabilityCell(p.name, c.label, ''));
                for (const answer of allowed(root)) {
                    const b = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm kp-availability__pick', 'button'));
                    b.type = 'button';
                    b.setAttribute('data-person', p.id);
                    b.setAttribute('data-column', c.key);
                    b.setAttribute('data-answer', answer);
                    b.setAttribute('aria-pressed', String(a === answer));
                    b.textContent = `${glyphOf(answer)} ${wordOf(answer)}`;
                    group.append(b);
                }
                li.append(group);
            } else {
                const v = el('kp-availability__column-value', 'span');
                v.setAttribute('data-kp-availability-answer', a ?? 'none');
                v.textContent = `${glyphOf(a)} ${wordOf(a)}`.trim();
                li.append(v);
            }
            ul.append(li);
        }
        sec.append(ul);
        wrap.append(sec);
    }
    return wrap;
}
