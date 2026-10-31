// Renders the whole diff: the column sizes, the skeleton and the files.
import { getStrings } from '../strings.js';
import { statePlate } from '../state-plate.js';
import { openBusyCard } from '../busy-card.js';
import { attachDisabledReasons } from '../reason.js';
import { barEl, fileEl, syncBar } from './file.js';
import { attr, el, stateOf } from './model.js';
import { say } from './read.js';
/** @typedef {import('./types.js').NormFile} NormFile */

/** Make every header's counts as wide as the longest of the page, so the columns line up. @param {HTMLElement} root @param {NormFile[]} files */
function sizeColumns(root, files) {
    const longest = (/** @type {number[]} */ numbers) => Math.max(2, ...numbers.map((n) => String(n).length + 1));
    root.style.setProperty('--kp-diffview-added-ch', String(longest(files.map((file) => file.added))));
    root.style.setProperty('--kp-diffview-removed-ch', String(longest(files.map((file) => file.removed))));
}

/** The skeleton of a diff: file headers at their final size, the first one with lines. */
function skeleton() {
    const wait = el('kp-diffview__wait');
    wait.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i += 1) {
        const file = el('kp-diffview__file kp-diffview__file--wait');
        const head = el('kp-diffview__head kp-diffview__head--wait');
        head.append(
            el('kp-skeleton kp-diffview__wait-badge', 'span'),
            el('kp-skeleton kp-diffview__wait-path', 'span'),
            el('kp-skeleton kp-diffview__wait-counts', 'span'),
        );
        file.append(head);
        if (i === 0) {
            const body = el('kp-diffview__body kp-diffview__body--wait');
            for (let n = 0; n < 6; n += 1) body.append(el('kp-skeleton kp-diffview__wait-line', 'span'));
            file.append(body);
        }
        wait.append(file);
    }
    return wait;
}

/** Draw everything: the files, or the state in their place. @param {HTMLElement} root */
export function render(root) {
    const st = stateOf(root);
    const s = getStrings();
    if (!root.classList.contains('kp-diffview')) root.classList.add('kp-diffview');
    const label = root.getAttribute('data-kp-diff-label');
    if (label) root.setAttribute('aria-label', label);
    else if (!root.hasAttribute('aria-label') && !root.hasAttribute('aria-labelledby')) root.setAttribute('aria-label', s.diffLabel);
    if (!root.hasAttribute('role')) root.setAttribute('role', 'region');
    // The open option changed: the reader's own choices give way, so the option visibly applies.
    if (st.mode !== attr(root, 'open', 'all')) {
        st.mode = attr(root, 'open', 'all');
        st.opened.clear();
    }
    const live = root.querySelector(':scope > .kp-diffview__live');
    /** @type {'ready' | 'loading' | 'empty' | 'error'} */
    const state = st.spec.state ?? (st.files.length === 0 ? 'empty' : 'ready');
    if (st.card) {
        st.card.remove();
        st.card = null;
    }
    root.setAttribute('data-kp-state', state);
    root.toggleAttribute('aria-busy', state === 'loading');
    root.replaceChildren();
    if (live) root.append(live);

    if (state === 'ready') {
        sizeColumns(root, st.files);
        const list = el('kp-diffview__list');
        st.files.forEach((file, index) => list.append(fileEl(root, st, file, index)));
        root.append(barEl(root, st), list);
        attachDisabledReasons(root.querySelector('.kp-diffview__bar') ?? root);
        syncBar(root);
        const added = st.files.reduce((sum, file) => sum + file.added, 0);
        const removed = st.files.reduce((sum, file) => sum + file.removed, 0);
        const summary = s.diffReady(st.files.length, added, removed);
        if (st.said !== summary) {
            st.said = summary;
            say(root, summary);
        }
        return;
    }
    st.said = '';
    const stage = el('kp-diffview__stage');
    if (state === 'loading') {
        stage.append(skeleton());
        root.append(stage);
        st.card = openBusyCard(root, { words: s.diffLoading, area: () => [stage], className: 'kp-diffview__busy', arrive: false });
    } else if (state === 'empty') {
        const names = (st.spec.compared ?? []).filter((name) => name !== '');
        const text = names.length === 1 ? s.diffEmptySame(names[0]) : names.length === 2 ? s.diffEmptyBetween(names[0], names[1]) : s.diffEmptyText;
        stage.append(statePlate(document, { kind: 'empty', title: s.diffEmptyTitle, text }));
        root.append(stage);
    } else {
        stage.append(
            statePlate(document, {
                kind: 'error',
                title: st.spec.message ?? s.diffFailedTitle,
                text: s.diffFailedText,
                actionLabel: s.diffRetry,
                actionAttribute: 'data-kp-diff-retry-action',
            }),
        );
        root.append(stage);
    }
}
