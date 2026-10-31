// The DOM work of the intent filter: a command's words, its marks, its label wrap and the reordering that keeps the page's gaps.
import { intentRanges } from '../intent.js';
/** @typedef {{ foldDiacritics: boolean, splitHyphen: boolean, typo: 0 | 1 }} IntentMode */

/**
 * The element that moves with a command: its `li` when the command is a link wrapped in a presentation item.
 * @param {HTMLElement} list @param {HTMLElement} option
 */
export function unitOf(list, option) {
    const parent = option.parentElement;
    return parent !== null && parent !== list && parent.matches('li[role="presentation"]') && parent.children.length === 1 ? parent : option;
}

/** The shown words of a command and the words that weigh less (a description, the hint attribute). @param {HTMLElement} option */
export function textsOf(option) {
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
}

/**
 * Put `ordered`, which share places in the page, into the order given without touching what stands between them.
 * @param {Document} doc @param {HTMLElement[]} ordered
 */
export function place(doc, ordered) {
    const now = ordered.slice().sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    if (now.every((el, i) => el === ordered[i])) return;
    const holes = now.map((el) => {
        const hole = doc.createComment('');
        el.before(hole);
        return hole;
    });
    ordered.forEach((el, i) => holes[i].replaceWith(el));
}

/** Take a command's marks off, its words whole again. @param {Document} doc @param {HTMLElement} option */
export function clearMarks(doc, option) {
    const marks = option.querySelectorAll('.kp-palette__mark');
    if (marks.length === 0) return;
    for (const mark of marks) mark.replaceWith(doc.createTextNode(mark.textContent ?? ''));
    option.normalize();
}

/**
 * The command's own words in one element, so marks inside them are inline parts of one flex item and not new items of the row (a
 * row is a flex box with a gap).
 * @param {Document} doc @param {HTMLElement} option
 */
export function wrapLabel(doc, option) {
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
}

/** Mark the words of `want` in a command (never in its key hint). @param {Document} doc @param {HTMLElement} option @param {string[]} want @param {IntentMode} mode */
export function markWords(doc, option, want, mode) {
    const walker = doc.createTreeWalker(option, NodeFilter.SHOW_TEXT);
    /** @type {Text[]} */
    const nodes = [];
    for (let n; (n = walker.nextNode()); ) if (n.parentElement?.tagName !== 'KBD' && (n.textContent ?? '').trim() !== '') nodes.push(/** @type {Text} */ (n));
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
}

/** @param {HTMLElement} el @param {boolean} hidden */
export function setHidden(el, hidden) {
    if (el.hidden !== hidden) el.hidden = hidden;
}
