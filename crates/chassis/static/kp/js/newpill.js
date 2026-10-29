// The "N new lines" pill on a live list or log [kpadopt5; homelab's `.hl-newpill`, kyu's live messages].
//
// A list that grows while it is read (a log, a feed of messages) follows its
// newest row as long as the reader is at that end. The moment the reader
// scrolls away, rows that arrive out of sight are counted in a pill that says so
// and jumps back with one press: "12 new lines · back to the tail".
//
//   <div data-kp-newpill-host>
//       <ul data-kp-follow="tail" data-kp-follow-threshold="24" data-kp-pill-unit="line,lines" class="log">…rows…</ul>
//   </div>
//
// The element marked `data-kp-follow` is the scroller (it must scroll, `overflow:
// auto`); its element children are the rows. The pill is drawn in its parent, which
// becomes the positioned host (`[data-kp-newpill-host]`), so it never scrolls with the
// rows. Options, as attributes and as the second argument of attachNewPills():
//
//   data-kp-follow            `tail` (default) | `head`: where new rows arrive (head: a newest-first list)
//   data-kp-follow-threshold  px from the end that still count as following (default 24)
//   data-kp-pill-placement    `bottom` | `top`; default the end the rows arrive at; read again when it changes (js/live-options.js)
//   data-kp-pill-unit         "line,lines": the app's word for a row, singular and plural
//   data-kp-since-left        on by default: a divider "New since 14:32" before the first row that came while the tab was away;
//                             `off` leaves it out (read each time, so it can be switched at runtime)
//   data-kp-follow-key        the key that jumps back and follows again (default End, Home for `head`)
//   data-kp-follow-space      Space pauses and resumes following, for a log
//   data-kp-follow-rows       `children` (default): the scroller's element children are the rows. `tbody`: the rows are the
//                             `<tr>` that arrive in a table body inside the scroller (a datatable in a scrolling box) [wish-1028,
//                             almanac 9]. A row counts once: a row whose `data-kp-row-key` (or id) the pill has already seen
//                             is the same row coming back after a sort, a filter or a page change, and is not new. Detail,
//                             group and held rows are not rows. Read when the pill attaches.
//
// A row counts only while it is shown: a filter that hides it (the `hidden`
// attribute) takes it out of the count, and the count is exact. Scrolling back
// to the end follows again by itself. A button marked `data-kp-follow-toggle="<id>"`
// pauses and resumes the following and says which it will do. The count is said
// to a screen reader at most every ten seconds.

import { getStrings } from './strings.js';
import { watchOptions } from './live-options.js';

/** The scrollers this module looks after. */
export const FOLLOW = '[data-kp-follow]';
/** Fired on the scroller when following starts or stops, or the count changes: `{ following, paused, unseen }`. */
export const FOLLOW_EVENT = 'kp-follow-change';
/** Fired on the scroller when the pill is pressed: `{ unseen }`. */
export const NEWPILL_JUMP_EVENT = 'kp-newpill-jump';
/** px from the end that still count as following. */
export const FOLLOW_THRESHOLD = 24;
/** How often a screen reader hears the count [ms]. */
export const NEWPILL_SAY_MS = 10000;

/**
 * @typedef {object} NewPillOptions
 * @property {'tail' | 'head'} [follow]
 * @property {number} [threshold]
 * @property {'bottom' | 'top'} [placement]
 * @property {string} [unit] "line,lines"
 * @property {boolean} [sinceLeft]
 * @property {string} [key]
 * @property {boolean} [space]
 * @property {'children' | 'tbody'} [rows] where the rows arrive: the scroller's children (default) or the rows of a table body inside it
 */

/**
 * @typedef {object} NewPillHandle
 * @property {() => void} pause stop following; new rows are counted
 * @property {() => void} resume jump to the end and follow
 * @property {() => void} jump same as resume
 * @property {() => number} unseen how many shown rows arrived out of sight
 * @property {() => boolean} following
 */

/** @type {WeakMap<Element, NewPillHandle>} */
const HANDLES = new WeakMap();

/**
 * The handle of a scroller.
 * @param {Element} el
 * @returns {NewPillHandle | null}
 */
export function newPill(el) {
    return HANDLES.get(el) ?? null;
}

/** @param {Element} el */
const isRow = (el) => !el.classList.contains('kp-newpill__since') && !el.hasAttribute('data-kp-newpill-skip');

/** A row of a table body that counts as one: not a detail, group, held or divider row. @param {Element} el */
const isTableRow = (el) =>
    el.tagName === 'TR' && isRow(el) && !el.matches('[data-kp-row-detail], [data-kp-row-group], [data-kp-row-hidden]');

/** The key a row is known by when a sort or filter brings it back, or `''`. @param {Element} row */
const rowKeyOf = (row) => /** @type {HTMLElement} */ (row).dataset?.kpRowKey || row.id || '';

/**
 * @param {HTMLElement} el
 * @param {NewPillOptions} options
 * @returns {() => void}
 */
function attachOne(el, options) {
    if (HANDLES.has(el)) return () => undefined;
    const doc = el.ownerDocument;
    const view = doc.defaultView;
    const strings = getStrings();
    const head = (options.follow ?? el.getAttribute('data-kp-follow')) === 'head';
    const threshold = options.threshold ?? (Number(el.getAttribute('data-kp-follow-threshold')) || FOLLOW_THRESHOLD);
    // Read again when `data-kp-pill-placement` changes [live-options-1019].
    const placementNow = () => {
        const asked = options.placement ?? el.getAttribute('data-kp-pill-placement');
        return asked === 'top' ? 'top' : asked === 'bottom' ? 'bottom' : head ? 'top' : 'bottom';
    };
    const unitRaw = (options.unit ?? el.getAttribute('data-kp-pill-unit') ?? '').split(/[,/]/).map((w) => w.trim());
    const unitOne = unitRaw[0] || strings.newpillUnitOne;
    const unitMany = unitRaw[1] || (unitRaw[0] ? `${unitRaw[0]}s` : strings.newpillUnitMany);
    const sinceLeft = () => options.sinceLeft ?? !['off', 'false'].includes(el.getAttribute('data-kp-since-left') ?? '');
    const keyName = options.key ?? el.getAttribute('data-kp-follow-key') ?? (head ? 'Home' : 'End');
    const space = options.space ?? el.hasAttribute('data-kp-follow-space');
    const inTbody = (options.rows ?? el.getAttribute('data-kp-follow-rows')) === 'tbody';

    const host = el.parentElement;
    host?.setAttribute('data-kp-newpill-host', '');
    const pill = /** @type {HTMLButtonElement} */ (doc.createElement('button'));
    pill.type = 'button';
    pill.className = 'kp-newpill kp-button';
    pill.setAttribute('data-kp-pill-placement', placementNow());
    const stopOptions = watchOptions(el, ['data-kp-pill-placement'], () => pill.setAttribute('data-kp-pill-placement', placementNow()));
    pill.hidden = true;
    const number = doc.createElement('span');
    number.className = 'kp-newpill__count';
    const back = doc.createElement('span');
    back.className = 'kp-newpill__back';
    pill.append(number, back);
    const live = doc.createElement('div');
    live.className = 'kp-sr-only';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    host?.append(pill, live);

    let following = true;
    let paused = false;
    /** The rows that came while the reader was elsewhere. @type {Set<Element>} */
    const unseen = new Set();
    let programmatic = false;
    /** In `tbody` mode: the keys of the rows already seen, so a sort or a filter that re-adds them counts none. @type {Set<string>} */
    const known = new Set();
    if (inTbody) for (const row of el.querySelectorAll('tbody > tr')) if (isTableRow(row) && rowKeyOf(row)) known.add(rowKeyOf(row));
    let lastSaid = 0;
    /** @type {number | undefined} */
    let sayLater;

    const count = () => [...unseen].filter((row) => row.isConnected && !(/** @type {HTMLElement} */ (row).hidden) && !row.closest('[hidden]')).length;
    const atEnd = () => (head ? el.scrollTop <= threshold : el.scrollHeight - el.clientHeight - el.scrollTop <= threshold);
    const toEnd = () => {
        programmatic = true;
        el.scrollTop = head ? 0 : el.scrollHeight;
        view?.requestAnimationFrame(() => view.requestAnimationFrame(() => (programmatic = false)));
    };

    const toggles = () => /** @type {HTMLElement[]} */ (el.id ? [...doc.querySelectorAll(`[data-kp-follow-toggle="${el.id}"]`)] : []);

    /** The pill is ruled in, and taken out the way it came [prefers-reduced-motion: at once]. @param {boolean} on */
    const show = (on) => {
        const reduce = typeof view?.matchMedia === 'function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (on) {
            pill.removeAttribute('data-kp-leaving');
            pill.hidden = false;
            return;
        }
        if (pill.hidden || pill.hasAttribute('data-kp-leaving')) return;
        if (reduce) {
            pill.hidden = true;
            return;
        }
        pill.setAttribute('data-kp-leaving', '');
        const finish = () => {
            if (!pill.hasAttribute('data-kp-leaving')) return;
            pill.removeAttribute('data-kp-leaving');
            pill.hidden = true;
        };
        pill.addEventListener('animationend', finish, { once: true });
        view?.setTimeout(finish, 700);
    };

    const draw = () => {
        const n = count();
        show(n > 0);
        // The words of the last count stay on the pill while it is taken out.
        if (n > 0) {
            number.textContent = strings.newpillNew(n, n === 1 ? unitOne : unitMany);
            back.textContent = head ? strings.newpillBackHead : strings.newpillBackTail;
        }
        el.setAttribute('data-kp-following', String(following && !paused));
        for (const toggle of toggles()) {
            const off = paused || !following;
            toggle.setAttribute('aria-pressed', String(off));
            toggle.textContent = off ? strings.newpillResume : strings.newpillPause;
        }
        el.dispatchEvent(new CustomEvent(FOLLOW_EVENT, { bubbles: true, detail: { following: following && !paused, paused, unseen: n } }));
        // A screen reader hears the count now and then, not on every row.
        if (n > 0) {
            const now = performance.now();
            const wait = NEWPILL_SAY_MS - (now - lastSaid);
            const say = () => {
                lastSaid = performance.now();
                const m = count();
                if (m > 0) live.textContent = strings.newpillAnnounce(m, m === 1 ? unitOne : unitMany);
            };
            if (wait <= 0) say();
            else if (sayLater === undefined) {
                sayLater = view?.setTimeout(() => {
                    sayLater = undefined;
                    say();
                }, wait);
            }
        }
    };

    const jump = () => {
        paused = false;
        following = true;
        unseen.clear();
        toEnd();
        draw();
        el.dispatchEvent(new CustomEvent(NEWPILL_JUMP_EVENT, { bubbles: true, detail: { unseen: 0 } }));
    };
    const pause = () => {
        paused = true;
        following = false;
        draw();
    };

    /** @type {number} */
    let hiddenAt = 0;
    /** @type {Element | null} */
    let firstAway = null;
    const observer =
        view && 'MutationObserver' in view
            ? new view.MutationObserver((records) => {
                  let added = false;
                  for (const record of records) {
                      for (const node of record.addedNodes) {
                          if (!(node instanceof Element)) continue;
                          if (inTbody) {
                              if (!(record.target instanceof Element) || record.target.tagName !== 'TBODY' || !isTableRow(node)) continue;
                              const key = rowKeyOf(node);
                              if (key && known.has(key)) continue;
                              if (key) known.add(key);
                          } else if (!isRow(node)) continue;
                          added = true;
                          if (hiddenAt && !firstAway) firstAway = node;
                          if (!(following && !paused)) unseen.add(node);
                      }
                  }
                  if (!added) return;
                  if (following && !paused) toEnd();
                  draw();
              })
            : null;
    observer?.observe(el, inTbody ? { childList: true, subtree: true } : { childList: true });

    /** The reader scrolled: away from the end stops following, back to it follows again. */
    const onScroll = () => {
        if (programmatic) return;
        if (atEnd()) {
            if (!following || paused) {
                // Back at the end by hand: following again by itself, and everything is seen.
                paused = false;
                following = true;
                unseen.clear();
                draw();
            }
        } else if (following) {
            following = false;
            draw();
        }
    };
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('input, textarea, select, button, a')) return;
        if (event.key === keyName) {
            event.preventDefault();
            jump();
        } else if (space && event.key === ' ') {
            event.preventDefault();
            if (paused || !following) jump();
            else pause();
        }
    };
    /** @param {Event} event */
    const onToggle = (event) => {
        const toggle = event.target instanceof Element ? event.target.closest('[data-kp-follow-toggle]') : null;
        if (!toggle || toggle.getAttribute('data-kp-follow-toggle') !== el.id) return;
        if (paused || !following) jump();
        else pause();
    };

    // The divider for the rows that came while the tab was away.
    const onVisibility = () => {
        if (!sinceLeft()) return;
        if (doc.visibilityState === 'hidden') {
            hiddenAt = Date.now();
            firstAway = null;
            return;
        }
        if (!hiddenAt) return;
        const row = firstAway;
        const left = new Date(hiddenAt);
        hiddenAt = 0;
        firstAway = null;
        for (const old of el.querySelectorAll(inTbody ? '.kp-newpill__since' : ':scope > .kp-newpill__since')) old.remove();
        if (!row || !row.isConnected) return;
        const tag = row.tagName === 'TR' ? 'tr' : el.tagName === 'UL' || el.tagName === 'OL' ? 'li' : el.tagName === 'TBODY' ? 'tr' : 'div';
        const line = doc.createElement(tag);
        line.className = 'kp-newpill__since';
        line.setAttribute('role', 'separator');
        const time = `${String(left.getHours()).padStart(2, '0')}:${String(left.getMinutes()).padStart(2, '0')}`;
        if (tag === 'tr') {
            const cell = doc.createElement('td');
            cell.colSpan = 99;
            cell.textContent = strings.newpillSince(time);
            line.append(cell);
        } else line.textContent = strings.newpillSince(time);
        row.before(line);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('keydown', onKey);
    pill.addEventListener('click', jump);
    doc.addEventListener('click', onToggle);
    doc.addEventListener('visibilitychange', onVisibility);
    // The list opens at the end the rows arrive at (once it has been laid out).
    view?.requestAnimationFrame(() => view.requestAnimationFrame(() => following && !paused && el.scrollHeight > el.clientHeight && toEnd()));
    draw();

    HANDLES.set(el, { pause, resume: jump, jump, unseen: count, following: () => following && !paused });
    return () => {
        stopOptions();
        observer?.disconnect();
        el.removeEventListener('scroll', onScroll);
        el.removeEventListener('keydown', onKey);
        doc.removeEventListener('click', onToggle);
        doc.removeEventListener('visibilitychange', onVisibility);
        view?.clearTimeout(sayLater);
        pill.remove();
        live.remove();
        el.removeAttribute('data-kp-following');
        HANDLES.delete(el);
    };
}

/**
 * Give every live list under `root` its following and its pill.
 * @param {ParentNode} [root]
 * @param {NewPillOptions} [options]
 * @returns {() => void} detach
 */
export function attachNewPills(root = document, options = {}) {
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(FOLLOW) ? [root] : []),
        ...root.querySelectorAll(FOLLOW),
    ]);
    const undo = found.map((el) => attachOne(el, options));
    return () => undo.forEach((u) => u());
}
