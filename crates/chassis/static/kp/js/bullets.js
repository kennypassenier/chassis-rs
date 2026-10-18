// The bullet list: rows of a value against a threshold [kpadopt4-data;
// JobTracker's follow-up clock, "days since the last contact against the
// 14-day threshold, for every open application"].
//
//   <div class="kp-bullets" data-kp-bullets></div>
//
//   setBullets(el, {
//       threshold: 14,
//       format: (days) => `${days} d`,
//       rows: [{ key: 'a17', lead: 'Acme Logistics', label: 'Data engineer', detail: 'due since 02/10/2026', value: 18, href: '#a17' }],
//   });
//
// Each row: a lead (a name gives it an identity mark, js/idmark.js; a node is
// used as it is), the label and a detail line, a meter (js/kpi.js setMeter)
// whose tick is the threshold, and the exact figure. The columns are shared
// by every row, so every bar begins and ends in the same place [fix-64];
// under 34rem of the list's width the bar takes a line of its own. The bar
// runs to `max` (default twice the threshold): a value at or past the
// threshold takes the warning tone (the figure on the warning plate), at or
// past `bad` the destructive one, and past `max` the meter's ▸ says so. The
// rows are sorted worst first unless `sort: 'none'`. A row with `href` is a
// link and a row with `pick: true` a button (`kp-bullets-pick` `{ key }`),
// its press area the whole row. A `value` of null is a row with nothing to
// measure: a dash and no bar.
//
// States: `loading` keeps the rows' geometry as waiting rows and lays the
// data table's busy card over them (js/busy-card.js); the rows are drawn once
// the card has gone. `empty` says why there is nothing (`emptyTitle`,
// `emptyText`), `error` says what failed (`message`) with a Retry, a
// normal-size kp-button, that fires `kp-bullets-retry` (`retry: false` leaves
// it out). Both are the package's empty state (`.kp-empty`, each theme's own)
// filling the list's whole footprint, the height it had with its rows, the
// words and the button centred in it, so nothing under it moves (Kenny,
// 2026-10-16: failed, empty and loading fill the component's full normal
// size). A list that never had rows takes `--kp-bullets-state-min`.

import { getStrings } from './strings.js';
import { setMeter } from './kpi.js';
import { setIdmark } from './idmark.js';
import { openBusyCard } from './busy-card.js';

/** A bullet list the page fills with setBullets(). */
export const BULLETS = '[data-kp-bullets]';
/** Fired on the root when a `pick` row is pressed: `{ key }`. */
export const BULLETS_PICK_EVENT = 'kp-bullets-pick';
/** Fired on the root when the Retry of a failed list is pressed. */
export const BULLETS_RETRY_EVENT = 'kp-bullets-retry';

/**
 * @typedef {object} BulletRow
 * @property {string} key
 * @property {string} label
 * @property {string} [detail]
 * @property {number | null} value      null: nothing to measure
 * @property {string} [figure]          the figure as written, in place of format(value)
 * @property {string | Node} [lead]     a name (an identity mark is made) or a node
 * @property {string} [href]            the row is a link
 * @property {boolean} [pick]           the row is a button
 */

/**
 * @typedef {object} BulletsSpec
 * @property {BulletRow[]} [rows]
 * @property {number} threshold
 * @property {number} [max]             where the bar ends (default twice the threshold)
 * @property {number} [bad]             at or past this the row is destructive (default none)
 * @property {(value: number) => string} [format]
 * @property {'worst' | 'none'} [sort]  default 'worst'
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state]
 * @property {string} [message]         the sentence of a failed list
 * @property {boolean} [retry]          false leaves Retry out of a failed list (a read the page cannot repeat)
 * @property {string} [emptyTitle]
 * @property {string} [emptyText]
 * @property {number} [loadingRows]     how many waiting rows (default: the rows shown last, else 3)
 * @property {string} [loadingWords]    what the busy card says
 */

/** @type {WeakMap<HTMLElement, { rows: number, leads: boolean, card: import('./busy-card.js').BusyCard | null, drawn: boolean, pending: BulletsSpec | null, wired: boolean, height: number }>} */
const MEMORY = new WeakMap();

/** @param {Document} doc @param {string} className @param {string} [tag] */
const make = (doc, className, tag = 'span') => {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
};

/**
 * The tone of a value: warning at or past the threshold, destructive at or
 * past `bad`.
 * @param {number | null} value @param {number} threshold @param {number} [bad]
 * @returns {'' | 'warning' | 'destructive'}
 */
export function bulletTone(value, threshold, bad) {
    if (value == null || !Number.isFinite(value)) return '';
    if (bad !== undefined && value >= bad) return 'destructive';
    return value >= threshold ? 'warning' : '';
}

/**
 * Draw (or redraw) a bullet list.
 * @param {HTMLElement} el the root, a `.kp-bullets`
 * @param {BulletsSpec} spec
 */
export function setBullets(el, spec) {
    const memory = MEMORY.get(el) ?? { rows: 3, leads: false, card: null, drawn: false, pending: null, wired: false, height: 0 };
    MEMORY.set(el, memory);
    el.classList.add('kp-bullets');
    el.setAttribute('data-kp-bullets', '');
    if (!memory.wired) {
        memory.wired = true;
        el.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest('[data-kp-bullets-retry]')) el.dispatchEvent(new CustomEvent(BULLETS_RETRY_EVENT, { bubbles: true }));
            const pick = /** @type {HTMLElement | null} */ (target?.closest('button.kp-bullets__link'));
            if (pick) el.dispatchEvent(new CustomEvent(BULLETS_PICK_EVENT, { bubbles: true, detail: { key: pick.dataset.kpBulletsKey } }));
        });
    }
    const state = spec.state ?? 'ready';
    if (state === 'loading') {
        memory.pending = null;
        drawLoading(el, spec, memory);
        return;
    }
    // Leaving the loading state: the data is drawn once the card has gone,
    // so nothing stands under a card on its way out.
    if (memory.card) {
        const card = memory.card;
        memory.card = null;
        memory.pending = spec;
        void card.close().then(() => {
            if (memory.pending !== spec) return;
            memory.pending = null;
            draw(el, spec, memory);
        });
        return;
    }
    draw(el, spec, memory);
}

/** @param {HTMLElement} el @param {BulletsSpec} spec @param {NonNullable<ReturnType<typeof MEMORY.get>>} memory */
function drawLoading(el, spec, memory) {
    const doc = el.ownerDocument;
    el.setAttribute('aria-busy', 'true');
    el.setAttribute('data-kp-state', 'loading');
    const list = make(doc, 'kp-bullets__list', 'ul');
    list.setAttribute('aria-hidden', 'true');
    const count = spec.loadingRows ?? memory.rows;
    const leads = memory.leads || (spec.rows ?? []).some((row) => row.lead !== undefined);
    for (let i = 0; i < count; i += 1) {
        const row = make(doc, 'kp-bullets__row', 'li');
        if (leads) row.append(make(doc, 'kp-idmark kp-idmark--sm kp-skeleton kp-skeleton--block kp-bullets__wait--lead'));
        /** A line one text line high with the theme's waiting line on its foot. @param {string} className */
        const line = (className) => {
            const box = make(doc, `kp-bullets__wait ${className}`);
            box.append(make(doc, 'kp-skeleton'));
            return box;
        };
        const what = make(doc, 'kp-bullets__wait--what');
        what.append(line(''), line(''));
        const meter = make(doc, 'kp-meter kp-bullets__bar');
        setMeter(meter, { loading: true });
        meter.removeAttribute('role');
        row.append(what, meter, line('kp-bullets__wait--figure'));
        list.append(row);
    }
    const keep = memory.card?.layer;
    for (const child of [...el.childNodes]) if (child !== keep) child.remove();
    el.prepend(list);
    if (memory.card) {
        memory.card.place();
        return;
    }
    memory.card = openBusyCard(el, {
        words: spec.loadingWords ?? getStrings().bulletsLoading,
        area: () => [list],
        className: 'kp-bullets__busy',
        arrive: memory.drawn,
    });
    memory.drawn = true;
}

/** @param {HTMLElement} el @param {BulletsSpec} spec @param {NonNullable<ReturnType<typeof MEMORY.get>>} memory */
function draw(el, spec, memory) {
    const doc = el.ownerDocument;
    const strings = getStrings();
    const state = spec.state ?? 'ready';
    const rows = [...(spec.rows ?? [])];
    el.removeAttribute('aria-busy');
    memory.drawn = true;
    const focusedKey = /** @type {HTMLElement | null} */ (el.querySelector('.kp-bullets__link:focus'))?.dataset.kpBulletsKey;

    if (state === 'error' || state === 'empty' || rows.length === 0) {
        const failed = state === 'error';
        el.setAttribute('data-kp-state', failed ? 'error' : 'empty');
        // The note takes the list's whole footprint: the height the rows (or the note before it) had.
        const was = el.querySelector(':scope > :is(.kp-bullets__list, .kp-bullets__note)')?.getBoundingClientRect().height ?? 0;
        memory.height = Math.max(was, memory.height);
        // A focused Retry that goes with its note leaves the focus on the list, so the keyboard keeps its place.
        const refocus = el.querySelector(':scope > .kp-bullets__note')?.contains(doc.activeElement) ?? false;
        const note = make(doc, 'kp-empty kp-bullets__note', 'div');
        if (memory.height > 0) note.style.minBlockSize = `${memory.height}px`;
        if (failed) note.setAttribute('data-kp-tone', 'error');
        note.setAttribute('role', failed ? 'alert' : 'status');
        const title = make(doc, 'kp-empty__title kp-bullets__note-title', 'p');
        title.textContent = failed ? (spec.message ?? strings.bulletsError) : (spec.emptyTitle ?? strings.bulletsEmpty);
        note.append(title);
        if (!failed && spec.emptyText) {
            const text = make(doc, 'kp-empty__body kp-bullets__note-text', 'p');
            text.textContent = spec.emptyText;
            note.append(text);
        }
        if (failed && spec.retry !== false) {
            const retry = make(doc, 'kp-button kp-bullets__retry', 'button');
            retry.setAttribute('type', 'button');
            retry.setAttribute('data-kp-bullets-retry', '');
            retry.textContent = strings.bulletsRetry;
            note.append(retry);
        }
        el.replaceChildren(note);
        if (refocus) {
            el.tabIndex = -1;
            el.focus({ preventScroll: true });
        }
        return;
    }

    el.setAttribute('data-kp-state', 'ready');
    const threshold = spec.threshold;
    const max = spec.max ?? threshold * 2;
    const format =
        spec.format ??
        ((/** @type {number} */ value) =>
            new Intl.NumberFormat(/** @type {HTMLElement | null} */ (el.closest('[lang]'))?.lang || undefined).format(value));
    if (spec.sort !== 'none') rows.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    memory.rows = rows.length;
    memory.leads = rows.some((row) => row.lead !== undefined);

    const list = make(doc, 'kp-bullets__list', 'ul');
    for (const row of rows) {
        const li = make(doc, 'kp-bullets__row', 'li');
        li.dataset.kpBulletsKey = row.key;
        const tone = bulletTone(row.value, threshold, spec.bad);
        if (tone) li.setAttribute('data-kp-tone', tone);
        if (row.lead !== undefined) {
            const lead = make(doc, 'kp-bullets__lead');
            if (typeof row.lead === 'string') {
                const mark = make(doc, 'kp-idmark kp-idmark--sm');
                setIdmark(mark, row.lead);
                lead.append(mark);
            } else lead.append(row.lead);
            li.append(lead);
        } else if (memory.leads) li.append(make(doc, 'kp-bullets__lead'));

        const what = make(doc, 'kp-bullets__what');
        const label = make(doc, 'kp-bullets__label');
        label.title = row.label;
        if (row.href || row.pick) {
            const link = /** @type {HTMLElement} */ (make(doc, 'kp-bullets__link', row.href ? 'a' : 'button'));
            if (row.href) link.setAttribute('href', row.href);
            else link.setAttribute('type', 'button');
            link.dataset.kpBulletsKey = row.key;
            link.textContent = row.label;
            label.append(link);
        } else label.textContent = row.label;
        what.append(label);
        if (row.detail) {
            const detail = make(doc, 'kp-bullets__detail');
            detail.textContent = row.detail;
            detail.title = row.detail;
            what.append(detail);
        }
        li.append(what);

        const figure = make(doc, 'kp-bullets__figure');
        if (row.value == null || !Number.isFinite(row.value)) {
            li.setAttribute('data-kp-bullets-unknown', '');
            const none = make(doc, 'kp-meter kp-bullets__bar kp-bullets__bar-none');
            none.setAttribute('aria-hidden', 'true');
            li.append(none);
            figure.textContent = '—';
            const said = make(doc, 'kp-sr-only');
            said.textContent = strings.bulletsUnknown;
            figure.append(said);
        } else {
            const meter = make(doc, 'kp-meter kp-bullets__bar');
            setMeter(meter, { value: row.value / max, mark: threshold / max, tone: tone || null });
            meter.setAttribute('aria-valuetext', strings.bulletsValueText(row.figure ?? format(row.value), format(threshold)));
            meter.setAttribute('aria-label', row.label);
            li.append(meter);
            figure.textContent = row.figure ?? format(row.value);
        }
        li.append(figure);
        list.append(li);
    }
    el.replaceChildren(list);
    memory.height = list.getBoundingClientRect().height;
    if (focusedKey !== undefined)
        /** @type {HTMLElement | null} */ (
            [...el.querySelectorAll('.kp-bullets__link')].find((link) => /** @type {HTMLElement} */ (link).dataset.kpBulletsKey === focusedKey)
        )?.focus();
}

/**
 * Fill every `[data-kp-bullets]` under `root` that carries its spec as JSON
 * in the attribute (a page that draws with setBullets() needs nothing).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachBullets(root = document) {
    for (const el of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(BULLETS))) {
        const json = el.getAttribute('data-kp-bullets') ?? '';
        if (json.trim().startsWith('{') && !MEMORY.has(el)) {
            try {
                setBullets(el, JSON.parse(json));
            } catch (error) {
                console.error(error);
            }
        }
    }
    return () => {};
}
