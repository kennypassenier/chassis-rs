// The inline line of keyboard shortcuts [kpadopt-controls]: key caps with what
// each does, on one line under a list or beside a control, outside the Help
// sheet (`.kp-shortcuts`, js/palette.js), which is a boxed dialog.
//
//   <div class="kp-keys" role="group" aria-label="Keyboard shortcuts">
//       <span class="kp-keys__item"><kbd class="kp-kbd">/</kbd> search containers</span>
//       <span class="kp-keys__item">
//           <span class="kp-keys__caps"><kbd class="kp-kbd">↑</kbd><kbd class="kp-kbd">↓</kbd></span> move
//       </span>
//       <span class="kp-keys__item"><kbd class="kp-kbd" data-kp-key="mod">Ctrl</kbd><kbd class="kp-kbd">K</kbd> palette</span>
//   </div>
//
// The markup is complete without any script; this module is for a page that
// would rather give the pairs than write the spans:
//
//   setKeys(el, [['/', 'search containers'], [['↑', '↓'], 'move'], [['Mod', 'K'], 'palette']]);
//
// A chord, keys pressed one after the other (O, then T), takes a third member [parts-1102]:
//
//   setKeys(el, [[['O', 'T'], 'open the overdue tasks', { chord: true }]]);
//
// and is drawn as its caps with the dictionary's "then" between them (`.kp-keys__then`, `keysThen`), the way the shortcut sheet
// shows `g t`; the caps of a chord are a `.kp-keys__caps--chord` group.
//
// `Mod` is the platform's modifier: ⌘ on a Mac, Ctrl elsewhere, in the set
// form and in markup (`data-kp-key="mod"` on a cap is filled by attachKeys).
// A key is a cap's text, so a page may give "Esc", "Enter" or "⇧". Nothing runs
// on import; attachKeys(root) returns a detach.

import { getStrings } from './strings.js';

/** A cap whose text is the platform's modifier key. */
export const MOD_CAP = '.kp-kbd[data-kp-key="mod"]';

/** A line of shortcuts. */
export const KEYS = '.kp-keys';

/**
 * One shortcut: the key (or keys pressed together, or one after the other with `{ chord: true }`) and what it does.
 * @typedef {[string | readonly string[], string] | [string | readonly string[], string, { chord?: boolean }]} KeyPair
 */

/** Whether this is a Mac, where the modifier is ⌘ rather than Ctrl (the palette decides the same way, js/palette.js). */
function isMac() {
    if (typeof navigator === 'undefined') return false;
    const platform = /** @type {any} */ (navigator).userAgentData?.platform ?? navigator.platform ?? '';
    return /mac|iphone|ipad/i.test(platform);
}

/** Whether the modifier key is ⌘ here rather than Ctrl, for a part that names its own shortcuts (the Markdown editor) [habits-1101]. */
export const isMacPlatform = () => isMac();

/** @param {string} key */
const capText = (key) => (key.toLowerCase() === 'mod' ? (isMac() ? '⌘' : 'Ctrl') : key);

/**
 * Write a line of shortcuts into `el`, replacing what it held. The element
 * becomes a `.kp-keys` group named "Keyboard shortcuts" unless it already has
 * a name.
 * @param {Element} el
 * @param {readonly KeyPair[]} pairs
 */
export function setKeys(el, pairs) {
    el.classList.add('kp-keys');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'group');
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) el.setAttribute('aria-label', getStrings().keysLabel);
    el.replaceChildren(...pairs.map(([keys, what, how]) => keyItem(keys, what, how?.chord === true)));
}

/** One cap. @param {string} key */
function capOf(key) {
    const cap = document.createElement('kbd');
    cap.className = 'kp-kbd';
    cap.textContent = capText(key);
    if (key.toLowerCase() === 'mod') cap.setAttribute('data-kp-key', 'mod');
    return cap;
}

/** One shortcut's item: its caps (together, or a chord with "then" between them) and its words. @param {string | readonly string[]} keys @param {string} what @param {boolean} chord */
function keyItem(keys, what, chord) {
    const item = document.createElement('span');
    item.className = 'kp-keys__item';
    const caps = (typeof keys === 'string' ? [keys] : [...keys]).map(capOf);
    if (caps.length > 1) {
        const group = document.createElement('span');
        group.className = chord ? 'kp-keys__caps kp-keys__caps--chord' : 'kp-keys__caps';
        caps.forEach((cap, i) => {
            if (chord && i > 0) {
                const then = document.createElement('span');
                then.className = 'kp-keys__then';
                then.textContent = getStrings().keysThen;
                group.append(then);
            }
            group.append(cap);
        });
        item.append(group);
    } else item.append(...caps);
    item.append(` ${what}`);
    return item;
}

/**
 * Fill every `.kp-kbd[data-kp-key="mod"]` under `root` with the platform's
 * modifier (⌘ or Ctrl).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachKeys(root = document) {
    for (const cap of root.querySelectorAll(MOD_CAP)) cap.textContent = capText('mod');
    return () => undefined;
}
