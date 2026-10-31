// The lines of a drawn map: one path per relation, the words that stand on some of them, and where both are placed.

import { SVG_NS, tagOf } from './dom.js';
import { usesPath } from './relation.js';

/** @typedef {import('./model.js').UsesModel} UsesModel */

/** The share of the gap between the columns a line's plate may fill, and the room it leaves at its edges [px]. */
const TAG_GAP_SHARE = 0.72;
const TAG_GAP_MARGIN = 8;
/** The clear room kept around a plate so two never touch [px]. */
const TAG_EDGE = 3;
/** Where along its line a plate tries to stand, as a share of the line's length, in order. */
const TAG_ALONG = [0.5, 0.44, 0.56, 0.38, 0.62];

/** @typedef {{ l: number, r: number, t: number, b: number }} Held */

export class UsesLines {
    /** @param {UsesModel} m @param {HTMLElement} root @param {Element} svg */
    constructor(m, root, svg) {
        this.m = m;
        this.root = root;
        this.svg = svg;
        /** @type {Map<string, SVGPathElement[]>} */
        this.lines = new Map();
        /** The words on the lines that have some, by `"<source>><user>"` [r3r5-1019 line-tone]. @type {Map<string, HTMLElement>} */
        this.tags = new Map();
    }

    /** One path per line, made once, and the plate of each line that has words. */
    build() {
        const { m } = this;
        for (const [source, keys] of m.uses) {
            for (const key of keys) {
                const path = /** @type {SVGPathElement} */ (m.doc.createElementNS(SVG_NS, 'path'));
                path.setAttribute('class', 'kp-uses__line');
                path.setAttribute('data-source', source);
                path.setAttribute('data-user', key);
                if (m.byKey.get(source)?.dashed) path.setAttribute('data-kp-dashed', '');
                const info = m.lineInfo.get(`${source}>${key}`);
                if (info?.tone) path.setAttribute('data-kp-tone', info.tone);
                this.svg.append(path);
                this.lines.set(`${source}>${key}`, [path]);
                if (info?.label) this.addTag(`${source}>${key}`, source, key, info);
            }
        }
    }

    /** @param {string} pair @param {string} source @param {string} key @param {import('../uses-map.js').UsesLine} info */
    addTag(pair, source, key, info) {
        const tag = tagOf(this.m.doc, 'kp-uses__tag', info);
        tag.setAttribute('aria-hidden', 'true');
        tag.setAttribute('data-source', source);
        tag.setAttribute('data-user', key);
        this.root.append(tag);
        this.tags.set(pair, tag);
    }

    /** @param {string} key @returns {Element | null | undefined} the card of a node */
    cardOfKey(key) {
        return this.root.querySelector(`.kp-uses__node[data-key="${CSS.escape(key)}"]`)?.querySelector('.kp-uses__card');
    }

    /** Draw every path between its two cards, then the plates. */
    place() {
        const { root, svg, m } = this;
        if (root.hidden) return;
        const box = root.getBoundingClientRect();
        svg.setAttribute('width', String(box.width));
        svg.setAttribute('height', String(box.height));
        svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
        for (const [source, keys] of m.uses) {
            const a = this.cardOfKey(source)?.getBoundingClientRect();
            if (!a) continue;
            for (const key of keys) this.placePath(box, a, source, key);
        }
        this.placeTags(box);
    }

    /** @param {DOMRect} box @param {DOMRect} a the source's card @param {string} source @param {string} key */
    placePath(box, a, source, key) {
        const b = this.cardOfKey(key)?.getBoundingClientRect();
        const path = this.lines.get(`${source}>${key}`)?.[0];
        if (!b || !path) return;
        const leftToRight = a.left < b.left;
        const x1 = (leftToRight ? a.right : a.left) - box.left;
        const x2 = (leftToRight ? b.left : b.right) - box.left;
        path.setAttribute('d', usesPath(this.m.shape, x1, a.top + a.height / 2 - box.top, x2, b.top + b.height / 2 - box.top));
    }

    /**
     * The words of each line stand on the line, inside the gap between the columns (never over a card): the plate is as wide as the
     * gap allows and its words wrap, and it moves along its line to a place that no other plate holds. One that finds no place is
     * shown only while its line is lit [r3r5-1019 line-tone].
     * @param {DOMRect} box
     */
    placeTags(box) {
        if (this.tags.size === 0) return;
        const colA = this.root.querySelector('.kp-uses__col--sources')?.getBoundingClientRect();
        const colB = this.root.querySelector('.kp-uses__col--users')?.getBoundingClientRect();
        if (!colA || !colB) return;
        const gap = Math.abs(colA.left < colB.left ? colB.left - colA.right : colA.left - colB.right);
        this.root.style.setProperty('--kp-uses-tag-max', `${Math.max(0, gap * TAG_GAP_SHARE - TAG_GAP_MARGIN).toFixed(1)}px`);
        /** @type {Held[]} */
        const held = [];
        for (const [pair, tag] of this.tags) {
            const path = this.lines.get(pair)?.[0];
            const length = path?.getTotalLength?.() ?? 0;
            if (!path || !(length > 0)) {
                tag.setAttribute('data-kp-uses-unplaced', '');
                continue;
            }
            this.placeTag(tag, path, length, held);
        }
    }

    /** @param {HTMLElement} tag @param {SVGPathElement} path @param {number} length @param {Held[]} held */
    placeTag(tag, path, length, held) {
        const w = tag.offsetWidth;
        const h = tag.offsetHeight;
        let found = false;
        for (const along of TAG_ALONG) {
            const at = path.getPointAtLength(length * along);
            const rect = { l: at.x - w / 2 - TAG_EDGE, r: at.x + w / 2 + TAG_EDGE, t: at.y - h / 2 - TAG_EDGE, b: at.y + h / 2 + TAG_EDGE };
            if (held.some((o) => rect.l < o.r && rect.r > o.l && rect.t < o.b && rect.b > o.t)) continue;
            tag.style.setProperty('left', `${at.x.toFixed(1)}px`);
            tag.style.setProperty('top', `${at.y.toFixed(1)}px`);
            held.push(rect);
            found = true;
            break;
        }
        if (!found) {
            // No free place: it stands at the middle of its line, shown while the line is lit.
            const at = path.getPointAtLength(length / 2);
            tag.style.setProperty('left', `${at.x.toFixed(1)}px`);
            tag.style.setProperty('top', `${at.y.toFixed(1)}px`);
        }
        tag.toggleAttribute('data-kp-uses-unplaced', !found);
    }

    /** What is lit: a key and everything it touches, or nothing. @param {string | null} key */
    light(key) {
        const { m, root } = this;
        const hot = new Set();
        if (key) {
            hot.add(key);
            for (const k of m.uses.get(key) ?? []) hot.add(k);
            for (const k of m.usedBy.get(key) ?? []) hot.add(k);
        }
        m.el.toggleAttribute('data-kp-lit', key !== null);
        for (const [pair, [path]] of this.lines) path.toggleAttribute('data-kp-hot', key !== null && touches(pair, key));
        for (const node of root.querySelectorAll('.kp-uses__node')) {
            node.toggleAttribute('data-kp-hot', key !== null && hot.has(node.getAttribute('data-key')));
        }
        for (const [pair, tag] of this.tags) tag.toggleAttribute('data-kp-hot', key !== null && touches(pair, key));
    }

    /** Take the plates off the map. */
    dispose() {
        for (const tag of this.tags.values()) tag.remove();
    }
}

/** Whether the line `"<source>><user>"` ends at `key`. @param {string} pair @param {string} key */
const touches = (pair, key) => {
    const [s, u] = pair.split('>');
    return s === key || u === key;
};
