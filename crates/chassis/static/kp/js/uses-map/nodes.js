// The nodes of the lines view: the card of each source and user, and the phone's list of the same words.

import { make, tagOf } from './dom.js';
import { namesOf } from './model.js';

/** @typedef {import('../uses-map.js').UsesNode} UsesNode */
/** @typedef {import('./model.js').UsesModel} UsesModel */

/** The count words under a source. @param {UsesModel} m @param {string[]} related */
const countWords = (m, related) => (related.length === 0 ? m.strings.usesNotUsed : (m.spec.countLabel?.(related.length) ?? m.strings.usesCount(related.length)));

/** What a node's card says to a screen reader. @param {UsesModel} m @param {UsesNode} node @param {'source' | 'user'} kind @param {string[]} related */
function cardWords(m, node, kind, related) {
    const { strings } = m;
    if (related.length === 0) return kind === 'source' ? strings.usesNodeUnused(node.label) : strings.usesNodeNothing(node.label);
    return kind === 'source'
        ? strings.usesNodeSource(node.label, related.length, namesOf(m, related, node.key, 'source'))
        : strings.usesNodeUser(node.label, namesOf(m, related, node.key, 'user'));
}

/** The label, sub line and count of a node's card. @param {UsesModel} m @param {UsesNode} node @param {'source' | 'user'} kind @param {string[]} related */
function cardText(m, node, kind, related) {
    const text = make(m.doc, 'span', 'kp-uses__text');
    const label = make(m.doc, 'span', 'kp-uses__label');
    label.textContent = node.label;
    text.append(label);
    if (node.sub) {
        const sub = make(m.doc, 'span', 'kp-uses__sub');
        sub.textContent = node.sub;
        text.append(sub);
    }
    if (kind === 'source' && m.countOn) {
        const count = make(m.doc, 'span', 'kp-uses__count');
        count.textContent = countWords(m, related);
        text.append(count);
    }
    return text;
}

/** The card button of a node. @param {UsesModel} m @param {UsesNode} node @param {'source' | 'user'} kind @param {string[]} related */
function cardOf(m, node, kind, related) {
    const card = /** @type {HTMLButtonElement} */ (make(m.doc, 'button', 'kp-uses__card'));
    card.type = 'button';
    card.tabIndex = -1;
    card.setAttribute('aria-pressed', String(m.memory.pin === node.key));
    card.setAttribute('aria-label', cardWords(m, node, kind, related));
    if (node.glyph) {
        const glyph = make(m.doc, 'span', 'kp-docglyph');
        glyph.setAttribute('data-kp-doc-kind', node.glyph);
        glyph.setAttribute('data-kp-size', 'sm');
        glyph.setAttribute('aria-hidden', 'true');
        card.append(glyph);
    }
    card.append(cardText(m, node, kind, related));
    return card;
}

/** One node of a column. @param {UsesModel} m @param {UsesNode} node @param {'source' | 'user'} kind */
export function nodeFor(m, node, kind) {
    const li = make(m.doc, 'li', 'kp-uses__node');
    li.setAttribute('data-key', node.key);
    li.setAttribute('data-side', kind);
    if (m.loading) {
        li.append(make(m.doc, 'span', 'kp-uses__card kp-skeleton'));
        li.setAttribute('aria-hidden', 'true');
        return li;
    }
    if (node.ghost) li.setAttribute('data-kp-ghost', '');
    if (node.tone) li.setAttribute('data-kp-tone', node.tone);
    const related = kind === 'source' ? (m.uses.get(node.key) ?? []) : (m.usedBy.get(node.key) ?? []);
    const card = cardOf(m, node, kind, related);
    li.append(card);
    if (node.href && !node.disabledReason) {
        const open = /** @type {HTMLAnchorElement} */ (make(m.doc, 'a', 'kp-uses__open'));
        open.href = node.href;
        open.tabIndex = -1;
        open.setAttribute('aria-label', m.strings.usesOpen(node.label));
        open.textContent = '↗';
        li.append(open);
    } else if (node.disabledReason) {
        card.setAttribute('data-kp-disabled-reason', node.disabledReason);
        li.setAttribute('data-kp-unavailable', '');
    }
    return li;
}

/** The head of one source in the phone's list. @param {UsesModel} m @param {UsesNode} source @param {string[]} related */
function groupHead(m, source, related) {
    const head = make(m.doc, 'p', 'kp-uses__group-head');
    const label = make(m.doc, 'span', 'kp-uses__label');
    label.textContent = source.label;
    head.append(label);
    if (source.sub) {
        const sub = make(m.doc, 'span', 'kp-uses__sub');
        sub.textContent = source.sub;
        head.append(sub);
    }
    if (m.countOn) {
        const count = make(m.doc, 'span', 'kp-uses__count');
        count.textContent = countWords(m, related);
        head.append(count);
    }
    return head;
}

/** One user chip of a source in the phone's list. @param {UsesModel} m @param {UsesNode} source @param {string} key */
function chipOf(m, source, key) {
    const user = m.byKey.get(key);
    const chip = make(m.doc, 'li', 'kp-uses__chip');
    const line = m.lineInfo.get(`${source.key}>${key}`);
    if (line?.tone) chip.setAttribute('data-kp-tone', line.tone);
    if (user?.href) {
        const a = /** @type {HTMLAnchorElement} */ (make(m.doc, 'a', 'kp-uses__chip-link'));
        a.href = user.href;
        a.textContent = user.label;
        chip.append(a);
    } else chip.append(user?.label ?? key);
    // The line's words follow the name, as on the map.
    if (line?.label) chip.append(tagOf(m.doc, 'kp-uses__chip-tag', line));
    return chip;
}

/** The phone's list: each source a card, its users as chips. The same words as the map. @param {UsesModel} m */
export function phoneList(m) {
    const list = make(m.doc, 'ul', 'kp-uses__list');
    list.setAttribute('role', 'list');
    if (m.loading) return list;
    for (const source of m.sources) {
        const related = m.uses.get(source.key) ?? [];
        const item = make(m.doc, 'li', 'kp-uses__group');
        if (source.ghost) item.setAttribute('data-kp-ghost', '');
        item.append(groupHead(m, source, related));
        if (related.length > 0) {
            const chips = make(m.doc, 'ul', 'kp-uses__chips');
            chips.setAttribute('role', 'list');
            for (const key of related) chips.append(chipOf(m, source, key));
            item.append(chips);
        }
        list.append(item);
    }
    return list;
}
