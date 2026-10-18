// Command palette and shortcut sheet, framework-free [TH40, TH49].
//
// The palette is a <dialog>, which means the three hard parts are the
// browser's: focus is trapped, Escape closes, and focus returns to
// whatever was focused before. AR15's baseline is what makes that
// affordable, and a hand-written focus trap is how focus traps break.
//
// The commands are markup the consumer's server wrote, not a JavaScript
// array this module owns. That is the same choice the theme picker makes
// and for the same reason: kyu and almanac render HTML from a Rust binary
// and have no build step, so a palette that only exists after JavaScript
// runs would give them an empty box.
//
//   <dialog class="kp-palette" data-kp-palette id="commands" data-kp-hotkey="k">
//     <input class="kp-palette__input" type="text" role="combobox"
//            aria-expanded="true" aria-controls="commands-list" />
//     <ul class="kp-palette__list" id="commands-list" role="listbox">
//       <li role="presentation" class="kp-palette__group" data-kp-group>
//         <span class="kp-palette__group-label">Items</span>
//         <ul role="group" aria-label="Items">
//           <li class="kp-palette__option" role="option" data-kp-option
//               data-value="new" data-kp-keys="n">New item</li>
//         </ul>
//       </li>
//     </ul>
//     <p class="kp-palette__status" role="status" aria-live="polite"></p>
//   </dialog>
//
// Choosing one fires `kp-palette-run` on the dialog with the value in the
// detail. What that command DOES is the consumer's business — a palette
// that also owned the actions would have to know the application.
//
// The shortcut sheet (TH49) is the same dialog machinery with no input:
// `?` opens it, and it lists the keys. A palette without discoverability
// is a secret, which is why these two ship together rather than the sheet
// arriving later as a nicety.
//
// Since 3.0.0 [KT6]: the hotkey is an attribute and can be off; a
// palette opens from code, with a query pre-typed; which palette answers
// the key is the consumer's to nominate; the matcher is a choice; groups
// hide when every command in them is filtered out; `data-kp-keys` is
// finally rendered, three versions after it was documented; and the
// sheet dispatches events like everything else.
//
// Since gap-12: a button opens either one without a line of script —
// `<button data-kp-palette-open="commands">` — through the same open the
// hotkey uses, so the list is filtered and `kp-palette-open` fires. A
// page that opened the dialog with `data-kp-dialog` instead got a modal
// with a stale list and no event. An empty value means the palette that
// answers the key.
//
// Since scope-48: the palette navigates. A trigger in the bar's
// `.kp-nav__search` slot is such an opener, and the module gives it what a
// trigger owes its reader — `aria-haspopup="dialog"` and `aria-keyshortcuts`
// when the markup left them out, and the hotkey printed into an empty
// `<kbd data-kp-palette-keys>` in the platform's own spelling (⌘K, Ctrl K).
// And an option may be a link:
//
//   <li role="presentation">
//     <a class="kp-palette__option" role="option" data-kp-option
//        data-value="reports" href="/reports">Reports</a>
//   </li>
//
// Enter and a click both follow it, and `kp-palette-run` still fires first,
// cancelable: a consumer with a router calls preventDefault() and routes.
// Before the module attaches — or on a page with no JavaScript — it is a
// plain anchor, so the list the server wrote is a list of working links.
// The module takes the link out of the Tab order (`tabindex="-1"`, taken
// back on detach): the highlight is virtual focus, and a Tab that walked
// into the list would leave the input the combobox is built on.

// Words in any order [kpadopt6-ops; Kenny, 2026-10-17: "Woorden in elke volgorde (nieuw), ook voor bestaande paletten"]:
// the default matcher is now `intent` (js/intent.js) for every palette, existing ones included. Every typed word has to
// start a word of the command, in any order ("jellyfin upd" finds "Update jellyfin"); the best answer comes first in
// its group, the matched words are marked, a hidden synonym (`data-kp-words`) and a description count as a weaker
// match, the open subject's commands come first (`data-kp-context` on the palette, `data-kp-context-of` on a command),
// what is featured (`data-kp-featured`) or was run last (`data-kp-recent="5"`) is all that shows before anything is
// typed (a palette with none of those still shows every command), at most `data-kp-max-shown` (40) rows show and the
// status line says how many matched. A query nothing answers shows the package's empty plate with a hint that names the
// verb's subjects (`data-kp-verb`, `data-kp-subject-name`) when the palette sets `data-kp-nomatch="plate"`; the default stays the approved status line alone.
// `handle.setState('loading' | 'error')` shows the busy card over the list, or the failed plate with Retry beside the
// commands marked `data-kp-static`. `data-kp-match="substring"` (or `prefix`, `subsequence`) brings the older matchers
// back for one palette. Other options: `data-kp-fold-diacritics`, `data-kp-split-hyphen`, `data-kp-typo="1"`,
// `data-kp-highlight="off"`, `data-kp-group-order="Inbox, Do, Go to"`.

import { createListbox, OPTION_SELECTOR, subsequence } from './listbox.js';
import { getStrings } from './strings.js';
import { INTENT_MAX_SHOWN, intentRanges, intentScore, intentWords, matchIntent, noMatchText, queryWords } from './intent.js';
import { statePlate } from './state-plate.js';
import { openBusyCard } from './busy-card.js';

const PALETTE = '[data-kp-palette]';
const SHEET = '[data-kp-shortcuts]';
const INPUT = 'input[role="combobox"]';
const LIST = '[role="listbox"]';
const STATUS = '[role="status"]';
const GROUP = '[data-kp-group]';
/** The attribute that opens a palette or a sheet on a press [gap-12]. */
export const OPENER = '[data-kp-palette-open]';

/**
 * Close a modal dialog on a press outside its box [scope-80].
 *
 * A modal `<dialog>` paints its backdrop as part of itself, so a press on
 * the dimmed page lands on the dialog element with coordinates outside its
 * border box. Both the press and the release have to fall outside: a drag
 * that selects the query and lets go past the box is not a click outside.
 * `dialog.close()` is what Escape does too, so focus goes back to the
 * opener the same way, and the `close` event runs every channel's own
 * bookkeeping. Returns the function that takes the listeners off.
 *
 * @param {HTMLDialogElement} dialog
 * @returns {() => void}
 */
export function closeOnOutsidePress(dialog) {
    /** @param {MouseEvent} event */
    const outside = (event) => {
        if (event.target !== dialog) return false;
        const box = dialog.getBoundingClientRect();
        return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    };
    let pressedOutside = false;
    /** @param {PointerEvent} event */
    const onDown = (event) => {
        pressedOutside = dialog.open && outside(event);
    };
    /** @param {MouseEvent} event */
    const onClick = (event) => {
        const both = pressedOutside && outside(event);
        pressedOutside = false;
        if (both && dialog.open) dialog.close();
    };
    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('click', onClick);
    return () => {
        dialog.removeEventListener('pointerdown', onDown);
        dialog.removeEventListener('click', onClick);
    };
}

/**
 * Whether a click landed on an opener meant for this dialog.
 *
 * @param {Event} event
 * @param {HTMLDialogElement} dialog
 * @param {boolean} answersKey  whether this dialog is the one an empty value means
 */
function openerFor(event, dialog, answersKey) {
    const opener = event.target instanceof Element ? event.target.closest(OPENER) : null;
    if (opener === null) return false;
    const name = opener.getAttribute('data-kp-palette-open') ?? '';
    return name === '' ? answersKey : name === dialog.id;
}

/** An empty `<kbd>` inside an opener that the module fills with the hotkey [scope-48]. */
export const KEYS_SLOT = '[data-kp-palette-keys]';

/** Whether this is a Mac, where the modifier is ⌘ rather than Ctrl. */
export function isMac() {
    if (typeof navigator === 'undefined') return false;
    const platform = /** @type {any} */ (navigator).userAgentData?.platform ?? navigator.platform ?? '';
    return /mac|iphone|ipad/i.test(platform);
}

/** Fired on the palette when a command is chosen, cancelable. A contract value [TH26]: `{ value, option, href }`. */
export const RUN_EVENT = 'kp-palette-run';
/** Fired on the palette or the sheet when it opens or closes: `{ open }`. */
export const OPEN_EVENT = 'kp-palette-open';

/** @param {number} n */
const RESULTS_TEXT = (n) => {
    const s = getStrings();
    return n === 0 ? s.noCommands : n === 1 ? s.oneCommand : s.manyCommands(n);
};

/** @typedef {(optionText: string, query: string) => boolean} Matcher */
/** @type {Record<string, Matcher>} */
export const MATCHERS = {
    // Words in any order, each starting a word of the command [kpadopt6-ops]: the default since then, drawn by the
    // palette itself (ranking, marks, the cap), so this entry is for a consumer that asks a single yes or no.
    intent: (text, query) => matchIntent(text, query),
    // Literal [scope-56]: a subsequence let "read" find "Report
    // an incident", which reads as a wrong answer rather than a clever
    // one. `data-kp-match="subsequence"` keeps "thm" finding "Theme" for
    // a palette that wants it.
    subsequence: (text, query) => subsequence(text, query),
    substring: (text, query) => text.toLowerCase().includes(query.toLowerCase()),
    prefix: (text, query) => text.toLowerCase().startsWith(query.toLowerCase()),
};

/**
 * Is this keystroke the palette's? ⌘+key on a Mac, Ctrl+key everywhere
 * else. Checked rather than assumed: a page that binds Ctrl+K on a Mac
 * steals nothing, but a page that binds ⌘K on Windows binds nothing at
 * all.
 *
 * @param {KeyboardEvent} event
 * @param {string} key
 */
function isHotkey(event, key) {
    return event.key.toLowerCase() === key.toLowerCase() && (event.metaKey || event.ctrlKey);
}

/**
 * Is the event coming from somewhere that a bare `?` means a question
 * mark rather than a shortcut?
 *
 * @param {EventTarget | null} target
 * @param {string} typingSelector
 */
function isTyping(target, typingSelector) {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || target.matches(typingSelector);
}

/**
 * The intent matcher's side of one palette: score every command, hide what does not answer, put the best answer first
 * in its group, mark the matched words, keep the status line exact, and stand an empty or failed plate in the list's
 * footprint. The commands stay the consumer's markup; this only hides, moves and marks them, and gives all of it back
 * on destroy().
 *
 * @param {HTMLDialogElement} dialog
 * @param {HTMLElement} list
 * @param {HTMLElement | null} status
 */
function createIntentFilter(dialog, list, status) {
    const doc = dialog.ownerDocument;
    /** Where each command stood in the markup, so the order comes back when nothing is typed. @type {WeakMap<Element, number>} */
    const origin = new WeakMap();
    /** @type {WeakMap<Element, number>} */
    const groupOrigin = new WeakMap();
    /** @type {HTMLElement | null} */
    let plate = null;
    /** @type {import('./busy-card.js').BusyCard | null} */
    let busy = null;
    /** @type {'ready' | 'loading' | 'error'} */
    let state = 'ready';
    /** @type {{ message?: string }} */
    let stateOptions = {};
    /** The list's own height while it had commands, the footprint a plate keeps. */
    let footprint = 0;

    const modeOptions = () => ({
        foldDiacritics: dialog.dataset.kpFoldDiacritics !== 'off',
        splitHyphen: dialog.dataset.kpSplitHyphen !== 'off',
        typo: /** @type {0 | 1} */ (dialog.dataset.kpTypo === '1' ? 1 : 0),
    });

    /** The element that moves with a command: its `li` when the command is a link wrapped in a presentation item. @param {HTMLElement} option */
    const unitOf = (option) => {
        const parent = option.parentElement;
        return parent !== null && parent !== list && parent.matches('li[role="presentation"]') && parent.children.length === 1 ? parent : option;
    };

    /** The shown words of a command and the words that weigh less (a description, the hint attribute). @param {HTMLElement} option */
    const textsOf = (option) => {
        /** @type {string[]} */
        const label = [];
        /** @type {string[]} */
        const hint = [];
        /** @param {Node} node @param {boolean} inHint */
        const walk = (node, inHint) => {
            for (const child of node.childNodes) {
                if (child instanceof HTMLElement) {
                    if (child.tagName === 'KBD') continue;
                    walk(child, inHint || child.matches('.kp-palette__description, [data-kp-hint-text]'));
                } else if (child.nodeType === Node.TEXT_NODE) (inHint ? hint : label).push(child.textContent ?? '');
            }
        };
        walk(option, false);
        return { label: label.join(''), hint: `${hint.join(' ')} ${option.dataset.kpHint ?? ''}`.trim() };
    };

    /** @param {HTMLElement[]} options */
    const assignOrigins = (options) => {
        let previous = -1;
        options.forEach((option, index) => {
            let at = origin.get(option);
            if (at === undefined) {
                // A command the consumer added later stands after the command before it.
                at = previous < 0 ? index : previous + 0.001;
                origin.set(option, at);
            }
            previous = at;
        });
        for (const [index, group] of [...list.querySelectorAll('[data-kp-group]')].entries())
            if (!groupOrigin.has(group)) groupOrigin.set(group, index);
    };

    /** Put `elements`, which share places in the page, into the order given without touching what stands between them. @param {HTMLElement[]} ordered */
    const place = (ordered) => {
        const now = ordered.slice().sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
        if (now.every((el, i) => el === ordered[i])) return;
        const holes = now.map((el) => {
            const hole = doc.createComment('');
            el.before(hole);
            return hole;
        });
        ordered.forEach((el, i) => holes[i].replaceWith(el));
    };

    /** @param {HTMLElement} option */
    const clearMarks = (option) => {
        const marks = option.querySelectorAll('.kp-palette__mark');
        if (marks.length === 0) return;
        for (const mark of marks) mark.replaceWith(doc.createTextNode(mark.textContent ?? ''));
        option.normalize();
    };

    /**
     * The command's own words in one element, so marks inside them are inline parts of one flex item and not new items
     * of the row (a row is a flex box with a gap).
     * @param {HTMLElement} option
     */
    const wrapLabel = (option) => {
        /** @type {Text[][]} */
        const runs = [];
        /** @type {Text[]} */
        let run = [];
        for (const child of [...option.childNodes]) {
            if (child.nodeType === Node.TEXT_NODE) run.push(/** @type {Text} */ (child));
            else {
                if (run.length > 0) runs.push(run);
                run = [];
            }
        }
        if (run.length > 0) runs.push(run);
        for (const nodes of runs) {
            if (!nodes.some((n) => (n.data ?? '').trim() !== '')) continue;
            const span = doc.createElement('span');
            span.className = 'kp-palette__label';
            span.setAttribute('data-kp-generated', '');
            nodes[0].before(span);
            span.append(...nodes);
        }
    };

    /** @param {HTMLElement} option @param {string[]} want @param {ReturnType<typeof modeOptions>} mode */
    const markWords = (option, want, mode) => {
        const walker = doc.createTreeWalker(option, NodeFilter.SHOW_TEXT);
        /** @type {Text[]} */
        const nodes = [];
        for (let n; (n = walker.nextNode());)
            if (n.parentElement?.tagName !== 'KBD' && (n.textContent ?? '').trim() !== '') nodes.push(/** @type {Text} */ (n));
        for (const node of nodes) {
            const ranges = intentRanges(node.data, want, mode);
            if (ranges.length === 0) continue;
            const frag = doc.createDocumentFragment();
            let at = 0;
            for (const [from, to] of ranges) {
                if (from > at) frag.append(node.data.slice(at, from));
                const mark = doc.createElement('span');
                mark.className = 'kp-palette__mark';
                mark.textContent = node.data.slice(from, to);
                frag.append(mark);
                at = to;
            }
            if (at < node.data.length) frag.append(node.data.slice(at));
            node.replaceWith(frag);
        }
    };

    const recentKey = () => `kp-recent:palette:${dialog.id || 'palette'}`;
    /** @returns {string[]} */
    const readRecent = () => {
        try {
            const raw = JSON.parse(globalThis.localStorage?.getItem(recentKey()) ?? '[]');
            return Array.isArray(raw) ? raw.map(String) : [];
        } catch {
            return [];
        }
    };

    const ensurePlate = () => {
        if (plate) return plate;
        plate = doc.createElement('div');
        plate.className = 'kp-palette__nomatch';
        plate.hidden = true;
        list.after(plate);
        return plate;
    };

    /** @param {HTMLElement} el @param {boolean} hidden */
    const setHidden = (el, hidden) => {
        if (el.hidden !== hidden) el.hidden = hidden;
    };

    /** What the list's own height cap was before a failed plate capped it; null while it is not capped by us. @type {string | null} */
    let ownListCap = null;
    /** @param {number} px */
    const capList = (px) => {
        ownListCap = list.style.getPropertyValue('--kp-palette-list-max-height');
        // `max-height` counts the padding and the border unless the list is border-box.
        const cs = getComputedStyle(list);
        const frame =
            cs.boxSizing === 'border-box'
                ? 0
                : parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
        list.style.setProperty('--kp-palette-list-max-height', `${Math.max(px - frame, 0)}px`);
    };
    const releaseListCap = () => {
        if (ownListCap === null) return;
        if (ownListCap) list.style.setProperty('--kp-palette-list-max-height', ownListCap);
        else list.style.removeProperty('--kp-palette-list-max-height');
        ownListCap = null;
    };

    const hidePlate = () => {
        if (plate) plate.hidden = true;
        releaseListCap();
        setHidden(list, false);
    };

    /** @param {'empty' | 'error'} kind @param {string} title @param {string} text @param {boolean} replacesList */
    const showPlate = (kind, title, text, replacesList) => {
        const holder = ensurePlate();
        const s = getStrings();
        holder.replaceChildren(
            statePlate(doc, {
                kind,
                title,
                text,
                ...(kind === 'error'
                    ? { actionLabel: s.paletteRetry, onAction: () => dialog.dispatchEvent(new CustomEvent('kp-palette-retry', { bubbles: true })) }
                    : {}),
            }),
        );
        holder.toggleAttribute('data-kp-above', !replacesList);
        holder.hidden = false;
        setHidden(list, replacesList);
        // A plate that replaces the list is as high as the list was. A plate above the commands that stay (the failed one) is as high
        // as the list was minus those commands, so the palette keeps its loaded footprint in a failed state too [t56-shared3-1018].
        releaseListCap();
        const staying = replacesList || list.hidden ? 0 : list.offsetHeight;
        holder.style.setProperty('--kp-palette-plate-height', '0px');
        // The plate needs room for its words and its action; when the commands that stay take more than what is left, they scroll.
        const needed = holder.offsetHeight;
        const room = Math.max(footprint - staying, needed);
        holder.style.setProperty('--kp-palette-plate-height', `${room}px`);
        if (staying > 0 && staying + room > footprint) capList(Math.max(footprint - room, 0));
    };

    /**
     * Filter, rank and mark for `rawQuery`.
     * @param {string} rawQuery
     * @returns {number} how many commands are shown
     */
    const run = (rawQuery) => {
        const s = getStrings();
        const mode = modeOptions();
        const want = queryWords(rawQuery, mode);
        // The footprint is read from a list that shows commands, never from the few that stay under a failed plate.
        if (!list.hidden && list.offsetHeight > 0 && (plate === null || plate.hidden)) footprint = list.offsetHeight;
        const options = /** @type {HTMLElement[]} */ ([...list.querySelectorAll(OPTION_SELECTOR)]);
        assignOrigins(options);
        const context = dialog.dataset.kpContext ?? null;
        const recentN = Number(dialog.dataset.kpRecent) || 0;
        const recent = recentN > 0 ? readRecent().slice(0, recentN) : [];
        const max = Math.max(1, Number(dialog.dataset.kpMaxShown) || INTENT_MAX_SHOWN);
        const failed = state === 'error';
        const valueOf = (/** @type {HTMLElement} */ option) => option.dataset.value ?? (option.textContent ?? '').trim();
        const items = options.map((option) => {
            // The marks of the last run come off before the words are read: a mark splits a word into several text
            // nodes ("new" + "est"), and a description reads its nodes apart, so "newest" typed letter by letter
            // found nothing once "new" was marked [kpadopt6-r2: Kenny, 2026-10-18 "sometimes an empty list"].
            clearMarks(option);
            if (dialog.dataset.kpHighlight !== 'off' && !option.querySelector(':scope > .kp-palette__label')) wrapLabel(option);
            const { label, hint } = textsOf(option);
            const value = valueOf(option);
            const inContext = context !== null && option.dataset.kpContextOf === context;
            const featured = option.hasAttribute('data-kp-featured');
            const recency = recent.indexOf(value);
            const base = intentScore({ label, hint, words: option.dataset.kpWords ?? '' }, want, mode);
            const score = base < 0 ? -1 : base + (inContext ? 3 : 0) + (want.length === 0 && recency >= 0 ? 2 : 0);
            return { option, base, score, inContext, featured, recency, at: origin.get(option) ?? 0 };
        });
        const byOption = new Map(items.map((it) => [it.option, it]));
        const startSet = items.some((it) => it.featured || it.inContext || it.recency >= 0);
        for (const it of items) {
            let show = it.base >= 0;
            if (failed && !it.option.hasAttribute('data-kp-static')) show = false;
            if (show && want.length === 0 && startSet && !failed) show = it.featured || it.inContext || it.recency >= 0;
            if (!show) it.score = -1;
        }
        const total = items.filter((it) => it.score >= 0).length;

        // The best answer first in its own group; the order of the markup when nothing is typed and nothing is recent.
        /** @type {Map<HTMLElement, typeof items>} */
        const containers = new Map();
        for (const it of items) {
            const unit = unitOf(it.option);
            const parent = /** @type {HTMLElement} */ (unit.parentElement);
            containers.set(parent, [...(containers.get(parent) ?? []), it]);
        }
        for (const [, group] of containers) {
            group.sort((a, b) => {
                if (a.score >= 0 !== b.score >= 0) return a.score >= 0 ? -1 : 1;
                if (b.score !== a.score) return b.score - a.score;
                if (want.length === 0 && a.recency !== b.recency) return (a.recency < 0 ? 99 : a.recency) - (b.recency < 0 ? 99 : b.recency);
                return a.at - b.at;
            });
            place(group.map((it) => unitOf(it.option)));
        }

        // The sections: the consumer's order, else the markup's.
        const groups = /** @type {HTMLElement[]} */ ([...list.querySelectorAll('[data-kp-group]')]);
        const named = (dialog.dataset.kpGroupOrder ?? '')
            .split(',')
            .map((g) => g.trim().toLowerCase())
            .filter(Boolean);
        const labelOf = (/** @type {HTMLElement} */ g) =>
            (g.querySelector('.kp-palette__group-label')?.textContent ?? g.getAttribute('aria-label') ?? '').trim().toLowerCase();
        if (groups.length > 1) {
            const rank = (/** @type {HTMLElement} */ g) => {
                const i = named.indexOf(labelOf(g));
                return i < 0 ? named.length + (groupOrigin.get(g) ?? 0) : i;
            };
            place(groups.slice().sort((a, b) => rank(a) - rank(b)));
        }

        // Which are shown: the answers, up to the cap when a query narrows them.
        const capped = want.length > 0 || startSet;
        let shownCount = 0;
        for (const option of /** @type {HTMLElement[]} */ ([...list.querySelectorAll(OPTION_SELECTOR)])) {
            const it = byOption.get(option);
            let show = (it?.score ?? -1) >= 0;
            if (show && capped && shownCount >= max) show = false;
            if (show) shownCount += 1;
            setHidden(option, !show);
            const unit = unitOf(option);
            if (unit !== option) setHidden(unit, !show);
            clearMarks(option);
            if (show && want.length > 0 && dialog.dataset.kpHighlight !== 'off') markWords(option, want, mode);
        }
        for (const group of groups) setHidden(group, group.querySelector(`${OPTION_SELECTOR}:not([hidden])`) === null);

        // The status line is exact; a cap says so.
        if (status !== null) {
            status.textContent =
                shownCount < total
                    ? s.paletteCapped(shownCount, total)
                    : shownCount === 0
                      ? s.noCommands
                      : shownCount === 1
                        ? s.oneCommand
                        : s.manyCommands(shownCount);
        }

        // An empty or a failed list is a plate in the list's footprint, never a line in a corner.
        if (failed) showPlate('error', s.paletteFailed, stateOptions.message ?? s.paletteFailedText, false);
        else if (shownCount === 0 && want.length > 0 && dialog.dataset.kpNomatch === 'plate') {
            const verbs = [...new Set(options.map((o) => o.dataset.kpVerb).filter((v) => v))];
            const verb = verbs.find((v) => want.length > 1 && intentWords(v ?? '', mode)[0]?.startsWith(want[0]));
            const subjects = verb
                ? options
                      .filter((o) => o.dataset.kpVerb === verb)
                      .map((o) => o.dataset.kpContextOf ?? '')
                      .filter(Boolean)
                : [];
            showPlate(
                'empty',
                s.paletteNothing,
                noMatchText(
                    rawQuery,
                    { verbs: verb ? [verb] : [], subjects, noun: dialog.dataset.kpSubjectName ?? '', hint: dialog.dataset.kpNomatchHint ?? '' },
                    mode,
                ),
                true,
            );
        } else hidePlate();
        return shownCount;
    };

    return {
        run,
        /** @param {'ready' | 'loading' | 'error'} next @param {{ message?: string }} [options] */
        setState(next, options = {}) {
            state = next;
            stateOptions = options;
            if (next === 'loading' && !busy) {
                list.setAttribute('aria-busy', 'true');
                busy = openBusyCard(list, {
                    words: getStrings().paletteLoading,
                    area: () => [list],
                    className: 'kp-palette__busy',
                    arrive: dialog.open,
                });
            } else if (next !== 'loading' && busy) {
                list.removeAttribute('aria-busy');
                const closing = busy;
                busy = null;
                void closing.close();
            }
        },
        /** @param {string} value */
        remember(value) {
            const n = Number(dialog.dataset.kpRecent) || 0;
            if (n <= 0 || value === '') return;
            try {
                globalThis.localStorage?.setItem(recentKey(), JSON.stringify([value, ...readRecent().filter((v) => v !== value)].slice(0, n)));
            } catch {
                /* no storage: no memory, the palette still works */
            }
        },
        destroy() {
            busy?.remove();
            busy = null;
            list.removeAttribute('aria-busy');
            plate?.remove();
            plate = null;
            setHidden(list, false);
            const options = /** @type {HTMLElement[]} */ ([...list.querySelectorAll(OPTION_SELECTOR)]);
            for (const option of options) {
                clearMarks(option);
                for (const label of option.querySelectorAll(':scope > .kp-palette__label[data-kp-generated]')) label.replaceWith(...label.childNodes);
                option.normalize();
            }
            // The markup's own order comes back.
            /** @type {Map<HTMLElement, HTMLElement[]>} */
            const containers = new Map();
            for (const option of options) {
                const unit = unitOf(option);
                const parent = /** @type {HTMLElement} */ (unit.parentElement);
                containers.set(parent, [...(containers.get(parent) ?? []), unit]);
            }
            for (const [, units] of containers)
                place(
                    units
                        .slice()
                        .sort(
                            (a, b) =>
                                (origin.get(/** @type {Element} */ (a.matches(OPTION_SELECTOR) ? a : a.querySelector(OPTION_SELECTOR))) ?? 0) -
                                (origin.get(/** @type {Element} */ (b.matches(OPTION_SELECTOR) ? b : b.querySelector(OPTION_SELECTOR))) ?? 0),
                        ),
                );
            const groups = /** @type {HTMLElement[]} */ ([...list.querySelectorAll('[data-kp-group]')]);
            place(groups.slice().sort((a, b) => (groupOrigin.get(a) ?? 0) - (groupOrigin.get(b) ?? 0)));
        },
    };
}

/**
 * @typedef {object} PaletteHandle
 * @property {HTMLDialogElement} element
 * @property {(query?: string) => void} open
 * @property {() => void} close
 * @property {() => void} refresh re-filter after the consumer changed the commands
 * @property {(state: 'ready' | 'loading' | 'error', options?: { message?: string }) => void} setState the commands are still arriving (the busy card over the list) or could not be read (the failed plate with Retry, `kp-palette-retry`; commands marked `data-kp-static` stay)
 */

/** @type {WeakMap<Element, PaletteHandle>} */
const handles = new WeakMap();
/** The handle for an attached palette or sheet. @param {Element} element */
export function palette(element) {
    return handles.get(element) ?? null;
}

/**
 * Attach every palette and shortcut sheet under `root`.
 *
 * @param {ParentNode} root
 * @param {{ hotkey?: string | null, sheetKey?: string | null, match?: keyof typeof MATCHERS | Matcher, clearOnClose?: boolean, closeOnRun?: boolean, typingSelector?: string }} [options]
 *   Defaults; per element: `data-kp-hotkey` (a letter, or "none"), `data-kp-primary` (this one answers the key when there are several), `data-kp-match` (`intent` by default: words in any order, js/intent.js; or `substring`, `subsequence`, `prefix`), `data-kp-clear-on-close="false"`, `data-kp-close-on-run="false"`.
 * @returns {(() => void) & { handles: PaletteHandle[] }} detach
 */
export function attachPalettes(
    root = document,
    {
        hotkey = 'k',
        sheetKey = '?',
        match = 'intent',
        clearOnClose = true,
        closeOnRun = true,
        typingSelector = 'input, textarea, select, [role="textbox"]',
    } = {},
) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    /** @type {PaletteHandle[]} */
    const created = [];

    /** The one that answers the key: the nominated one, else the first in the document. @param {string} selector @param {Element} me */
    const answers = (selector, me) => {
        const nominated = document.querySelector(`${selector}[data-kp-primary]`);
        return (nominated ?? document.querySelector(selector)) === me;
    };

    for (const element of root.querySelectorAll(PALETTE)) {
        const dialog = element;
        if (!(dialog instanceof HTMLDialogElement) || dialog.dataset.kpPaletteAttached !== undefined) continue;
        const input = /** @type {HTMLInputElement | null} */ (dialog.querySelector(INPUT));
        const list = /** @type {HTMLElement | null} */ (dialog.querySelector(LIST));
        if (input === null || list === null) continue;
        dialog.dataset.kpPaletteAttached = '';

        const status = /** @type {HTMLElement | null} */ (dialog.querySelector(STATUS));
        const key = dialog.dataset.kpHotkey === 'none' ? null : (dialog.dataset.kpHotkey ?? hotkey);
        const clears = dialog.dataset.kpClearOnClose === undefined ? clearOnClose : dialog.dataset.kpClearOnClose !== 'false';
        const closes = dialog.dataset.kpCloseOnRun === undefined ? closeOnRun : dialog.dataset.kpCloseOnRun !== 'false';
        const matcher = typeof match === 'function' ? match : (MATCHERS[dialog.dataset.kpMatch ?? match] ?? MATCHERS.substring);
        // Words in any order is the default [kpadopt6-ops]: the palette ranks, marks and caps itself.
        const intent =
            typeof match !== 'function' && (dialog.dataset.kpMatch ?? match) === 'intent' ? createIntentFilter(dialog, list, status) : null;

        // data-kp-keys, rendered: the documented attribute nothing read.
        for (const element of list.querySelectorAll(`${OPTION_SELECTOR}[data-kp-keys]`)) {
            const option = /** @type {HTMLElement} */ (element);
            if (option.querySelector('kbd') !== null) continue;
            const kbd = document.createElement('kbd');
            kbd.className = 'kp-palette__keys';
            kbd.textContent = option.dataset.kpKeys ?? '';
            kbd.dataset.kpGenerated = '';
            option.append(kbd);
        }

        const filter = () => {
            const query = input.value.trim();
            if (intent !== null) {
                const shown = intent.run(query);
                listbox.refresh();
                if (shown > 0) listbox.highlight(0);
                return;
            }
            let visible = 0;
            for (const element of list.querySelectorAll(OPTION_SELECTOR)) {
                const option = /** @type {HTMLElement} */ (element);
                // Match on the label, not on the kbd hint.
                const text = [...option.childNodes]
                    .filter((n) => !(n instanceof HTMLElement && n.tagName === 'KBD'))
                    .map((n) => n.textContent ?? '')
                    .join('');
                const shown = matcher(text, query);
                option.hidden = !shown;
                if (shown) visible += 1;
            }
            // A group whose commands all vanished vanishes with them.
            for (const element of list.querySelectorAll(GROUP)) {
                const group = /** @type {HTMLElement} */ (element);
                group.hidden = group.querySelector(`${OPTION_SELECTOR}:not([hidden])`) === null;
            }
            listbox.refresh();
            if (visible > 0) listbox.highlight(0);
            if (status !== null) status.textContent = RESULTS_TEXT(visible);
        };

        // The click a choice rides on, while it is being dispatched: a link
        // chosen by a click is followed by the browser, one chosen by Enter
        // is clicked here so the browser follows it the same way — target,
        // rel and a router's own click handler included.
        /** @type {MouseEvent | null} */
        let clicking = null;
        /** @param {MouseEvent} event */
        const onClickStart = (event) => {
            clicking = event;
        };
        const onClickEnd = () => {
            clicking = null;
        };
        list.addEventListener('click', onClickStart, true);

        const listbox = createListbox({
            input,
            list,
            onChoose: (_, option) => {
                const link = option instanceof HTMLAnchorElement && option.hasAttribute('href') ? option : null;
                if (link !== null && clicking === null) {
                    // Comes straight back through the listbox as a click.
                    link.click();
                    return;
                }
                const value = option.dataset.value ?? (option.textContent ?? '').trim();
                const run = new CustomEvent(RUN_EVENT, { bubbles: true, cancelable: true, detail: { value, option, href: link?.href ?? null } });
                dialog.dispatchEvent(run);
                if (!run.defaultPrevented) intent?.remember(value);
                if (run.defaultPrevented && link !== null) clicking?.preventDefault();
                if (closes) dialog.close();
            },
            onDismiss: () => dialog.close(),
        });
        list.addEventListener('click', onClickEnd);

        // A link option is pointed at, never tabbed to [scope-48].
        /** @type {HTMLElement[]} */
        const untabbed = [];
        for (const element of list.querySelectorAll(`a${OPTION_SELECTOR}[href]:not([tabindex])`)) {
            element.setAttribute('tabindex', '-1');
            untabbed.push(/** @type {HTMLElement} */ (element));
        }

        /** @param {string} [query] */
        const openWith = (query) => {
            if (dialog.open) return;
            if (query !== undefined) input.value = query;
            dialog.showModal();
            filter();
            input.focus();
            dialog.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: true } }));
        };

        const onInput = () => filter();
        input.addEventListener('input', onInput);

        // Reopening with the last query still in the box is a small trap:
        // the list looks filtered for no visible reason.
        const onClose = () => {
            // The close event arrives a task later: a palette opened again with a query in between keeps that query.
            if (clears && !dialog.open) {
                input.value = '';
                filter();
            }
            dialog.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: false } }));
        };
        dialog.addEventListener('close', onClose);
        const releaseOutside = closeOnOutsidePress(dialog);

        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            if (key === null || !isHotkey(event, key)) return;
            // Only ONE palette answers the key: the nominated one, else
            // the first in the document. Found by the contract suite: with
            // a palette from each channel on one page, both handlers fired
            // and the second showModal() landed on top of the first.
            if (!answers(PALETTE, dialog)) return;
            event.preventDefault();
            if (dialog.open) dialog.close();
            else openWith();
        };
        if (key !== null) document.addEventListener('keydown', onKey);

        /** @param {Event} event */
        const onOpener = (event) => {
            if (!openerFor(event, dialog, answers(PALETTE, dialog))) return;
            openWith();
        };
        document.addEventListener('click', onOpener);

        // The triggers that open this palette say so, and print its key
        // [scope-48]. Only what the markup left out is written, and only
        // that is taken back.
        /** @type {(() => void)[]} */
        const unstamp = [];
        const mac = isMac();
        for (const opener of document.querySelectorAll(OPENER)) {
            const name = opener.getAttribute('data-kp-palette-open') ?? '';
            if (name === '' ? !answers(PALETTE, dialog) : name !== dialog.id) continue;
            /** @param {string} attribute @param {string} value */
            const stamp = (attribute, value) => {
                if (opener.hasAttribute(attribute)) return;
                opener.setAttribute(attribute, value);
                unstamp.push(() => opener.removeAttribute(attribute));
            };
            stamp('aria-haspopup', 'dialog');
            if (key === null) continue;
            stamp('aria-keyshortcuts', `${mac ? 'Meta' : 'Control'}+${key.toUpperCase()}`);
            for (const slot of opener.querySelectorAll(KEYS_SLOT)) {
                if ((slot.textContent ?? '').trim() !== '') continue;
                slot.textContent = getStrings().paletteHotkey(key, mac);
                unstamp.push(() => (slot.textContent = ''));
            }
        }

        filter();
        /** @type {PaletteHandle} */
        const handle = {
            element: dialog,
            open: openWith,
            close: () => dialog.close(),
            refresh: filter,
            setState: (state, options) => {
                intent?.setState(state, options);
                filter();
            },
        };
        handles.set(dialog, handle);
        created.push(handle);
        cleanups.push(() => {
            intent?.destroy();
            listbox.destroy();
            list.removeEventListener('click', onClickStart, true);
            list.removeEventListener('click', onClickEnd);
            for (const el of untabbed) el.removeAttribute('tabindex');
            for (const undo of unstamp) undo();
            input.removeEventListener('input', onInput);
            dialog.removeEventListener('close', onClose);
            releaseOutside();
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('click', onOpener);
            for (const el of list.querySelectorAll(OPTION_SELECTOR)) /** @type {HTMLElement} */ (el).hidden = false;
            for (const el of list.querySelectorAll(GROUP)) /** @type {HTMLElement} */ (el).hidden = false;
            for (const el of list.querySelectorAll('kbd[data-kp-generated]')) el.remove();
            if (dialog.open) dialog.close();
            handles.delete(dialog);
            delete dialog.dataset.kpPaletteAttached;
        });
    }

    for (const element of root.querySelectorAll(SHEET)) {
        const sheet = element;
        if (!(sheet instanceof HTMLDialogElement) || sheet.dataset.kpShortcutsAttached !== undefined) continue;
        sheet.dataset.kpShortcutsAttached = '';
        const key = sheet.dataset.kpHotkey === 'none' ? null : (sheet.dataset.kpHotkey ?? sheetKey);

        const openSheet = () => {
            if (sheet.open) return;
            sheet.showModal();
            sheet.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: true } }));
        };
        const onClose = () => sheet.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true, detail: { open: false } }));
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            // `?` only when nobody is typing one into a field, and never
            // with a modifier — Ctrl+? belongs to the browser.
            if (key === null || event.key !== key || event.ctrlKey || event.metaKey || event.altKey) return;
            if (isTyping(event.target, typingSelector)) return;
            if (!answers(SHEET, sheet)) return;
            event.preventDefault();
            if (sheet.open) sheet.close();
            else openSheet();
        };
        if (key !== null) document.addEventListener('keydown', onKey);
        /** @param {Event} event */
        const onOpener = (event) => {
            if (openerFor(event, sheet, false)) openSheet();
        };
        document.addEventListener('click', onOpener);
        sheet.addEventListener('close', onClose);
        // A press outside the sheet closes it, as it does the palette [scope-80].
        const releaseOutside = closeOnOutsidePress(sheet);
        /** @type {PaletteHandle} */
        const handle = { element: sheet, open: openSheet, close: () => sheet.close(), refresh: () => {}, setState: () => {} };
        handles.set(sheet, handle);
        created.push(handle);
        cleanups.push(() => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('click', onOpener);
            sheet.removeEventListener('close', onClose);
            releaseOutside();
            if (sheet.open) sheet.close();
            handles.delete(sheet);
            delete sheet.dataset.kpShortcutsAttached;
        });
    }

    const detach = () => {
        for (const c of cleanups) c();
    };
    return Object.assign(detach, { handles: created });
}
