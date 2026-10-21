// The problem alert: what is wrong, why, and what to do now [kpadopt5].
//
// An alert with three fixed parts, the shape of `chassis::Error` (the error and its remedy): `.kp-alert__what`,
// `.kp-alert__why`, `.kp-alert__remedy`, and the fix beside them in `.kp-alert__actions`. The markup is plain CSS
// (css/components.css) and works without this module; `setProblems(el, items)` is for a page whose problems change, and
// it updates by key like `setAttention` (js/attention.js), so an alert that is still true is the same element, is not
// announced again and keeps the focus on its fix.
//
//   <div class="kp-problems" data-kp-problems data-kp-problems-mode="each"></div>
//   setProblems(el, [
//       { key: 'calendar', what: 'The calendar is not shared', why: 'Almanac cannot read it.', remedy: 'Share it with the service account.',
//         action: button },
//   ]);
//
// Kenny, 2026-10-17: "toon de verschillende opties in een demo", so the layout is an option, not a decision:
//
//   `each`  (default) one alert per problem, the worst first, each with its own fix
//   `list`  one alert holding every problem as a list, the tone of the worst
//   `fold`  one alert per problem below the threshold; from it (`data-kp-problems-fold-from`, default 5, at least 2) one
//           alert with the worst open and "Show the other N" for the rest
//
// Both are options with a default and switch at runtime (Kenny, 2026-10-17 22:09: "one per problem is default, the others
// are options that can be configured dynamically, so also the five can be changed"): change `data-kp-problems-mode` or
// `data-kp-problems-fold-from` on the container and it re-renders at once from the problems it was last given.
//
// A remedy that is a command (`command`) is set in code with a Copy button. A problem is dismissible only when its item
// says so; a real problem should not be closable until it is fixed. Nothing runs on import.

import { leave } from './motion.js';
import { getStrings } from './strings.js';

/** A container of problems. */
export const PROBLEMS = '[data-kp-problems]';
/** The severities, worst first. */
export const PROBLEM_SEVERITIES = /** @type {const} */ (['critical', 'warning', 'info']);
/** The layouts of several problems. */
export const PROBLEM_MODES = /** @type {const} */ (['each', 'list', 'fold']);
/** Fired on the container, bubbling and cancelable, when a dismissible problem is dismissed: `{ key }`. */
export const PROBLEM_DISMISS_EVENT = 'kp-problem-dismiss';

/** The alert flavour each severity wears. */
const FLAVOUR = { critical: 'destructive', warning: 'warning', info: 'info' };
/** The glyph in each severity's icon. */
const GLYPH = { critical: '!', warning: '!', info: 'i' };

/**
 * One problem.
 * @typedef {object} Problem
 * @property {string} key its stable id: the same key is the same element on every refresh
 * @property {string} what what is wrong, in one line
 * @property {string} [why] why it is
 * @property {string} [remedy] what to do now
 * @property {string} [command] a command that fixes it, set in code with a Copy button
 * @property {'critical' | 'warning' | 'info'} [severity] default `warning`: most problems are "could not use this", not outages
 * @property {Node | null} [action] the fix (a button or a link); a node equal in markup to the one shown keeps the one shown
 * @property {boolean} [dismissible] a close button on this problem (default off)
 */

/**
 * @typedef {object} ProblemsOptions
 * @property {'each' | 'list' | 'fold'} [mode] default: the container's `data-kp-problems-mode`, else `each`
 * @property {number} [foldFrom] with `fold`: the count from which the problems fold (default 5)
 * @property {string} [remedyLabel] the word before the remedy (default the dictionary's "What now")
 */

/** @param {Problem} p */
const severityOf = (p) =>
    PROBLEM_SEVERITIES.includes(/** @type {any} */ (p.severity)) ? /** @type {'critical' | 'warning' | 'info'} */ (p.severity) : 'warning';

/** @param {Problem[]} items */
function ranked(items) {
    const seen = new Set();
    return items
        .filter((p) => (seen.has(p.key) ? false : (seen.add(p.key), true)))
        .map((p, at) => ({ p, at }))
        .sort((a, b) => PROBLEM_SEVERITIES.indexOf(severityOf(a.p)) - PROBLEM_SEVERITIES.indexOf(severityOf(b.p)) || a.at - b.at)
        .map((x) => x.p);
}

/** @param {Element} parent @param {string} selector @param {string} tag @param {string} className */
function part(parent, selector, tag, className) {
    let el = parent.querySelector(`:scope > ${selector}`);
    if (!el) {
        el = parent.ownerDocument.createElement(tag);
        el.className = className;
    }
    return /** @type {HTMLElement} */ (el);
}

/** Set text only when it changed. @param {Node} el @param {string} text */
const setText = (el, text) => {
    if (el.textContent !== text) el.textContent = text;
};

/**
 * Write one problem's three parts into `host`, touching only what changed.
 * @param {HTMLElement} host an alert body or a list item
 * @param {Problem} p
 * @param {string} remedyLabel
 */
function paintParts(host, p, remedyLabel) {
    const s = getStrings();
    const severity = severityOf(p);
    const what = part(host, '.kp-alert__what', 'p', 'kp-alert__what');
    let word = what.querySelector(':scope > .kp-sr-only');
    if (!word) {
        word = host.ownerDocument.createElement('span');
        word.className = 'kp-sr-only';
        what.prepend(word);
    }
    const sr = `${severity === 'critical' ? s.attentionCritical : severity === 'warning' ? s.attentionWarning : s.attentionInfo}: `;
    setText(word, sr);
    const words = [...what.childNodes].filter((n) => n !== word);
    if (words.map((n) => n.textContent).join('') !== p.what) {
        for (const n of words) n.remove();
        what.append(p.what);
    }
    if (what.parentElement !== host) host.prepend(what);

    let anchor = what;
    for (const [name, text] of /** @type {const} */ ([['why', p.why]])) {
        const el = host.querySelector(`:scope > .kp-alert__${name}`);
        if (text) {
            const node = el ?? part(host, `.kp-alert__${name}`, 'p', `kp-alert__${name}`);
            setText(node, text);
            if (!el) anchor.after(node);
            anchor = /** @type {HTMLElement} */ (node);
        } else el?.remove();
    }

    const remedyEl = host.querySelector(':scope > .kp-alert__remedy');
    if (p.remedy || p.command) {
        const node = remedyEl ?? part(host, '.kp-alert__remedy', 'p', 'kp-alert__remedy');
        const sig = `${remedyLabel}|${p.remedy ?? ''}|${p.command ?? ''}`;
        if (node.getAttribute('data-kp-sig') !== sig) {
            node.setAttribute('data-kp-sig', sig);
            node.replaceChildren();
            const label = host.ownerDocument.createElement('strong');
            label.className = 'kp-alert__remedy-label';
            label.textContent = remedyLabel;
            node.append(label, ' ');
            if (p.remedy) node.append(p.remedy);
            if (p.command) {
                const line = host.ownerDocument.createElement('span');
                line.className = 'kp-alert__command';
                const code = host.ownerDocument.createElement('code');
                code.className = 'kp-alert__code';
                code.textContent = p.command;
                const copy = host.ownerDocument.createElement('button');
                copy.type = 'button';
                copy.className = 'kp-button kp-button--secondary kp-button--sm';
                copy.setAttribute('data-kp-copy', '');
                copy.setAttribute('data-kp-copy-value', p.command);
                copy.textContent = s.problemCopy;
                line.append(code, copy);
                node.append(line);
                void import('./patterns.js').then((m) => m.attachPatterns(line));
            }
        }
        if (!remedyEl) anchor.after(node);
    } else remedyEl?.remove();
}

/**
 * Put `p.action` into the actions box of `host`.
 * @param {HTMLElement} host @param {Problem} p
 */
function paintAction(host, p) {
    let actions = host.querySelector(':scope > .kp-alert__actions');
    if (p.action === undefined) return;
    if (p.action === null) {
        actions?.remove();
        return;
    }
    if (!actions) {
        actions = host.ownerDocument.createElement('div');
        actions.className = 'kp-alert__actions';
        host.append(actions);
    }
    const shown = actions.childNodes.length === 1 ? actions.firstChild : null;
    if (shown === p.action || (shown && shown.isEqualNode(p.action))) return;
    actions.replaceChildren(p.action);
}

/**
 * Make the alert element for one problem (mode `each`), or update it.
 * @param {HTMLElement | undefined} existing @param {Problem} p @param {Document} doc @param {string} remedyLabel @param {HTMLElement} container
 */
function paintAlert(existing, p, doc, remedyLabel, container) {
    const severity = severityOf(p);
    const fresh = !existing;
    const el = existing ?? doc.createElement('div');
    if (fresh) {
        el.setAttribute('data-kp-key', p.key);
        el.setAttribute('role', 'alert');
    } else if (el.getAttribute('role') !== 'status') el.setAttribute('role', 'status');
    el.className = `kp-alert kp-alert--${FLAVOUR[severity]} kp-problem`;
    el.setAttribute('data-kp-severity', severity);
    let icon = el.querySelector(':scope > .kp-alert__icon');
    if (!icon) {
        icon = doc.createElement('span');
        icon.className = 'kp-alert__icon';
        icon.setAttribute('aria-hidden', 'true');
        el.prepend(icon);
    }
    setText(icon, GLYPH[severity]);
    let body = /** @type {HTMLElement | null} */ (el.querySelector(':scope > .kp-alert__body'));
    if (!body) {
        body = doc.createElement('div');
        body.className = 'kp-alert__body';
        icon.after(body);
    }
    paintParts(body, p, remedyLabel);
    paintAction(el, p);
    const close = el.querySelector(':scope > .kp-alert__close');
    if (p.dismissible && !close) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'kp-alert__close kp-icon-button';
        button.setAttribute('aria-label', getStrings().close);
        button.textContent = '×';
        button.addEventListener('click', () => {
            const go = container.dispatchEvent(new CustomEvent(PROBLEM_DISMISS_EVENT, { bubbles: true, cancelable: true, detail: { key: p.key } }));
            if (go) void leave(el).then(() => el.remove());
        });
        el.append(button);
    } else if (!p.dismissible && close) close.remove();
    return el;
}

/**
 * Set a container's problems, by key. Worst first, in the given order within a severity.
 *
 * @param {Element} container a `[data-kp-problems]`
 * @param {Problem[]} items
 * @param {ProblemsOptions} [options]
 */
export function setProblems(container, items, options = {}) {
    watch(/** @type {HTMLElement} */ (container), items, options);
    paint(container, items, options);
}

/** The problems and options each container was last given, and the observer that re-renders it on an attribute change. */
const LAST = new WeakMap();
/** @param {HTMLElement} host @param {Problem[]} items @param {ProblemsOptions} options */
function watch(host, items, options) {
    const known = LAST.get(host);
    const { mode: _mode, foldFrom: _fold, ...rest } = options;
    if (known) {
        known.items = items;
        known.options = rest;
        return;
    }
    const state = { items, options: rest, rendered: '' };
    LAST.set(host, state);
    new MutationObserver(() => {
        const wanted = `${host.getAttribute('data-kp-problems-mode')}|${host.getAttribute('data-kp-problems-fold-from')}`;
        if (wanted !== state.rendered) paint(host, state.items, state.options);
    }).observe(host, { attributes: true, attributeFilter: ['data-kp-problems-mode', 'data-kp-problems-fold-from'] });
}

/** @param {Element} container @param {Problem[]} items @param {ProblemsOptions} options */
function paint(container, items, options) {
    const doc = container.ownerDocument;
    const host = /** @type {HTMLElement} */ (container);
    const s = getStrings();
    const modeAttr = host.getAttribute('data-kp-problems-mode');
    const mode =
        options.mode ?? (PROBLEM_MODES.includes(/** @type {any} */ (modeAttr)) ? /** @type {'each' | 'list' | 'fold'} */ (modeAttr) : 'each');
    const foldFrom = Math.max(2, options.foldFrom ?? (Number.parseInt(host.getAttribute('data-kp-problems-fold-from') ?? '', 10) || 5));
    const remedyLabel = options.remedyLabel ?? host.getAttribute('data-kp-remedy-label') ?? s.problemRemedy;
    const list = ranked(items);
    if (host.getAttribute('data-kp-problems-mode') !== mode) host.setAttribute('data-kp-problems-mode', mode);
    if (mode === 'fold' && options.foldFrom !== undefined && host.getAttribute('data-kp-problems-fold-from') !== String(foldFrom))
        host.setAttribute('data-kp-problems-fold-from', String(foldFrom));
    const state = LAST.get(host);
    if (state) state.rendered = `${host.getAttribute('data-kp-problems-mode')}|${host.getAttribute('data-kp-problems-fold-from')}`;
    host.setAttribute('data-kp-problems-count', String(list.length));

    const asOne = mode === 'list' || (mode === 'fold' && list.length >= foldFrom);
    if (!asOne) {
        removeSummary(host);
        /** @type {Map<string, HTMLElement>} */
        const shown = new Map();
        for (const el of /** @type {HTMLElement[]} */ ([...host.children])) {
            const key = el.getAttribute('data-kp-key');
            // A row that is leaving is gone; one that is arriving the theme's way (formal: its leave played backwards) carries
            // `data-kp-leaving` as well, and is on show [homelab 89]: skipping it drew another copy at every repaint.
            const leaving = el.hasAttribute('data-kp-leaving') && !el.hasAttribute('data-kp-arriving');
            if (el.classList.contains('kp-problem') && key !== null && !leaving) shown.set(key, el);
        }
        const wanted = list.map((p) => paintAlert(shown.get(p.key), p, doc, remedyLabel, host));
        for (const [key, el] of shown) if (!list.some((p) => p.key === key)) void leave(el).then(() => el.remove());
        let before = /** @type {Element | null} */ (null);
        for (const el of wanted) {
            const inPlace = el.parentElement === host && (before ? el.previousElementSibling === before : host.firstElementChild === el);
            if (!inPlace) {
                if (before) before.after(el);
                else host.prepend(el);
            }
            before = el;
        }
        return;
    }

    // One alert holding the problems as a list.
    for (const el of /** @type {HTMLElement[]} */ ([...host.children]))
        if (el.classList.contains('kp-problem') && !el.classList.contains('kp-problem--list')) el.remove();
    let summary = /** @type {HTMLElement | null} */ (host.querySelector(':scope > .kp-problem--list'));
    const fresh = !summary;
    if (list.length === 0) {
        summary?.remove();
        return;
    }
    if (!summary) {
        summary = doc.createElement('div');
        summary.setAttribute('role', 'alert');
        summary.setAttribute('data-kp-key', '*');
    } else if (summary.getAttribute('role') !== 'status') summary.setAttribute('role', 'status');
    const worst = severityOf(list[0]);
    summary.className = `kp-alert kp-alert--${FLAVOUR[worst]} kp-problem kp-problem--list`;
    summary.setAttribute('data-kp-severity', worst);
    let icon = summary.querySelector(':scope > .kp-alert__icon');
    if (!icon) {
        icon = doc.createElement('span');
        icon.className = 'kp-alert__icon';
        icon.setAttribute('aria-hidden', 'true');
        summary.prepend(icon);
    }
    setText(icon, GLYPH[worst]);
    let body = /** @type {HTMLElement | null} */ (summary.querySelector(':scope > .kp-alert__body'));
    if (!body) {
        body = doc.createElement('div');
        body.className = 'kp-alert__body';
        icon.after(body);
    }
    let heading = body.querySelector(':scope > .kp-alert__summary');
    if (!heading) {
        heading = doc.createElement('p');
        heading.className = 'kp-alert__summary';
        body.prepend(heading);
    }
    setText(heading, s.problemListLabel(list.length));
    let ul = /** @type {HTMLElement | null} */ (body.querySelector(':scope > .kp-alert__list'));
    if (!ul) {
        ul = doc.createElement('ul');
        ul.className = 'kp-alert__list';
        heading.after(ul);
    }
    const open = mode === 'fold' ? foldFrom - 1 : list.length;
    summary.setAttribute('data-kp-open', String(open));
    const expanded = summary.getAttribute('data-kp-expanded') === 'true';
    /** @type {Map<string, HTMLElement>} */
    const rows = new Map();
    for (const li of /** @type {HTMLElement[]} */ ([...ul.children])) rows.set(li.getAttribute('data-kp-key') ?? '', li);
    const lis = list.map((p, at) => {
        let li = rows.get(p.key);
        if (!li) {
            li = doc.createElement('li');
            li.className = 'kp-alert__item';
            li.setAttribute('data-kp-key', p.key);
        }
        li.setAttribute('data-kp-severity', severityOf(p));
        paintParts(li, p, remedyLabel);
        paintAction(li, p);
        li.hidden = at >= open && !expanded;
        return li;
    });
    for (const [key, li] of rows) if (!list.some((p) => p.key === key)) li.remove();
    lis.forEach((li, at) => {
        if (ul.children[at] !== li) ul.insertBefore(li, ul.children[at] ?? null);
    });
    let more = /** @type {HTMLButtonElement | null} */ (body.querySelector(':scope > .kp-problems__more'));
    if (mode === 'fold' && list.length > open) {
        if (!more) {
            more = doc.createElement('button');
            more.type = 'button';
            more.className = 'kp-button kp-button--secondary kp-button--sm kp-problems__more';
            const target = /** @type {HTMLElement} */ (summary);
            more.addEventListener('click', () => {
                const next = target.getAttribute('data-kp-expanded') !== 'true';
                target.setAttribute('data-kp-expanded', String(next));
                const keep = Number.parseInt(target.getAttribute('data-kp-open') ?? '4', 10);
                const rowsNow = /** @type {HTMLElement[]} */ ([...target.querySelectorAll('.kp-alert__list > li')]);
                rowsNow.forEach((li, at) => {
                    li.hidden = at >= keep && !next;
                });
                const moreNow = /** @type {HTMLButtonElement} */ (target.querySelector('.kp-problems__more'));
                moreNow.setAttribute('aria-expanded', String(next));
                moreNow.textContent = next ? getStrings().problemShowFewer : getStrings().problemShowOthers(rowsNow.length - keep);
            });
            body.append(more);
        }
        more.setAttribute('aria-expanded', String(expanded));
        setText(more, expanded ? s.problemShowFewer : s.problemShowOthers(list.length - open));
    } else more?.remove();
    if (fresh) host.prepend(summary);
}

/** @param {HTMLElement} host */
function removeSummary(host) {
    host.querySelector(':scope > .kp-problem--list')?.remove();
}

/**
 * Attach every container of problems under `root`: it stamps the layout and the count, so the markup is complete.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachProblems(root = document) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    for (const found of root.querySelectorAll(PROBLEMS)) {
        const el = /** @type {HTMLElement} */ (found);
        if (el.dataset.kpProblemsAttached !== undefined) continue;
        el.dataset.kpProblemsAttached = '';
        if (!el.hasAttribute('data-kp-problems-mode')) el.setAttribute('data-kp-problems-mode', 'each');
        el.setAttribute('data-kp-problems-count', String(el.querySelectorAll(':scope > .kp-problem').length));
        cleanups.push(() => {
            delete el.dataset.kpProblemsAttached;
        });
    }
    return () => {
        for (const clean of cleanups) clean();
    };
}
