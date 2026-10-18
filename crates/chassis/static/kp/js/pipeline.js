// The pipeline: where each item stands, one lane per stage [kpadopt4; JobTracker's Overview `Pipeline`].
//
// A read-only board, not a drag-and-drop one: a lane per stage (draft, sent,
// interview, offer), each with its name and its exact count on a plate in the
// stage's colour, the share of all under it, and the items as cards. A lane
// marked `closed` (closed, no status) stands under the board across its whole
// width. The page gives the lanes and the cards; the board draws them in
// place, by id, so a refresh moves nothing that stayed.
//
//   <section class="kp-pipeline" data-kp-pipeline data-kp-pipeline-limit="4" aria-label="Applications by stage"></section>
//
//   setPipeline(el, {
//       lanes: [{ key: 'draft', label: 'Draft', tone: 1 }, …, { key: 'closed', label: 'Closed · no status', closed: true }],
//       cards: [{ id: 'a1', lane: 'sent', title: 'Frontend developer', sub: 'Acme', meta: '02/10/2026', mark: 'AC', href: '/d/a1' }],
//   });
//
//   lanes    side by side at one width each, as tall as the tallest; under
//            40rem of the board's own width they turn to rows
//   cards    a link (`href`) or a button; `mark` is the short sign in the
//            lane's colour, `sub` and `meta` the lines under the title; a
//            `dimmed` card is filtered out but kept in its place, and
//            setPipelineSelected() marks the one that is open
//   limit    `data-kp-pipeline-limit` cards per lane, the rest behind
//            “+N more” (a toggle, `aria-expanded`); the counts are exact
//   share    each lane's share of all cards under its plate, whole percent;
//            `data-kp-pipeline-share="false"` leaves it out
//   states   setPipelineState(el, state, words): `loading` keeps the lanes
//            and lays the data table's own loading card (js/busy-card.js)
//            over the board, the cards drawn once it has gone; `empty` keeps
//            every lane with “none” and one sentence above the board; `error`
//            says why with Try again (`kp-pipeline-retry`)
//   keys     one tab stop: ← → to the neighbouring lane (the same place, or
//            its last card), ↑ ↓ along a lane, Home and End to a lane's first
//            and last; Enter follows the link or presses the button
//
// Events (bubbling, on the board): `kp-pipeline-open` `{ id, card, source }`
// when a card is opened (a link is still followed), `kp-pipeline-retry` from
// Try again, `kp-pipeline-more` `{ lane, open }` when a lane shows more or fewer.

import { resolveStrings } from './strings.js';
import { openBusyCard } from './busy-card.js';

/** A board: `section.kp-pipeline[data-kp-pipeline]`. */
export const PIPELINE = '[data-kp-pipeline]';
/** Fired on the board, bubbling, when a card is opened: `{ id, card, source: 'pointer' | 'keyboard' }`. */
export const PIPELINE_OPEN_EVENT = 'kp-pipeline-open';
/** Fired on the board, bubbling, when Try again is pressed. */
export const PIPELINE_RETRY_EVENT = 'kp-pipeline-retry';
/** Fired on the board, bubbling, when a lane shows more or fewer: `{ lane, open }`. */
export const PIPELINE_MORE_EVENT = 'kp-pipeline-more';

/**
 * @typedef {{ key: string, label: string, tone?: 1 | 2 | 3 | 4 | 5, closed?: boolean }} PipelineLane
 * @typedef {object} PipelineCard
 * @property {string} id
 * @property {string} lane the lane's key
 * @property {string} title
 * @property {string} [sub] the line under the title (a company)
 * @property {string} [meta] a short last line (a date)
 * @property {string} [mark] a short sign, two letters, in the lane's colour
 * @property {string} [href] a link; without it the card is a button
 * @property {boolean} [dimmed] filtered out, kept in its place
 * @typedef {'loading' | 'ready' | 'empty' | 'error'} PipelineState
 * @typedef {import('./strings.js').Strings} Strings
 * @typedef {{ strings?: Partial<Strings> }} PipelineOptions
 * @typedef {{ el: HTMLElement, strings: Strings, lanes: PipelineLane[], cards: PipelineCard[], state: PipelineState,
 *   words: string, open: Set<string>, selected: string | null, active: string | null, board: HTMLElement,
 *   closed: HTMLElement, stateBox: HTMLElement, stateWords: HTMLElement, retry: HTMLButtonElement, live: HTMLElement,
 *   nodes: Map<string, HTMLElement>, busy: import('./busy-card.js').BusyCard | null, leaving: Promise<void> | null, drawn: boolean }} PipelineModel
 */

/** @type {WeakMap<Element, PipelineModel>} */
const boards = new WeakMap();

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc @param {K} tag @param {string} [className] @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
};

/** The board's limit per lane; 0 shows every card. @param {PipelineModel} c */
const limitOf = (c) => Math.max(0, Number.parseInt(c.el.dataset.kpPipelineLimit ?? '', 10) || 0);

/** Build the frame once. @param {PipelineModel} c */
function build(c) {
    const doc = c.el.ownerDocument;
    c.board = make(doc, 'div', 'kp-pipeline__board');
    c.board.setAttribute('role', 'list');
    c.closed = make(doc, 'div', 'kp-pipeline__closed');
    c.closed.setAttribute('role', 'list');
    c.stateBox = make(doc, 'div', 'kp-pipeline__state');
    c.stateWords = make(doc, 'p', 'kp-pipeline__words');
    c.retry = make(doc, 'button', 'kp-button kp-button--sm kp-pipeline__retry', c.strings.pipelineRetry);
    c.retry.type = 'button';
    c.stateBox.append(c.stateWords, c.retry);
    c.live = make(doc, 'p', 'kp-sr-only kp-pipeline__live');
    c.live.setAttribute('role', 'status');
    const frame = make(doc, 'div', 'kp-pipeline__frame');
    // The sentence of an empty or failed board stands on its own plate above the lanes, covering none of them.
    frame.append(c.stateBox, c.board);
    c.el.replaceChildren(frame, c.closed, c.live);
}

/**
 * One card, made or kept by id.
 * @param {PipelineModel} c @param {PipelineCard} card @param {PipelineLane | undefined} lane
 */
function cardNode(c, card, lane) {
    const doc = c.el.ownerDocument;
    const tag = card.href ? 'A' : 'BUTTON';
    let node = c.nodes.get(card.id);
    if (!node || node.tagName !== tag) {
        node?.remove();
        node = card.href ? make(doc, 'a', 'kp-pipeline__card') : make(doc, 'button', 'kp-pipeline__card');
        if (node instanceof HTMLButtonElement) node.type = 'button';
        node.append(make(doc, 'span', 'kp-pipeline__mark'), make(doc, 'span', 'kp-pipeline__title'), make(doc, 'span', 'kp-pipeline__sub'));
        node.append(make(doc, 'span', 'kp-pipeline__meta'));
        c.nodes.set(card.id, node);
    }
    if (node instanceof HTMLAnchorElement && card.href) node.href = card.href;
    node.dataset.kpId = card.id;
    node.setAttribute('role', 'listitem');
    if (lane?.tone) node.dataset.kpTone = String(lane.tone);
    else delete node.dataset.kpTone;
    const [mark, title, sub, meta] = /** @type {HTMLElement[]} */ ([...node.children]);
    if (mark) {
        mark.textContent = card.mark ?? '';
        mark.hidden = !card.mark;
        mark.setAttribute('aria-hidden', 'true');
    }
    if (title) title.textContent = card.title;
    if (sub) {
        sub.textContent = card.sub ?? '';
        sub.hidden = !card.sub;
    }
    if (meta) {
        meta.textContent = card.meta ?? '';
        meta.hidden = !card.meta;
    }
    node.title = [card.title, card.sub, card.meta].filter(Boolean).join(' · ');
    node.toggleAttribute('data-kp-dimmed', card.dimmed === true);
    if (card.id === c.selected) node.setAttribute('aria-current', 'true');
    else node.removeAttribute('aria-current');
    return node;
}

/** A lane, made from scratch on every paint (its cards are kept by id). @param {PipelineModel} c @param {PipelineLane} lane @param {PipelineCard[]} cards @param {number} total */
function laneNode(c, lane, cards, total) {
    const doc = c.el.ownerDocument;
    const s = c.strings;
    const loading = c.state === 'loading' || c.leaving !== null;
    const node = make(doc, 'section', `kp-pipeline__lane${lane.closed ? ' kp-pipeline__lane--closed' : ''}`);
    node.setAttribute('role', 'listitem');
    node.dataset.kpLane = lane.key;
    if (lane.tone) node.dataset.kpTone = String(lane.tone);
    const head = make(doc, 'header', 'kp-pipeline__head');
    const name = make(doc, 'h3', 'kp-pipeline__name', lane.label);
    const id = `${c.el.id || 'kp-pipeline'}-${lane.key}`;
    name.id = id;
    node.setAttribute('aria-labelledby', id);
    const count = make(doc, 'span', 'kp-pipeline__count');
    if (loading) count.append(make(doc, 'span', 'kp-skeleton kp-pipeline__ghost-count'));
    else count.textContent = String(cards.length);
    head.append(name, count);
    node.append(head);
    if (c.el.dataset.kpPipelineShare !== 'false' && !lane.closed) {
        const share = make(doc, 'p', 'kp-pipeline__share');
        share.textContent = loading || total === 0 ? '' : s.pipelineShare(Math.round((cards.length / total) * 100));
        node.append(share);
    }
    const list = make(doc, 'div', 'kp-pipeline__cards');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-labelledby', id);
    if (loading) {
        for (let i = 0; i < (lane.closed ? 3 : 2); i += 1) {
            const ghost = make(doc, 'span', 'kp-pipeline__card kp-pipeline__ghost');
            ghost.setAttribute('aria-hidden', 'true');
            ghost.append(make(doc, 'span', 'kp-skeleton'), make(doc, 'span', 'kp-skeleton'));
            list.append(ghost);
        }
    } else if (cards.length === 0) {
        list.append(make(doc, 'p', 'kp-pipeline__none', s.pipelineNone));
    } else {
        const limit = lane.closed ? 0 : limitOf(c);
        const open = c.open.has(lane.key);
        const shown = limit > 0 && !open ? cards.slice(0, limit) : cards;
        for (const card of shown) list.append(cardNode(c, card, lane));
        if (limit > 0 && cards.length > limit) {
            const more = make(doc, 'button', 'kp-button kp-button--ghost kp-button--sm kp-pipeline__more');
            more.type = 'button';
            more.dataset.kpPipelineMore = lane.key;
            more.setAttribute('aria-expanded', String(open));
            more.textContent = open ? s.pipelineLess : s.pipelineMore(cards.length - limit);
            list.append(more);
        }
    }
    node.append(list);
    return node;
}

/** Everything, from the model. @param {PipelineModel} c */
function paint(c) {
    const s = c.strings;
    const byLane = new Map(c.lanes.map((l) => [l.key, /** @type {PipelineCard[]} */ ([])]));
    for (const card of c.cards) byLane.get(card.lane)?.push(card);
    const total = c.cards.filter((card) => c.lanes.some((l) => l.key === card.lane && !l.closed)).length;
    const keep = new Set(c.cards.map((card) => card.id));
    for (const [id, node] of c.nodes)
        if (!keep.has(id)) {
            node.remove();
            c.nodes.delete(id);
        }
    const open = c.lanes.filter((l) => !l.closed);
    const closed = c.lanes.filter((l) => l.closed);
    c.board.style.setProperty('--kp-pipeline-lanes', String(Math.max(1, open.length)));
    c.board.replaceChildren(...open.map((l) => laneNode(c, l, byLane.get(l.key) ?? [], total)));
    c.closed.replaceChildren(...closed.map((l) => laneNode(c, l, byLane.get(l.key) ?? [], total)));
    c.closed.hidden = closed.length === 0;
    c.el.dataset.kpState = c.state;
    c.board.toggleAttribute('aria-busy', c.state === 'loading');
    const empty = c.state === 'empty' || (c.state === 'ready' && c.cards.length === 0);
    const words = c.state === 'error' ? s.pipelineFailed(c.words) : empty ? c.words || s.pipelineEmpty : '';
    c.stateBox.hidden = words === '' || c.leaving !== null;
    c.stateBox.dataset.kpState = c.state === 'error' ? 'error' : 'empty';
    c.stateWords.textContent = words;
    c.retry.hidden = c.state !== 'error';
    drawBusy(c);
    syncTabStops(c);
}

/** The loading card over the board, the data table's own [Kenny, 2026-10-16]. @param {PipelineModel} c */
function drawBusy(c) {
    const want = c.state === 'loading';
    if (want === (c.busy !== null)) {
        c.busy?.place();
        return;
    }
    const frame = /** @type {HTMLElement} */ (c.board.parentElement);
    if (!want) {
        const card = /** @type {import('./busy-card.js').BusyCard} */ (c.busy);
        c.busy = null;
        const gone = card.close();
        c.leaving = gone;
        void gone.then(() => {
            if (c.leaving !== gone) return;
            c.leaving = null;
            if (boards.get(c.el) === c) paint(c);
        });
        return;
    }
    for (const old of frame.querySelectorAll(':scope > .kp-pipeline__busy')) old.remove();
    c.leaving = null;
    c.busy = openBusyCard(frame, {
        words: c.strings.pipelineLoading,
        area: () => [c.board],
        className: 'kp-pipeline__busy',
        arrive: c.drawn,
    });
    c.live.textContent = c.strings.pipelineLoading;
}

/** The cards a person can reach, per lane (the board's lanes, then the closed ones). @param {PipelineModel} c */
function reachable(c) {
    return [...c.el.querySelectorAll('.kp-pipeline__lane')]
        .map((lane) => /** @type {HTMLElement[]} */ ([...lane.querySelectorAll('.kp-pipeline__card:not(.kp-pipeline__ghost), .kp-pipeline__more')]))
        .filter((l) => l.length);
}

/** One tab stop: the active card. @param {PipelineModel} c */
function syncTabStops(c) {
    const lanes = reachable(c);
    const all = lanes.flat();
    let target = all.find((n) => n.dataset.kpId === c.active || n.dataset.kpPipelineMore === c.active);
    target ??= all[0];
    for (const n of all) n.tabIndex = n === target ? 0 : -1;
}

/**
 * Attach every board under `root`.
 * @param {ParentNode} [root]
 * @param {PipelineOptions} [options]
 * @returns {() => void} detach
 */
export function attachPipelines(root = document, options = {}) {
    /** @type {(() => void)[]} */
    const undo = [];
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(PIPELINE) ? [root] : []),
        ...root.querySelectorAll(PIPELINE),
    ]);
    for (const el of found) {
        if (boards.has(el)) continue;
        el.classList.add('kp-pipeline');
        /** @type {PipelineModel} */
        const c = {
            el,
            strings: resolveStrings(options.strings),
            lanes: [],
            cards: [],
            state: 'ready',
            words: '',
            open: new Set(),
            selected: null,
            active: null,
            board: el,
            closed: el,
            stateBox: el,
            stateWords: el,
            retry: /** @type {HTMLButtonElement} */ (/** @type {unknown} */ (el)),
            live: el,
            nodes: new Map(),
            busy: null,
            leaving: null,
            drawn: false,
        };
        boards.set(el, c);
        build(c);
        paint(c);
        window.requestAnimationFrame(() => (c.drawn = true));

        /** @param {MouseEvent} event */
        const onClick = (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return;
            if (target.closest('.kp-pipeline__retry')) {
                el.dispatchEvent(new CustomEvent(PIPELINE_RETRY_EVENT, { bubbles: true }));
                return;
            }
            const more = /** @type {HTMLElement | null} */ (target.closest('[data-kp-pipeline-more]'));
            if (more) {
                const key = more.dataset.kpPipelineMore ?? '';
                const open = !c.open.has(key);
                if (open) c.open.add(key);
                else c.open.delete(key);
                c.active = key;
                paint(c);
                /** @type {HTMLElement | null} */ (el.querySelector(`[data-kp-pipeline-more="${CSS.escape(key)}"]`))?.focus();
                el.dispatchEvent(new CustomEvent(PIPELINE_MORE_EVENT, { bubbles: true, detail: { lane: key, open } }));
                return;
            }
            const node = /** @type {HTMLElement | null} */ (target.closest('.kp-pipeline__card[data-kp-id]'));
            if (!node) return;
            const card = c.cards.find((k) => k.id === node.dataset.kpId);
            if (!card) return;
            c.active = card.id;
            syncTabStops(c);
            el.dispatchEvent(
                new CustomEvent(PIPELINE_OPEN_EVENT, {
                    bubbles: true,
                    detail: { id: card.id, card, source: event.detail === 0 ? 'keyboard' : 'pointer' },
                }),
            );
        };
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            const from = event.target instanceof HTMLElement ? event.target.closest('.kp-pipeline__card, .kp-pipeline__more') : null;
            if (!(from instanceof HTMLElement)) return;
            const lanes = reachable(c);
            const li = lanes.findIndex((l) => l.includes(from));
            const lane = lanes[li];
            if (!lane) return;
            const at = lane.indexOf(from);
            const rtl = getComputedStyle(el).direction === 'rtl';
            const side = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
            /** @type {HTMLElement | undefined} */
            let to;
            if (side) {
                const next = lanes[li + side];
                if (next) to = next[Math.min(at, next.length - 1)];
            } else if (event.key === 'ArrowDown') to = lane[Math.min(lane.length - 1, at + 1)];
            else if (event.key === 'ArrowUp') to = lane[Math.max(0, at - 1)];
            else if (event.key === 'Home') to = lane[0];
            else if (event.key === 'End') to = lane[lane.length - 1];
            if (!to) return;
            event.preventDefault();
            c.active = to.dataset.kpId ?? to.dataset.kpPipelineMore ?? null;
            syncTabStops(c);
            to.focus();
        };
        el.addEventListener('click', onClick);
        el.addEventListener('keydown', onKey);
        undo.push(() => {
            el.removeEventListener('click', onClick);
            el.removeEventListener('keydown', onKey);
            c.busy?.remove();
            boards.delete(el);
        });
    }
    return () => undo.splice(0).forEach((off) => off());
}

/**
 * The lanes and the cards. Cards are kept by id, so a refresh keeps a focused card and moves nothing that stayed. A board
 * that was loading is ready from here on. `lanes` may be left out after the first call.
 * @param {Element} el
 * @param {{ lanes?: PipelineLane[], cards: PipelineCard[] }} data
 */
export function setPipeline(el, { lanes, cards }) {
    const c = boards.get(el);
    if (!c) return;
    if (lanes) c.lanes = lanes;
    c.cards = cards;
    if (c.state === 'loading' || c.state === 'empty') c.state = 'ready';
    paint(c);
}

/**
 * The board as a whole: `loading` (the lanes kept, the table's loading card over them), `ready`, `empty` (every lane says
 * none, `words` over the board) or `error` (`words` with Try again).
 * @param {Element} el
 * @param {PipelineState} state
 * @param {string} [words]
 */
export function setPipelineState(el, state, words = '') {
    const c = boards.get(el);
    if (!c) return;
    c.state = state;
    c.words = words;
    paint(c);
}

/**
 * Mark the card that is open (`aria-current`), or none.
 * @param {Element} el
 * @param {string | null} id
 */
export function setPipelineSelected(el, id) {
    const c = boards.get(el);
    if (!c) return;
    c.selected = id;
    for (const [key, node] of c.nodes) {
        if (key === id) node.setAttribute('aria-current', 'true');
        else node.removeAttribute('aria-current');
    }
}
