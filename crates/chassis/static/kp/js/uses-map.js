// "Used by": sources on one side, the things that use them on the other, joined by lines [kpadopt6-media; JobTracker's reuse map].
//
// The same relation that `kp-matrix` (js/heat.js) draws as a grid, drawn as two columns with curved lines, so one glance shows what
// depends on what. It is not a new component but a second view of the matrix: `data-kp-view="lines"`, with the matrix's data (`rows` are
// the sources, `columns` the things that use them, `cell(row, column)` truthy is a line) and optional content per node:
//
//   setMatrix(el, {
//       view: 'lines',
//       rows:    [{ key: 'cv-nl', label: 'CV Developer NL', sub: 'generic master, made 06/2026', glyph: 'pdf', href: '/cv/nl' }, { key: 'none', label: 'No CV', ghost: true, dashed: true }],
//       columns: [{ key: 'deloitte', label: 'Deloitte', href: '/apps/1' }, …],
//       cell: (row, column) => (used(row, column) ? { tone: 'ok' } : null),
//   });
//
// Options (markup on the matrix, each with a default [KT6]; the same names are fields of the spec):
//   data-kp-view                  grid | lines                                              grid (existing matrices never change)
//   data-kp-lines-side            sources-left | sources-right                             sources-left
//   data-kp-lines-shape           curve | elbow | straight                                  curve
//   data-kp-lines-light           hover | pick | both | off: a node lights its lines, the rest dims   both (hover or focus lights, a press pins)
//   data-kp-lines-count           on | off: the exact count of uses on each source           on
//   data-kp-lines-empty-sources   show | hide: a source nothing uses                        show ("Not used")
//   data-kp-lines-collapse-below  px: under this width each source lists its users instead   640
//   data-kp-density               comfortable | compact                                      comfortable
//   data-kp-remember              a name: the pinned node and the view are kept on this device
//
// Node content: `{ label, sub, glyph (a document kind: pdf doc sheet image text unknown), href, tone, ghost, dashed, disabledReason }`.
// A line carries what `cell(row, column)` returns, the same object the grid view reads [r3r5-1019 line-tone]:
//   `tone`   ok | warn | bad | muted: the line's colour, and a second carrier so colour is never alone (ok solid, warn dashed,
//            bad dotted and heavier, muted faint), with the tone's glyph on the label
//   `label`  a few words that stand on the line ("writes here", "blocked"): a small plate in the gap between the columns, never
//            over a card, moved along the line to keep clear of its neighbours (a label that finds no room is shown while its line
//            is lit); the node's words and the phone's list say it too ("Deloitte (writes here)")
// Keys: one tab stop; Up and Down move within a column, Left and Right jump to the other column and land on the first connected node,
// Home and End the ends, Space or a press pins, Enter opens the node's link (else pins), Escape drops the pin. The lines are hidden from
// assistive technology; every node says the relation in words ("CV Developer NL, used by 2: Deloitte, Takto"), so the phone list and
// the map hold the same text. Lines are placed again on a change of data, of size and when the fonts arrive. Loading lays the theme's
// busy card over the whole map; empty and failed fill its footprint with the package's plates.
// Fires `kp-uses-pin` `{ key, side, pinned, related }` and `kp-uses-retry`. Nothing runs on import; drawn by `setMatrix`.

import { getStrings } from './strings.js';
import { statePlate } from './state-plate.js';

/** The lines view of a matrix. */
export const USES_MAP = '[data-kp-view="lines"]';
/** Fired on the matrix when a node was pinned or let go: `{ key, side, pinned, related }`. */
export const USES_PIN_EVENT = 'kp-uses-pin';
/** Fired on the matrix when the Retry of a failed map was pressed. */
export const USES_RETRY_EVENT = 'kp-uses-retry';
/** The narrowest the map draws lines at, in px. */
export const USES_COLLAPSE_BELOW = 640;

/**
 * @typedef {object} UsesNode
 * @property {string} key
 * @property {string} label
 * @property {string} [sub] a line under the label
 * @property {'pdf' | 'doc' | 'sheet' | 'image' | 'text' | 'unknown'} [glyph] a document mark before the label
 * @property {string} [href] a link to the thing itself
 * @property {string} [tone] `ok` `warn` `bad` `muted`
 * @property {boolean} [ghost] not a real thing but still a group (a faint node)
 * @property {boolean} [dashed] its lines are dashed
 * @property {string} [disabledReason] the node cannot be opened, and why
 * @property {string} [mark] kept from a matrix row: a colour
 */

/**
 * What a line carries [r3r5-1019 line-tone].
 * @typedef {object} UsesLine
 * @property {'ok' | 'warn' | 'bad' | 'muted'} [tone] the line's colour (and its pattern)
 * @property {string} [label] the words on the line
 */

/** The tones a line takes, and the mark each puts before its label (never colour alone). */
const TONES = ['ok', 'warn', 'bad', 'muted'];
const TONE_GLYPH = Object.freeze({ ok: '✓', warn: '!', bad: '×', muted: '–' });

/** @type {WeakMap<Element, { pin: string | null, lit: string | null, stop: string | null, off: (() => void) | null }>} */
const MEMORY = new WeakMap();

/** @param {Document} doc @param {string} tag @param {string} cls */
const make = (doc, tag, cls) => {
    const node = doc.createElement(tag);
    node.className = cls;
    return node;
};

/** @param {Element} el @param {string} name @param {string} fallback */
const attr = (el, name, fallback) => el.getAttribute(name) ?? fallback;

/** @param {Element} el */
const rememberKey = (el) => {
    const name = el.getAttribute('data-kp-remember');
    return name ? `kp-remember:uses:${name}` : null;
};

/** The view a matrix remembers on this device, or null. @param {Element} el @returns {'grid' | 'lines' | null} */
export function rememberedView(el) {
    const key = rememberKey(el);
    if (!key) return null;
    try {
        const v = localStorage.getItem(`${key}:view`);
        return v === 'lines' || v === 'grid' ? v : null;
    } catch {
        return null;
    }
}

/** Remember the view a matrix shows. @param {Element} el @param {'grid' | 'lines'} view */
export function rememberView(el, view) {
    const key = rememberKey(el);
    if (!key) return;
    try {
        localStorage.setItem(`${key}:view`, view);
    } catch {
        // No storage: the view lasts for this page.
    }
}

/**
 * The relation of a spec, as lists. Pure.
 * @param {{ rows?: readonly UsesNode[], columns?: readonly UsesNode[], cell?: (row: string, column: string) => unknown }} spec
 * @returns {{ uses: Map<string, string[]>, usedBy: Map<string, string[]>, lines: Map<string, UsesLine> }} `lines` by `"<row>><column>"`
 */
export function usesRelation(spec) {
    /** @type {Map<string, string[]>} */
    const uses = new Map();
    /** @type {Map<string, string[]>} */
    const usedBy = new Map();
    /** @type {Map<string, UsesLine>} */
    const lines = new Map();
    for (const row of spec.rows ?? []) uses.set(row.key, []);
    for (const column of spec.columns ?? []) usedBy.set(column.key, []);
    for (const row of spec.rows ?? []) {
        for (const column of spec.columns ?? []) {
            const hit = spec.cell?.(row.key, column.key);
            if (!hit || /** @type {any} */ (hit).tone === 'none' || /** @type {any} */ (hit).tone === 'self') continue;
            uses.get(row.key)?.push(column.key);
            usedBy.get(column.key)?.push(row.key);
            const line = /** @type {any} */ (hit);
            lines.set(`${row.key}>${column.key}`, {
                ...(TONES.includes(line.tone) ? { tone: line.tone } : {}),
                ...(typeof line.label === 'string' && line.label.trim() ? { label: line.label.trim() } : {}),
            });
        }
    }
    return { uses, usedBy, lines };
}

/**
 * The path of one line between two points. Pure.
 * @param {'curve' | 'elbow' | 'straight'} shape @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
 */
export function usesPath(shape, x1, y1, x2, y2) {
    const mid = (x1 + x2) / 2;
    if (shape === 'straight') return `M${x1} ${y1} L${x2} ${y2}`;
    if (shape === 'elbow') return `M${x1} ${y1} H${mid} V${y2} H${x2}`;
    return `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
}

/**
 * The helpers heat.js hands over: the busy card's bookkeeping lives there.
 * @typedef {object} Context
 * @property {(el: HTMLElement, nodes: Node[]) => void} replaceKeepingCard
 * @property {(el: HTMLElement, loading: boolean, words: string, area: () => readonly (Element | { top: number, right: number, bottom: number, left: number })[], className: string) => void} syncCard
 * @property {(el: HTMLElement) => void} markDrawn
 */

/**
 * The words of a line: the tone's mark and the label, in one span [r3r5-1019 line-tone].
 * @param {Document} doc @param {string} cls @param {UsesLine} line
 */
function tagOf(doc, cls, line) {
    const tag = make(doc, 'span', cls);
    if (line.tone) {
        tag.setAttribute('data-kp-tone', line.tone);
        const mark = make(doc, 'span', 'kp-uses__tag-mark');
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = TONE_GLYPH[line.tone];
        tag.append(mark);
    }
    tag.append(make(doc, 'span', 'kp-uses__tag-text'));
    /** @type {HTMLElement} */ (tag.lastElementChild).textContent = line.label ?? '';
    return tag;
}

/**
 * Draw the lines view of a matrix.
 *
 * @param {HTMLElement} el
 * @param {any} spec a MatrixSpec with the lines fields
 * @param {Context} ctx
 */
export function drawUsesMap(el, spec, ctx) {
    const doc = el.ownerDocument;
    const strings = getStrings();
    const state = spec.state ?? 'ready';
    const loading = state === 'loading';
    let memory = MEMORY.get(el);
    if (!memory) {
        memory = { pin: null, lit: null, stop: null, off: null };
        MEMORY.set(el, memory);
        const key = rememberKey(el);
        if (key) {
            try {
                memory.pin = localStorage.getItem(`${key}:pin`);
            } catch {
                // No storage.
            }
        }
    }
    memory.off?.();
    memory.off = null;

    el.classList.add('kp-matrix', 'kp-matrix--lines');
    el.setAttribute('data-kp-matrix', '');
    el.setAttribute('data-kp-view', 'lines');
    el.setAttribute('data-kp-state', state);
    el.toggleAttribute('aria-busy', loading);
    el.removeAttribute('data-kp-lit');
    const side = attr(el, 'data-kp-lines-side', 'sources-left');
    const shape = /** @type {'curve' | 'elbow' | 'straight'} */ (attr(el, 'data-kp-lines-shape', 'curve'));
    const lightMode = attr(el, 'data-kp-lines-light', 'both');
    const countOn = attr(el, 'data-kp-lines-count', 'on') !== 'off';
    const hideEmpty = attr(el, 'data-kp-lines-empty-sources', 'show') === 'hide';
    const collapseBelow = Number(attr(el, 'data-kp-lines-collapse-below', String(USES_COLLAPSE_BELOW))) || USES_COLLAPSE_BELOW;

    if (state === 'empty' || state === 'error') {
        const box = make(doc, 'div', 'kp-uses__state');
        const isError = state === 'error';
        box.append(
            statePlate(doc, {
                kind: isError ? 'error' : 'empty',
                title: spec.message ?? (isError ? strings.usesFailed : strings.usesEmpty),
                text: isError ? strings.usesFailedText : strings.usesEmptyText,
                ...(isError ? { actionLabel: strings.usesRetry, onAction: () => el.dispatchEvent(new CustomEvent(USES_RETRY_EVENT, { bubbles: true })) } : {}),
            }),
        );
        ctx.markDrawn(el);
        ctx.syncCard(el, false, '', () => [], 'kp-uses__busy');
        ctx.replaceKeepingCard(el, [box]);
        return;
    }

    /** @type {UsesNode[]} */
    let sources = [...(spec.rows ?? [])];
    /** @type {UsesNode[]} */
    let users = [...(spec.columns ?? [])];
    if (loading && sources.length === 0) sources = Array.from({ length: spec.skeleton ?? 4 }, (_, i) => ({ key: `s${i}`, label: '' }));
    if (loading && users.length === 0) users = Array.from({ length: spec.skeleton ?? 4 }, (_, i) => ({ key: `u${i}`, label: '' }));
    const { uses, usedBy, lines: lineInfo } = loading ? { uses: new Map(), usedBy: new Map(), lines: new Map() } : usesRelation({ rows: sources, columns: users, cell: spec.cell });
    if (hideEmpty) sources = sources.filter((s) => (uses.get(s.key)?.length ?? 0) > 0);
    const byKey = new Map([...sources, ...users].map((n) => [n.key, n]));
    /** The words of the nodes on the far end of a node's lines, each with its line's label: "Deloitte (writes here), Takto". */
    const names = (/** @type {string[]} */ keys, /** @type {string} */ self, /** @type {'source' | 'user'} */ kind) =>
        keys
            .map((k) => {
                const label = lineInfo.get(kind === 'source' ? `${self}>${k}` : `${k}>${self}`)?.label;
                return `${byKey.get(k)?.label ?? k}${label ? ` (${label})` : ''}`;
            })
            .join(', ');

    const root = make(doc, 'div', 'kp-uses');
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', spec.label ?? el.getAttribute('aria-label') ?? strings.usesLabel);
    root.setAttribute('data-kp-lines-side', side);
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', 'kp-uses__lines');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const colSources = make(doc, 'ol', 'kp-uses__col kp-uses__col--sources');
    const colUsers = make(doc, 'ol', 'kp-uses__col kp-uses__col--users');
    colSources.setAttribute('role', 'list');
    colUsers.setAttribute('role', 'list');
    colSources.setAttribute('aria-label', spec.sourcesLabel ?? strings.usesSources);
    colUsers.setAttribute('aria-label', spec.usersLabel ?? strings.usesUsers);

    /** @param {UsesNode} node @param {'source' | 'user'} kind */
    const nodeFor = (node, kind) => {
        const li = make(doc, 'li', 'kp-uses__node');
        li.setAttribute('data-key', node.key);
        li.setAttribute('data-side', kind);
        if (loading) {
            li.append(make(doc, 'span', 'kp-uses__card kp-skeleton'));
            li.setAttribute('aria-hidden', 'true');
            return li;
        }
        if (node.ghost) li.setAttribute('data-kp-ghost', '');
        if (node.tone) li.setAttribute('data-kp-tone', node.tone);
        const related = kind === 'source' ? (uses.get(node.key) ?? []) : (usedBy.get(node.key) ?? []);
        const card = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-uses__card'));
        card.type = 'button';
        card.tabIndex = -1;
        card.setAttribute('aria-pressed', String(memory?.pin === node.key));
        const what = related.length === 0
            ? kind === 'source'
                ? strings.usesNodeUnused(node.label)
                : strings.usesNodeNothing(node.label)
            : kind === 'source'
              ? strings.usesNodeSource(node.label, related.length, names(related, node.key, 'source'))
              : strings.usesNodeUser(node.label, names(related, node.key, 'user'));
        card.setAttribute('aria-label', what);
        if (node.glyph) {
            const glyph = make(doc, 'span', 'kp-docglyph');
            glyph.setAttribute('data-kp-doc-kind', node.glyph);
            glyph.setAttribute('data-kp-size', 'sm');
            glyph.setAttribute('aria-hidden', 'true');
            card.append(glyph);
        }
        const text = make(doc, 'span', 'kp-uses__text');
        const label = make(doc, 'span', 'kp-uses__label');
        label.textContent = node.label;
        text.append(label);
        if (node.sub) {
            const sub = make(doc, 'span', 'kp-uses__sub');
            sub.textContent = node.sub;
            text.append(sub);
        }
        if (kind === 'source' && countOn) {
            const count = make(doc, 'span', 'kp-uses__count');
            count.textContent = related.length === 0 ? strings.usesNotUsed : (spec.countLabel?.(related.length) ?? strings.usesCount(related.length));
            text.append(count);
        }
        card.append(text);
        li.append(card);
        if (node.href && !node.disabledReason) {
            const open = /** @type {HTMLAnchorElement} */ (make(doc, 'a', 'kp-uses__open'));
            open.href = node.href;
            open.tabIndex = -1;
            open.setAttribute('aria-label', strings.usesOpen(node.label));
            open.textContent = '↗';
            li.append(open);
        } else if (node.disabledReason) {
            card.setAttribute('data-kp-disabled-reason', node.disabledReason);
            li.setAttribute('data-kp-unavailable', '');
        }
        return li;
    };

    colSources.append(...sources.map((n) => nodeFor(n, 'source')));
    colUsers.append(...users.map((n) => nodeFor(n, 'user')));
    root.append(svg, colSources, colUsers);

    // The phone's list: each source a card, its users as chips. The same words as the map.
    const list = make(doc, 'ul', 'kp-uses__list');
    list.setAttribute('role', 'list');
    if (!loading) {
        for (const source of sources) {
            const related = uses.get(source.key) ?? [];
            const item = make(doc, 'li', 'kp-uses__group');
            if (source.ghost) item.setAttribute('data-kp-ghost', '');
            const head = make(doc, 'p', 'kp-uses__group-head');
            const label = make(doc, 'span', 'kp-uses__label');
            label.textContent = source.label;
            head.append(label);
            if (source.sub) {
                const sub = make(doc, 'span', 'kp-uses__sub');
                sub.textContent = source.sub;
                head.append(sub);
            }
            if (countOn) {
                const count = make(doc, 'span', 'kp-uses__count');
                count.textContent = related.length === 0 ? strings.usesNotUsed : (spec.countLabel?.(related.length) ?? strings.usesCount(related.length));
                head.append(count);
            }
            item.append(head);
            if (related.length > 0) {
                const chips = make(doc, 'ul', 'kp-uses__chips');
                chips.setAttribute('role', 'list');
                for (const key of related) {
                    const user = byKey.get(key);
                    const chip = make(doc, 'li', 'kp-uses__chip');
                    const line = lineInfo.get(`${source.key}>${key}`);
                    if (line?.tone) chip.setAttribute('data-kp-tone', line.tone);
                    if (user?.href) {
                        const a = /** @type {HTMLAnchorElement} */ (make(doc, 'a', 'kp-uses__chip-link'));
                        a.href = user.href;
                        a.textContent = user.label;
                        chip.append(a);
                    } else chip.append(user?.label ?? key);
                    // The line's words follow the name, as on the map.
                    if (line?.label) chip.append(tagOf(doc, 'kp-uses__chip-tag', line));
                    chips.append(chip);
                }
                item.append(chips);
            }
            list.append(item);
        }
    }

    ctx.replaceKeepingCard(el, [root, list]);
    // The busy card is centred over the map's whole footprint (the box with its least height), not over the skeleton rows,
    // which are shorter than a loaded map [state-plates-1019].
    ctx.syncCard(el, loading, strings.usesLoading, () => [el], 'kp-uses__busy');
    ctx.markDrawn(el);
    if (!loading) memory.off = wire(el, root, svg, list, { sources, users, uses, usedBy, lineInfo, shape, lightMode, collapseBelow, byKey, memory, spec });
}

/**
 * Lines, light, pin, keys and the collapse.
 * @param {HTMLElement} el @param {HTMLElement} root @param {Element} svg @param {HTMLElement} list
 * @param {{ sources: UsesNode[], users: UsesNode[], uses: Map<string, string[]>, usedBy: Map<string, string[]>, lineInfo: Map<string, UsesLine>, shape: 'curve' | 'elbow' | 'straight', lightMode: string, collapseBelow: number, byKey: Map<string, UsesNode>, memory: { pin: string | null, lit: string | null, stop: string | null, off: (() => void) | null }, spec: any }} c
 * @returns {() => void}
 */
function wire(el, root, svg, list, c) {
    const doc = el.ownerDocument;
    const view = /** @type {Window} */ (doc.defaultView);
    const svgNs = 'http://www.w3.org/2000/svg';
    const memory = c.memory;
    /** @type {Map<string, SVGPathElement[]>} */
    const lines = new Map();
    /** The words on the lines that have some, by `"<source>><user>"` [r3r5-1019 line-tone]. @type {Map<string, HTMLElement>} */
    const tags = new Map();

    /** @param {string} key */
    const nodeEl = (key) => /** @type {HTMLElement | null} */ (root.querySelector(`.kp-uses__node[data-key="${CSS.escape(key)}"]`));
    const cards = () => /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.kp-uses__card')]);

    const collapsed = () => el.clientWidth > 0 && el.clientWidth < c.collapseBelow;
    const applyCollapse = () => {
        const small = collapsed();
        el.toggleAttribute('data-kp-collapsed', small);
        root.hidden = small;
        list.hidden = !small;
    };

    const place = () => {
        if (root.hidden) return;
        const box = root.getBoundingClientRect();
        svg.setAttribute('width', String(box.width));
        svg.setAttribute('height', String(box.height));
        svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
        for (const [source, keys] of c.uses) {
            const a = nodeEl(source)?.querySelector('.kp-uses__card')?.getBoundingClientRect();
            if (!a) continue;
            for (const key of keys) {
                const b = nodeEl(key)?.querySelector('.kp-uses__card')?.getBoundingClientRect();
                const path = lines.get(`${source}>${key}`)?.[0];
                if (!b || !path) continue;
                const leftToRight = a.left < b.left;
                const x1 = (leftToRight ? a.right : a.left) - box.left;
                const x2 = (leftToRight ? b.left : b.right) - box.left;
                path.setAttribute('d', usesPath(c.shape, x1, a.top + a.height / 2 - box.top, x2, b.top + b.height / 2 - box.top));
            }
        }
        placeTags(box);
    };

    /**
     * The words of each line stand on the line, inside the gap between the columns (never over a card): the plate is as wide as the
     * gap allows and its words wrap, and it moves along its line to a place that no other plate holds. One that finds no place is
     * shown only while its line is lit [r3r5-1019 line-tone].
     * @param {DOMRect} box
     */
    const placeTags = (box) => {
        if (tags.size === 0) return;
        const colA = root.querySelector('.kp-uses__col--sources')?.getBoundingClientRect();
        const colB = root.querySelector('.kp-uses__col--users')?.getBoundingClientRect();
        if (!colA || !colB) return;
        const gap = Math.abs(colA.left < colB.left ? colB.left - colA.right : colA.left - colB.right);
        root.style.setProperty('--kp-uses-tag-max', `${Math.max(0, gap * 0.72 - 8).toFixed(1)}px`);
        /** @type {{ l: number, r: number, t: number, b: number }[]} */
        const held = [];
        const edge = 3;
        for (const [pair, tag] of tags) {
            const path = lines.get(pair)?.[0];
            const length = path?.getTotalLength?.() ?? 0;
            if (!path || !(length > 0)) {
                tag.setAttribute('data-kp-uses-unplaced', '');
                continue;
            }
            const w = tag.offsetWidth;
            const h = tag.offsetHeight;
            let found = false;
            for (const along of [0.5, 0.44, 0.56, 0.38, 0.62]) {
                const at = path.getPointAtLength(length * along);
                const rect = { l: at.x - w / 2 - edge, r: at.x + w / 2 + edge, t: at.y - h / 2 - edge, b: at.y + h / 2 + edge };
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
    };

    // One path per line, made once.
    for (const [source, keys] of c.uses) {
        for (const key of keys) {
            const path = /** @type {SVGPathElement} */ (doc.createElementNS(svgNs, 'path'));
            path.setAttribute('class', 'kp-uses__line');
            path.setAttribute('data-source', source);
            path.setAttribute('data-user', key);
            if (c.byKey.get(source)?.dashed) path.setAttribute('data-kp-dashed', '');
            const info = c.lineInfo.get(`${source}>${key}`);
            if (info?.tone) path.setAttribute('data-kp-tone', info.tone);
            svg.append(path);
            lines.set(`${source}>${key}`, [path]);
            if (info?.label) {
                const tag = tagOf(doc, 'kp-uses__tag', info);
                tag.setAttribute('aria-hidden', 'true');
                tag.setAttribute('data-source', source);
                tag.setAttribute('data-user', key);
                root.append(tag);
                tags.set(`${source}>${key}`, tag);
            }
        }
    }

    /** What is lit: a key and everything it touches, or nothing. @param {string | null} key */
    const light = (key) => {
        const hot = new Set();
        if (key) {
            hot.add(key);
            for (const k of c.uses.get(key) ?? []) hot.add(k);
            for (const k of c.usedBy.get(key) ?? []) hot.add(k);
        }
        el.toggleAttribute('data-kp-lit', key !== null);
        for (const [pair, [path]] of lines) {
            const [s, u] = pair.split('>');
            path.toggleAttribute('data-kp-hot', key !== null && (s === key || u === key));
        }
        for (const node of root.querySelectorAll('.kp-uses__node')) {
            node.toggleAttribute('data-kp-hot', key !== null && hot.has(node.getAttribute('data-key')));
        }
        for (const [pair, tag] of tags) {
            const [s, u] = pair.split('>');
            tag.toggleAttribute('data-kp-hot', key !== null && (s === key || u === key));
        }
    };
    const lightWhat = () => {
        const mode = c.lightMode;
        const pick = mode === 'pick' || mode === 'both' ? memory.pin : null;
        const hover = mode === 'hover' || mode === 'both' ? memory.lit : null;
        light(hover ?? pick);
    };

    /** @param {string | null} key */
    const pin = (key) => {
        const node = key ? c.byKey.get(key) : null;
        memory.pin = key;
        for (const card of cards()) card.setAttribute('aria-pressed', String(card.closest('.kp-uses__node')?.getAttribute('data-key') === key));
        const store = rememberKey(el);
        if (store) {
            try {
                if (key) localStorage.setItem(`${store}:pin`, key);
                else localStorage.removeItem(`${store}:pin`);
            } catch {
                // No storage.
            }
        }
        lightWhat();
        const kind = nodeEl(key ?? '')?.getAttribute('data-side') ?? null;
        el.dispatchEvent(
            new CustomEvent(USES_PIN_EVENT, {
                bubbles: true,
                detail: { key, side: kind, pinned: key !== null, related: key ? (c.uses.get(key) ?? c.usedBy.get(key) ?? []) : [], node },
            }),
        );
    };

    /** The one tab stop. @param {HTMLElement} card */
    const stopAt = (card) => {
        for (const other of cards()) other.tabIndex = -1;
        card.tabIndex = 0;
        memory.stop = card.closest('.kp-uses__node')?.getAttribute('data-key') ?? null;
    };

    const hoverTarget = (/** @type {Event} */ event) => {
        const node = event.target instanceof Element ? event.target.closest('.kp-uses__node') : null;
        return node && root.contains(node) ? node.getAttribute('data-key') : null;
    };
    const onOver = (/** @type {Event} */ event) => {
        if (c.lightMode === 'off' || c.lightMode === 'pick') return;
        memory.lit = hoverTarget(event);
        lightWhat();
    };
    const onOut = (/** @type {Event} */ event) => {
        if (c.lightMode === 'off' || c.lightMode === 'pick') return;
        const to = event instanceof MouseEvent || event instanceof FocusEvent ? event.relatedTarget : null;
        if (to instanceof Element && root.contains(to) && to.closest('.kp-uses__node')) return;
        memory.lit = null;
        lightWhat();
    };
    const onFocusIn = (/** @type {FocusEvent} */ event) => {
        const card = event.target instanceof Element ? event.target.closest('.kp-uses__card') : null;
        if (card instanceof HTMLElement) stopAt(card);
        onOver(event);
    };
    const onClick = (/** @type {Event} */ event) => {
        if (c.lightMode === 'off' || c.lightMode === 'hover') return;
        const card = event.target instanceof Element ? event.target.closest('.kp-uses__card') : null;
        if (!(card instanceof HTMLElement)) return;
        const key = card.closest('.kp-uses__node')?.getAttribute('data-key') ?? null;
        stopAt(card);
        pin(memory.pin === key ? null : key);
    };
    const onKey = (/** @type {KeyboardEvent} */ event) => {
        const card = event.target instanceof Element ? event.target.closest('.kp-uses__card') : null;
        if (!(card instanceof HTMLElement)) return;
        const node = card.closest('.kp-uses__node');
        const key = node?.getAttribute('data-key') ?? '';
        const kind = node?.getAttribute('data-side') ?? 'source';
        if (event.key === 'Escape' && memory.pin) {
            event.preventDefault();
            pin(null);
            return;
        }
        if (event.key === 'Enter') {
            const link = /** @type {HTMLAnchorElement | null} */ (node?.querySelector('.kp-uses__open') ?? null);
            if (link) {
                event.preventDefault();
                link.click();
            }
            return;
        }
        const sameColumn = [...root.querySelectorAll(`.kp-uses__node[data-side="${kind}"] .kp-uses__card`)].filter((n) => n instanceof HTMLElement);
        const at = sameColumn.indexOf(card);
        /** @type {HTMLElement | undefined} */
        let target;
        if (event.key === 'ArrowDown') target = /** @type {HTMLElement} */ (sameColumn[Math.min(sameColumn.length - 1, at + 1)]);
        else if (event.key === 'ArrowUp') target = /** @type {HTMLElement} */ (sameColumn[Math.max(0, at - 1)]);
        else if (event.key === 'Home') target = /** @type {HTMLElement} */ (sameColumn[0]);
        else if (event.key === 'End') target = /** @type {HTMLElement} */ (sameColumn[sameColumn.length - 1]);
        else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            // To the other column, on the first node that is connected to this one, else the first node.
            const flip = el.querySelector('.kp-uses')?.getAttribute('data-kp-lines-side') === 'sources-right';
            const towardUsers = (event.key === 'ArrowRight') !== flip;
            const wantKind = towardUsers ? 'user' : 'source';
            if (wantKind === kind) {
                event.preventDefault();
                return;
            }
            const other = [...root.querySelectorAll(`.kp-uses__node[data-side="${wantKind}"] .kp-uses__card`)].filter((n) => n instanceof HTMLElement);
            const related = kind === 'source' ? (c.uses.get(key) ?? []) : (c.usedBy.get(key) ?? []);
            target = /** @type {HTMLElement | undefined} */ (other.find((n) => related.includes(n.closest('.kp-uses__node')?.getAttribute('data-key') ?? '')) ?? other[0]);
        }
        if (!target) return;
        event.preventDefault();
        stopAt(target);
        target.focus();
    };

    root.addEventListener('pointerover', onOver);
    root.addEventListener('pointerout', onOut);
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onOut);
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);

    // The tab stop: the remembered one, else the first node.
    const first = cards();
    const stop = (memory.stop && nodeEl(memory.stop)?.querySelector('.kp-uses__card')) || first[0];
    if (stop instanceof HTMLElement) stop.tabIndex = 0;

    applyCollapse();
    place();
    lightWhat();
    const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
        applyCollapse();
        place();
    }) : null;
    watcher?.observe(el);
    watcher?.observe(root);
    void doc.fonts?.ready.then(() => place());
    const raf = view.requestAnimationFrame(() => place());

    return () => {
        watcher?.disconnect();
        for (const tag of tags.values()) tag.remove();
        view.cancelAnimationFrame(raf);
        root.removeEventListener('pointerover', onOver);
        root.removeEventListener('pointerout', onOut);
        root.removeEventListener('focusin', onFocusIn);
        root.removeEventListener('focusout', onOut);
        root.removeEventListener('click', onClick);
        root.removeEventListener('keydown', onKey);
    };
}

/**
 * Pin a node (or none) from a script, without a page event beyond `kp-uses-pin`.
 * @param {HTMLElement} el @param {string | null} key
 */
export function setUsesPin(el, key) {
    const card = key ? el.querySelector(`.kp-uses__node[data-key="${CSS.escape(key)}"] .kp-uses__card`) : null;
    if (key === null) {
        const pinned = el.querySelector('.kp-uses__card[aria-pressed="true"]');
        if (pinned instanceof HTMLElement) pinned.click();
        return;
    }
    if (card instanceof HTMLElement && card.getAttribute('aria-pressed') !== 'true') card.click();
}

/**
 * Take the lines view off a matrix that goes back to its grid.
 * @param {HTMLElement} el
 */
export function leaveUsesMap(el) {
    const memory = MEMORY.get(el);
    memory?.off?.();
    if (memory) memory.off = null;
    el.classList.remove('kp-matrix--lines');
    el.removeAttribute('data-kp-collapsed');
    el.removeAttribute('data-kp-lit');
}
