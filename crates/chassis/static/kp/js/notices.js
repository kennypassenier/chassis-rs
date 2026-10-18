// The notification centre [kpadopt5-ops; spec item 20].
//
// A counter with the exact number, a panel with the newest notices, a switch per source and "Quiet until …" in plain
// words, plus the same list as a full Inbox page. Kenny, 2026-10-17: "Paneel met de nieuwste, plus de Inbox-pagina".
//
//   <div class="kp-notices" data-kp-notices data-kp-inbox-href="/inbox"></div>
//   setNotices(el, { state: 'ready', items: [{ key, severity: 'critical', title, since, consequence, remedy, fix: { label } }] })
//
// A notice is what homelab's Inbox rows are (decision of 2026-09-30): what happened, since when, what it affects, what to do
// and a Fix button. Looks (`data-kp-notices-look`):
//
//   both    the default: the counter opens a panel with the newest notices and a link "All 37 in the Inbox"
//   panel   the same panel without that link
//   page    no counter and no panel: the list stands in the page, with the per-source switches (the Inbox page)
//
// Options, each an attribute and a JS option of attachNotices(root, options):
//
//   data-kp-count            the number the counter shows when it is not the number of unread notices (exact, never "9+")
//   data-kp-count-in-title   "off" leaves the tab title alone (default: "(5) " in front of it)
//   data-kp-order            severity (default: worst first, then newest) | time
//   data-kp-read             explicit (default: Mark read per row and Mark all read) | on-open (opening the panel reads all)
//   data-kp-panel-max        newest per severity in the panel (default 10), then "All 37 in the Inbox", exact
//   data-kp-toast-new        none | severe (default: a new critical notice also toasts) | all
//   data-kp-inbox-href       where the Inbox link goes (it also fires `kp-notices-open-inbox`)
//   data-kp-keys             "off" leaves the keys alone: g then i opens the Inbox, m marks the focused notice read
//
// States: ready; loading (rows as the theme's busy card over the list; the counter holds its place); empty ("Nothing
// waiting", the theme's empty plate at the panel's full height); error (the destructive plate with Retry; the counter says
// "?" and its label says why); quiet (`quietUntil`: the counter is muted with a moon and "Quiet until 09:00", End quiet).
// A phone: the panel is a full-height sheet. New notices are announced politely, critical ones assertively, once.
//
// Events (bubbling, on the root):
//   kp-notice-fix          { key }
//   kp-notice-read         { key, read }
//   kp-notices-read-all    {}
//   kp-notices-source      { source, muted }
//   kp-notices-retry       {}
//   kp-notices-end-quiet   {}
//   kp-notices-open-inbox  {}
//
// Every word is in js/strings.js. Nothing runs on import; attachNotices(root) returns a detach.

import { openBusyCard } from './busy-card.js';
import { agoMoment, attachAgo, setAgo } from './freshness.js';
import { toast } from './overlays.js';
import { statePlate } from './state-plate.js';
import { getStrings } from './strings.js';

/** A notification centre. */
export const NOTICES = '[data-kp-notices]';
export const NOTICE_FIX_EVENT = 'kp-notice-fix';
export const NOTICE_READ_EVENT = 'kp-notice-read';
export const NOTICES_READ_ALL_EVENT = 'kp-notices-read-all';
export const NOTICES_SOURCE_EVENT = 'kp-notices-source';
export const NOTICES_RETRY_EVENT = 'kp-notices-retry';
export const NOTICES_END_QUIET_EVENT = 'kp-notices-end-quiet';
export const NOTICES_INBOX_EVENT = 'kp-notices-open-inbox';
/** The severities, worst first. */
export const NOTICE_SEVERITIES = /** @type {const} */ (['critical', 'warning', 'info']);

/**
 * @typedef {object} Notice
 * @property {string} key stable id: the same key is the same row on every refresh
 * @property {'critical' | 'warning' | 'info'} severity
 * @property {string} title what happened, in one line
 * @property {number} since when, ms since the epoch
 * @property {string} [consequence] what it affects
 * @property {string} [remedy] what to do
 * @property {{ label: string }} [fix] the action that fixes it
 * @property {boolean} [read]
 * @property {string} [source] the source it came from (a key of `sources`)
 * @typedef {object} NoticeSource
 * @property {string} key @property {string} label @property {boolean} [muted]
 * @typedef {object} NoticesModel
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state]
 * @property {Notice[]} [items]
 * @property {NoticeSource[]} [sources]
 * @property {number | string | null} [quietUntil] ISO or epoch ms
 * @property {string} [error] why it could not be read
 * @typedef {object} NoticesHandle
 * @property {HTMLElement} element
 * @property {(model: NoticesModel) => void} set
 * @property {() => number} count the number the counter shows
 * @property {() => void} open open the panel
 */

/** @type {WeakMap<Element, NoticesHandle>} */
const handles = new WeakMap();

/** The handle of an attached centre. @param {Element} element */
export const noticesOf = (element) => handles.get(element) ?? null;

/**
 * Give a centre its notices.
 * @param {Element} element @param {NoticesModel} model
 */
export function setNotices(element, model) {
    handles.get(element)?.set(model);
}

/** @param {number | string | null | undefined} v @returns {number | null} */
const toMs = (v) => {
    if (v === null || v === undefined) return null;
    const ms = typeof v === 'number' ? v : Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
};

/**
 * Wire every notification centre under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachNotices(root = document) {
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(NOTICES) ? [root] : []),
        ...root.querySelectorAll(NOTICES),
    ]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const el of found) if (!handles.has(el)) undo.push(wire(el));
    undo.push(attachAgo(root));
    return () => undo.forEach((u) => u());
}

let idSeq = 0;

/** @param {HTMLElement} el @returns {() => void} */
function wire(el) {
    const doc = el.ownerDocument;
    const view = /** @type {Window} */ (doc.defaultView);
    const s = () => getStrings();
    const look = () => el.getAttribute('data-kp-notices-look') ?? 'both';
    const isPage = () => look() === 'page';
    const make = (/** @type {string} */ tag, /** @type {string} */ className, /** @type {string} */ text = '') => {
        const node = doc.createElement(tag);
        node.className = className;
        if (text) node.textContent = text;
        return node;
    };
    const id = `kp-notices-${(idSeq += 1)}`;
    el.classList.add('kp-notices');

    /** @type {NoticesModel} */
    let model = { state: 'ready', items: [] };
    const readKeys = new Set();
    /** @type {Set<string> | null} */
    let seen = null;
    /** @type {import('./busy-card.js').BusyCard | null} */
    let busy = null;
    let baseTitle = '';
    let titled = false;

    // --- The parts. ---
    const trigger = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-notices__trigger'));
    trigger.type = 'button';
    const triggerLabel = make('span', 'kp-notices__label');
    const badge = make('span', 'kp-badge kp-notices__count');
    const moon = make('span', 'kp-notices__moon', '☾');
    moon.setAttribute('aria-hidden', 'true');
    trigger.append(moon, triggerLabel, badge);
    const quietLine = make('span', 'kp-notices__quiet');
    const panel = make('div', 'kp-popover kp-notices__panel');
    panel.id = id;
    panel.setAttribute('popover', 'auto');
    panel.setAttribute('role', 'dialog');
    const area = look() === 'page' ? el : panel;
    void area;
    const head = make('div', 'kp-notices__head');
    const heading = make('strong', 'kp-notices__heading');
    const tools = make('div', 'kp-notices__tools');
    const readAll = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-button--sm kp-notices__read-all'));
    readAll.type = 'button';
    const endQuiet = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-button--sm kp-notices__end-quiet'));
    endQuiet.type = 'button';
    tools.append(quietLine, endQuiet, readAll);
    head.append(heading, tools);
    const body = make('div', 'kp-notices__body');
    const list = make('ul', 'kp-notices__list');
    list.setAttribute('aria-label', s().noticesList);
    const state = make('div', 'kp-notices__state');
    state.hidden = true;
    body.append(list, state);
    const sourcesBox = make('div', 'kp-notices__sources');
    const foot = make('div', 'kp-notices__foot');
    const inbox = /** @type {HTMLAnchorElement} */ (make('a', 'kp-notices__inbox'));
    foot.append(inbox);
    const voice = make('span', 'kp-sr-only');
    voice.setAttribute('role', 'status');

    if (isPage()) {
        const wrap = make('section', 'kp-notices__page');
        wrap.append(head, body, sourcesBox);
        el.replaceChildren(wrap, voice);
    } else {
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('popovertarget', id);
        trigger.style.setProperty('anchor-name', `--${id}`);
        panel.style.setProperty('position-anchor', `--${id}`);
        panel.append(head, body, sourcesBox, foot);
        el.replaceChildren(trigger, panel, voice);
    }

    // --- The model, ordered. ---
    const items = () => model.items ?? [];
    const isRead = (/** @type {Notice} */ n) => n.read === true || readKeys.has(n.key);
    const unread = () => items().filter((n) => !isRead(n));
    const countNow = () => {
        const given = Number(el.getAttribute('data-kp-count'));
        return el.hasAttribute('data-kp-count') && Number.isFinite(given) ? given : unread().length;
    };
    const ordered = () => {
        const by = el.getAttribute('data-kp-order') === 'time' ? 'time' : 'severity';
        const rank = (/** @type {Notice} */ n) => NOTICE_SEVERITIES.indexOf(n.severity);
        const list2 = [...items()];
        // A muted source's notices stay in the Inbox page but are not counted in the panel's newest.
        return list2.sort((a, b) => (by === 'severity' && rank(a) !== rank(b) ? rank(a) - rank(b) : b.since - a.since));
    };
    const panelItems = () => {
        const max = Math.max(1, Number(el.getAttribute('data-kp-panel-max') ?? 10) || 10);
        const taken = { critical: 0, warning: 0, info: 0 };
        return ordered().filter((n) => (taken[n.severity] += 1) <= max);
    };

    // --- Rendering. ---
    const quiet = () => {
        const q = toMs(model.quietUntil);
        return q !== null && q > Date.now() ? q : null;
    };
    const quietText = () => {
        const q = quiet();
        if (q === null) return '';
        const sameDay = agoMoment(q).slice(0, 10) === agoMoment(Date.now()).slice(0, 10);
        return s().noticesQuiet(sameDay ? agoMoment(q).slice(11) : agoMoment(q));
    };
    const counterText = () => {
        if (model.state === 'error') return '?';
        if (model.state === 'loading') return '…';
        const n = countNow();
        return n > 0 ? String(n) : '';
    };
    const counterLabel = () => {
        if (model.state === 'error') return s().noticesCounterError(model.error ?? s().noticesErrorText);
        if (model.state === 'loading') return s().noticesLoading;
        const n = countNow();
        return n > 0 ? s().noticesUnread(n) : s().noticesNoneUnread;
    };
    /** @param {Notice} n */
    function row(n) {
        const li = make('li', 'kp-notices__item');
        li.setAttribute('data-kp-key', n.key);
        li.setAttribute('data-kp-severity', n.severity);
        li.toggleAttribute('data-kp-unread', !isRead(n));
        li.tabIndex = 0;
        const mark = make('span', 'kp-notices__mark', n.severity === 'info' ? 'i' : '!');
        mark.setAttribute('aria-hidden', 'true');
        const text = make('div', 'kp-notices__text');
        const title = make('strong', 'kp-notices__title');
        const word = make(
            'span',
            'kp-sr-only',
            `${n.severity === 'critical' ? s().attentionCritical : n.severity === 'warning' ? s().attentionWarning : s().attentionInfo}: `,
        );
        title.append(word, n.title);
        const since = /** @type {HTMLElement} */ (make('time', 'kp-ago kp-notices__since'));
        since.setAttribute('data-kp-ago', '');
        since.setAttribute('data-kp-ago-verb', s().noticesSinceVerb);
        text.append(title, since);
        if (n.consequence) text.append(make('span', 'kp-notices__consequence', n.consequence));
        if (n.remedy) text.append(make('span', 'kp-notices__remedy', n.remedy));
        const actions = make('div', 'kp-notices__actions');
        // Same function, same place [Kenny, 2026-10-17 22:09]: Mark read / Mark unread is the first slot of the actions
        // grid in every row, the fix (when the notice has one) the second, so the buttons stand under each other.
        // The button is as wide as the longer of its two words in the button's own type, so it never spills and the second slot
        // starts in the same place in every row, whichever word a row shows [t56-words-1018].
        const mine = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-button--sm kp-button--ghost kp-notices__mark-read'));
        const face = make('span', 'kp-notices__mark-face');
        face.style.setProperty('--kp-notices-sizer', JSON.stringify(isRead(n) ? s().noticesMarkRead : s().noticesMarkUnread));
        face.append(make('span', 'kp-notices__mark-label', isRead(n) ? s().noticesMarkUnread : s().noticesMarkRead));
        mine.append(face);
        mine.type = 'button';
        mine.setAttribute('data-kp-notice-read', n.key);
        actions.append(mine);
        if (n.fix) {
            const fix = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-button--sm kp-notices__fix', n.fix.label));
            fix.type = 'button';
            fix.setAttribute('data-kp-notice-fix', n.key);
            actions.append(fix);
        }
        li.append(mark, text, actions);
        setAgo(since, n.since);
        return li;
    }
    function render() {
        const t = s();
        const st = model.state ?? 'ready';
        el.setAttribute('data-kp-state', st);
        const q = quiet();
        el.toggleAttribute('data-kp-quiet', q !== null);
        // The counter: exact, with a place of its own width.
        const text = counterText();
        badge.textContent = text || '0';
        badge.classList.toggle('kp-notices__count--zero', !text);
        badge.setAttribute('data-kp-count', text);
        triggerLabel.textContent = t.noticesInbox;
        trigger.setAttribute('aria-label', t.noticesCounterName(t.noticesInbox, counterLabel(), q !== null ? quietText() : ''));
        moon.hidden = q === null;
        quietLine.textContent = quietText();
        quietLine.hidden = q === null;
        endQuiet.textContent = t.noticesEndQuiet;
        endQuiet.hidden = q === null;
        heading.textContent = isPage() ? t.noticesPageTitle : t.noticesTitle;
        readAll.textContent = t.noticesReadAll;
        readAll.disabled = unread().length === 0 || st !== 'ready';
        inbox.textContent = t.noticesAllInInbox(items().length);
        inbox.href = el.getAttribute('data-kp-inbox-href') ?? '#';
        foot.hidden = look() !== 'both';
        // The list.
        const visible = isPage() ? ordered() : panelItems();
        const focusKey =
            doc.activeElement instanceof HTMLElement ? doc.activeElement.closest('.kp-notices__item')?.getAttribute('data-kp-key') : null;
        const focusControl =
            doc.activeElement instanceof HTMLElement
                ? doc.activeElement.getAttribute('data-kp-notice-fix') !== null
                    ? 'fix'
                    : doc.activeElement.getAttribute('data-kp-notice-read') !== null
                      ? 'read'
                      : ''
                : '';
        list.replaceChildren(...(st === 'ready' ? visible.map(row) : []));
        list.hidden = st !== 'ready';
        state.hidden = st === 'ready' || st === 'loading';
        if (st === 'empty') state.replaceChildren(statePlate(doc, { kind: 'empty', title: t.noticesEmpty, text: t.noticesEmptyText }));
        else if (st === 'error')
            state.replaceChildren(
                statePlate(doc, {
                    kind: 'error',
                    title: t.noticesErrorTitle,
                    text: model.error ?? t.noticesErrorText,
                    actionLabel: t.noticesRetry,
                    actionAttribute: 'data-kp-notices-retry',
                }),
            );
        else state.replaceChildren();
        body.setAttribute('aria-busy', String(st === 'loading'));
        if (st === 'loading' && !busy)
            busy = openBusyCard(body, { words: t.noticesLoading, area: () => [body], className: 'kp-notices__busy', arrive: false });
        else if (st !== 'loading' && busy) {
            const b = busy;
            busy = null;
            void b.close();
        }
        // Sources: a switch per source.
        sourcesBox.replaceChildren();
        const sources = model.sources ?? [];
        sourcesBox.hidden = !isPage() || sources.length === 0;
        if (sources.length) {
            sourcesBox.append(make('strong', 'kp-notices__sources-title', t.noticesSources));
            for (const src of sources) {
                const label = make('label', 'kp-switch kp-notices__source');
                const input = /** @type {HTMLInputElement} */ (make('input', 'kp-switch__input'));
                input.type = 'checkbox';
                input.setAttribute('role', 'switch');
                input.checked = src.muted === true;
                input.setAttribute('data-kp-source', src.key);
                const words = make('span', 'kp-notices__source-label', src.label);
                label.append(input, words, make('span', 'kp-notices__source-state', input.checked ? t.noticesMuted : t.noticesNotMuted));
                sourcesBox.append(label);
            }
        }
        // Keep the focus where it was across a live refresh.
        if (focusKey) {
            const again = list.querySelector(`[data-kp-key="${CSS.escape(focusKey)}"]`);
            const target =
                again instanceof HTMLElement
                    ? focusControl
                        ? again.querySelector(focusControl === 'fix' ? '[data-kp-notice-fix]' : '[data-kp-notice-read]')
                        : again
                    : null;
            if (target instanceof HTMLElement) target.focus({ preventScroll: true });
        }
        paintTitle();
    }
    function paintTitle() {
        if (el.getAttribute('data-kp-count-in-title') === 'off') return;
        const n = model.state === 'ready' ? countNow() : 0;
        if (!titled && n > 0) baseTitle = doc.title;
        if (n > 0) doc.title = `(${n}) ${baseTitle}`;
        else if (titled) doc.title = baseTitle;
        titled = n > 0;
    }
    /** New notices are announced once, critical ones assertively; a toast for the severe ones. @param {Notice[]} fresh */
    function announce(fresh) {
        if (!fresh.length) return;
        const t = s();
        const worst = fresh.find((n) => n.severity === 'critical') ?? fresh[0];
        if (!worst) return;
        voice.setAttribute('role', worst.severity === 'critical' ? 'alert' : 'status');
        voice.textContent = fresh.length > 1 ? t.noticesNewMany(fresh.length, worst.title) : t.noticesNew(worst.title);
        const mode = el.getAttribute('data-kp-toast-new') ?? 'severe';
        const toasted = mode === 'all' ? fresh : mode === 'severe' ? fresh.filter((n) => n.severity === 'critical') : [];
        for (const n of toasted) toast(n.title, { live: n.severity === 'critical' ? 'assertive' : 'polite', close: true, ms: 8000 });
    }

    /** @param {NoticesModel} next */
    const set = (next) => {
        model = { ...model, ...next };
        const keys = new Set(items().map((n) => n.key));
        if (seen !== null) announce(items().filter((n) => !seen?.has(n.key) && !isRead(n)));
        seen = keys;
        if (next.state === undefined && (model.items?.length ?? 0) === 0 && model.state === 'ready') model.state = 'empty';
        render();
    };

    // --- Events. ---
    /** @param {Event} event */
    const onClick = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const fix = target.closest('[data-kp-notice-fix]');
        if (fix) {
            el.dispatchEvent(new CustomEvent(NOTICE_FIX_EVENT, { bubbles: true, detail: { key: fix.getAttribute('data-kp-notice-fix') } }));
            return;
        }
        const mark = target.closest('[data-kp-notice-read]');
        if (mark) {
            const key = mark.getAttribute('data-kp-notice-read') ?? '';
            const now = !readKeys.has(key) && !items().find((n) => n.key === key)?.read;
            if (now) readKeys.add(key);
            else {
                readKeys.delete(key);
                const found = items().find((n) => n.key === key);
                if (found) found.read = false;
            }
            render();
            el.dispatchEvent(new CustomEvent(NOTICE_READ_EVENT, { bubbles: true, detail: { key, read: now } }));
            return;
        }
        if (target.closest('.kp-notices__read-all')) {
            for (const n of items()) readKeys.add(n.key);
            render();
            el.dispatchEvent(new CustomEvent(NOTICES_READ_ALL_EVENT, { bubbles: true, detail: {} }));
        } else if (target.closest('.kp-notices__end-quiet'))
            el.dispatchEvent(new CustomEvent(NOTICES_END_QUIET_EVENT, { bubbles: true, detail: {} }));
        else if (target.closest('[data-kp-notices-retry]')) el.dispatchEvent(new CustomEvent(NOTICES_RETRY_EVENT, { bubbles: true, detail: {} }));
        else if (target.closest('.kp-notices__inbox')) {
            const go = el.dispatchEvent(new CustomEvent(NOTICES_INBOX_EVENT, { bubbles: true, cancelable: true, detail: {} }));
            if (!go || inbox.getAttribute('href') === '#') event.preventDefault();
        }
    };
    /** @param {Event} event */
    const onChange = (event) => {
        const input = event.target instanceof HTMLInputElement ? event.target : null;
        if (!input?.hasAttribute('data-kp-source')) return;
        const key = input.getAttribute('data-kp-source') ?? '';
        const found = (model.sources ?? []).find((x) => x.key === key);
        if (found) found.muted = input.checked;
        const stateWord = input.parentElement?.querySelector('.kp-notices__source-state');
        if (stateWord) stateWord.textContent = input.checked ? s().noticesMuted : s().noticesNotMuted;
        el.dispatchEvent(new CustomEvent(NOTICES_SOURCE_EVENT, { bubbles: true, detail: { source: key, muted: input.checked } }));
    };
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    const onToggle = (/** @type {Event} */ event) => {
        if (/** @type {ToggleEvent} */ (event).newState === 'open' && el.getAttribute('data-kp-read') === 'on-open' && unread().length) {
            for (const n of items()) readKeys.add(n.key);
            render();
            el.dispatchEvent(new CustomEvent(NOTICES_READ_ALL_EVENT, { bubbles: true, detail: {} }));
        }
    };
    panel.addEventListener('toggle', onToggle);
    /** The keys: g then i opens the Inbox, m marks the focused notice read. @type {number} */
    let gAt = 0;
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        if (el.getAttribute('data-kp-keys') === 'off' || event.ctrlKey || event.metaKey || event.altKey) return;
        const t = event.target;
        if (t instanceof HTMLElement && t.matches('input, textarea, select, [contenteditable]')) return;
        if (event.key === 'g') gAt = Date.now();
        else if (event.key === 'i' && Date.now() - gAt < 1200) {
            gAt = 0;
            el.dispatchEvent(new CustomEvent(NOTICES_INBOX_EVENT, { bubbles: true, detail: {} }));
        } else if (event.key === 'm') {
            const row2 = t instanceof HTMLElement ? t.closest('.kp-notices__item') : null;
            if (row2 && el.contains(row2)) row2.querySelector('[data-kp-notice-read]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
    };
    doc.addEventListener('keydown', onKey);

    /** @type {NoticesHandle} */
    const handle = { element: el, set, count: countNow, open: () => panel.showPopover?.() };
    handles.set(el, handle);
    render();
    return () => {
        el.removeEventListener('click', onClick);
        el.removeEventListener('change', onChange);
        panel.removeEventListener('toggle', onToggle);
        doc.removeEventListener('keydown', onKey);
        busy?.remove();
        if (titled) doc.title = baseTitle;
        handles.delete(el);
        void view;
    };
}
