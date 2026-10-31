// Ranks the palette's commands for a query and puts them in order, the best answer first in its own group.
import { intentScore } from '../intent.js';
import { clearMarks, place, textsOf, unitOf, wrapLabel } from './intent-dom.js';
/** @typedef {import('./intent-dom.js').IntentMode} IntentMode */
/** @typedef {import('./intent-filter.js').IntentFilter} IntentFilter */
/** @typedef {{ option: HTMLElement, base: number, score: number, inContext: boolean, featured: boolean, recency: number, at: number }} Ranked */

/** What a context match and a recent command add to a command's score. */
const CONTEXT_BONUS = 3;
const RECENT_BONUS = 2;
/** Where a command that is not recent sorts among the recent ones. */
const NOT_RECENT = 99;

/**
 * Score every command; under a failed list only the static ones stay, and with nothing typed a start set (featured, in
 * context, recent) shows alone when there is one.
 * @param {IntentFilter} f @param {HTMLElement[]} options @param {string[]} want @param {IntentMode} mode
 */
export function rankCommands(f, options, want, mode) {
    const dialog = f.dialog;
    const context = dialog.dataset.kpContext ?? null;
    const recentN = Number(dialog.dataset.kpRecent) || 0;
    const recent = recentN > 0 ? f.readRecent().slice(0, recentN) : [];
    const failed = f.state === 'error';
    /** @type {Ranked[]} */
    const items = options.map((option) => {
        // The marks of the last run come off before the words are read: a mark splits a word into several text nodes ("new" +
        // "est"), and a description reads its nodes apart, so "newest" typed letter by letter found nothing once "new" was
        // marked [kpadopt6-r2: Kenny, 2026-10-18 "sometimes an empty list"].
        clearMarks(f.doc, option);
        if (!option.querySelector(':scope > .kp-palette__label')) wrapLabel(f.doc, option);
        const { label, hint } = textsOf(option);
        const inContext = context !== null && option.dataset.kpContextOf === context;
        const recency = recent.indexOf(option.dataset.value ?? (option.textContent ?? '').trim());
        const base = intentScore({ label, hint, words: option.dataset.kpWords ?? '' }, want, mode);
        const score = base < 0 ? -1 : base + (inContext ? CONTEXT_BONUS : 0) + (want.length === 0 && recency >= 0 ? RECENT_BONUS : 0);
        return { option, base, score, inContext, featured: option.hasAttribute('data-kp-featured'), recency, at: f.origin.get(option) ?? 0 };
    });
    const startSet = items.some((it) => it.featured || it.inContext || it.recency >= 0);
    for (const it of items) {
        let show = it.base >= 0;
        if (failed && !it.option.hasAttribute('data-kp-static')) show = false;
        if (show && want.length === 0 && startSet && !failed) show = it.featured || it.inContext || it.recency >= 0;
        if (!show) it.score = -1;
    }
    return { items, startSet };
}

/**
 * The best answer first in its own group; the order of the markup when nothing is typed and nothing is recent. The sections:
 * the consumer's order (`data-kp-group-order`), else the markup's.
 * @param {IntentFilter} f @param {Ranked[]} items @param {string[]} want
 */
export function orderCommands(f, items, want) {
    const { list, doc } = f;
    /** @type {Map<HTMLElement, Ranked[]>} */
    const containers = new Map();
    for (const it of items) {
        const parent = /** @type {HTMLElement} */ (unitOf(list, it.option).parentElement);
        containers.set(parent, [...(containers.get(parent) ?? []), it]);
    }
    for (const [, group] of containers) {
        group.sort((a, b) => {
            if (a.score >= 0 !== b.score >= 0) return a.score >= 0 ? -1 : 1;
            if (b.score !== a.score) return b.score - a.score;
            if (want.length === 0 && a.recency !== b.recency) return (a.recency < 0 ? NOT_RECENT : a.recency) - (b.recency < 0 ? NOT_RECENT : b.recency);
            return a.at - b.at;
        });
        place(doc, group.map((it) => unitOf(list, it.option)));
    }
    const groups = /** @type {HTMLElement[]} */ ([...list.querySelectorAll('[data-kp-group]')]);
    if (groups.length <= 1) return;
    const named = (f.dialog.dataset.kpGroupOrder ?? '')
        .split(',')
        .map((g) => g.trim().toLowerCase())
        .filter(Boolean);
    const labelOf = (/** @type {HTMLElement} */ g) => (g.querySelector('.kp-palette__group-label')?.textContent ?? g.getAttribute('aria-label') ?? '').trim().toLowerCase();
    const rank = (/** @type {HTMLElement} */ g) => {
        const i = named.indexOf(labelOf(g));
        return i < 0 ? named.length + (f.groupOrigin.get(g) ?? 0) : i;
    };
    place(doc, groups.slice().sort((a, b) => rank(a) - rank(b)));
}
