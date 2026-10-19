// The lede: the short paragraph under a heading that says what the section does [kpadopt5].
//
// The markup is complete without this module (`.kp-lede`, css/components.css); the module adds what a stylesheet cannot:
//
//   · the heading it follows is described by it (`aria-describedby`), so a screen reader hears it with the heading
//   · (both options below are read again when the attribute changes, js/live-options.js)
//   · `data-kp-lede-collapsible[=N]`: a lede longer than about N characters (default 140) shows its first sentences and folds
//     the rest behind "More" / "Less"
//   · `data-kp-lede-link="<url>"`: a "Learn more" link at the end (also on a folded lede: after the folded part)
//   · `missingLedes(root)` lists the headings of `.kp-card__title`, and of every heading inside a container marked
//     `data-kp-lede-required`, that have no lede after them; attachLedes() warns about them in the console
//
//   <h2 id="schedules">Schedules</h2>
//   <p class="kp-lede">Each schedule starts a job at fixed times. Pause one to stop it without deleting it.</p>
//
// Nothing runs on import; attachLedes(root) returns a detach.

import { getStrings } from './strings.js';
import { watchOptions } from './live-options.js';

/** A lede. */
export const LEDE = '.kp-lede';

let counter = 0;
const HEADINGS = 'h1, h2, h3, h4, h5, h6, .kp-card__title, .kp-page-header__title';

/**
 * What may hold the heading a lede follows. `[data-kp-measured]` is the span js/effects/measure.js wraps a headline in
 * (blueprint's measurement frame): whether the frame went up before this module attached depends on which of the two
 * arrived first, and under js/auto.js the effects attach first, so a wrapped headline read as no heading at all.
 */
const HOLDERS = 'header, .kp-card__header, .kp-page-header, div, [data-kp-measured]';

/** The heading a lede belongs to: the nearest heading before it in its container. @param {Element} lede */
function headingOf(lede) {
    let prev = lede.previousElementSibling;
    while (prev) {
        if (prev.matches(HEADINGS)) return prev;
        const inner = prev.querySelector(HEADINGS);
        if (inner && prev.matches(HOLDERS)) return inner;
        if (!prev.matches('.kp-lede, p, div')) return null;
        prev = prev.previousElementSibling;
    }
    return null;
}

/**
 * The headings under `root` that have no lede after them.
 * @param {ParentNode} [root]
 * @returns {Element[]}
 */
export function missingLedes(root = document) {
    /** @type {Element[]} */
    const scope = [...root.querySelectorAll(`.kp-card__title, [data-kp-lede-required] :is(${HEADINGS})`)];
    return scope.filter((heading) => {
        let node = heading.nextElementSibling ?? heading.parentElement?.nextElementSibling ?? null;
        for (let hops = 0; node && hops < 3; hops++) {
            if (node.matches(LEDE) || node.querySelector(LEDE)) return false;
            if (node.matches(HEADINGS)) return true;
            node = node.nextElementSibling;
        }
        return true;
    });
}

/**
 * Wire every lede under `root`.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachLedes(root = document) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    for (const found of root.querySelectorAll(LEDE)) {
        const lede = /** @type {HTMLElement} */ (found);
        if (lede.dataset.kpLedeAttached !== undefined) continue;
        lede.dataset.kpLedeAttached = '';
        const s = getStrings();
        if (!lede.id) lede.id = `kp-lede-${++counter}`;
        const heading = headingOf(lede);
        const before = heading?.getAttribute('aria-describedby') ?? null;
        if (heading) {
            const ids = (before ?? '').split(/\s+/).filter(Boolean);
            if (!ids.includes(lede.id)) heading.setAttribute('aria-describedby', [...ids, lede.id].join(' '));
        }

        /** @type {HTMLAnchorElement | null} */
        let link = null;
        /** @type {HTMLButtonElement | null} */
        let toggle = null;
        /** @type {HTMLElement | null} */
        let rest = null;
        /** The lede's own words while it is folded, to give back. */
        let plain = '';

        // The fold and the link are drawn from the two attributes, and drawn again when either changes [live-options-1019].
        const draw = () => {
            // The text to fold is read before the link is appended: the link is an element of its own, and a lede that already
            // carries one would otherwise read as a lede with markup in it and never fold [findings-1019].
            plain = lede.childElementCount === 0 ? (lede.textContent ?? '').trim().replace(/\s+/g, ' ') : '';
            const href = lede.getAttribute('data-kp-lede-link');
            if (href) {
                link = lede.ownerDocument.createElement('a');
                link.className = 'kp-lede__link';
                link.href = href;
                link.textContent = s.ledeLearnMore;
                lede.append(' ', link);
            }

            // A very long lede folds after its first sentences, by splitting the text itself (a clipped line would still be
            // laid out underneath the content that follows it): the rest is a hidden span that "More" opens.
            const limit = Number.parseInt(lede.getAttribute('data-kp-lede-collapsible') ?? '', 10) || 140;
            if (lede.hasAttribute('data-kp-lede-collapsible') && plain.length > limit * 1.5) {
                const sentences = plain.split(/(?<=[.!?])\s+/);
                let head = '';
                let at = 0;
                while (at < sentences.length - 1 && head.length < limit) head += (head ? ' ' : '') + sentences[at++];
                if (at < sentences.length) {
                    lede.textContent = `${head} `;
                    rest = lede.ownerDocument.createElement('span');
                    rest.id = `${lede.id}-rest`;
                    rest.hidden = true;
                    rest.textContent = sentences.slice(at).join(' ');
                    lede.append(rest);
                    // The link stays at the end of the whole lede, after the folded part.
                    if (link) lede.append(' ', link);
                    toggle = lede.ownerDocument.createElement('button');
                    toggle.type = 'button';
                    toggle.className = 'kp-button kp-button--ghost kp-button--sm kp-lede__toggle';
                    toggle.setAttribute('aria-expanded', 'false');
                    toggle.setAttribute('aria-controls', rest.id);
                    toggle.textContent = s.ledeMore;
                    lede.after(toggle);
                    const hiddenRest = rest;
                    const button = toggle;
                    button.addEventListener('click', () => {
                        hiddenRest.hidden = !hiddenRest.hidden;
                        button.setAttribute('aria-expanded', String(!hiddenRest.hidden));
                        button.textContent = hiddenRest.hidden ? s.ledeMore : s.ledeLess;
                    });
                }
            }
        };
        /** Give the lede back its own words, without the link or the fold. */
        const undraw = () => {
            toggle?.remove();
            toggle = null;
            link?.previousSibling?.remove();
            link?.remove();
            link = null;
            if (rest) lede.textContent = plain;
            rest = null;
        };
        draw();
        const stop = watchOptions(lede, ['data-kp-lede-collapsible', 'data-kp-lede-link'], () => {
            undraw();
            draw();
        });
        cleanups.push(() => {
            stop();
            undraw();
            if (heading) {
                if (before === null) heading.removeAttribute('aria-describedby');
                else heading.setAttribute('aria-describedby', before);
            }
            delete lede.dataset.kpLedeAttached;
        });
    }
    const missing = missingLedes(root);
    if (missing.length > 0 && root.querySelector?.('[data-kp-lede-required]'))
        console.warn(`[kp-lede] ${missing.length} heading(s) without a lede:`, missing);
    return () => {
        for (const clean of cleanups) clean();
    };
}
