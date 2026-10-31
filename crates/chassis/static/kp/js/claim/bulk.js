// Claiming everything at once and the gaps that copy.
import { getStrings } from '../strings.js';
import { getChecklistItems, setChecklistItems } from '../checklist.js';
import { undoToast } from '../undo-toast.js';
import { CLAIM_EVENT, CLAIM_UNDO_MS } from './constants.js';
import { attr, byOf, say, stateOf } from './model.js';

/** Take every open item for the viewer, behind one Undo. @param {HTMLElement} list */
export async function takeAll(list) {
    const s = getStrings();
    const st = stateOf(list);
    const viewer = st.viewer;
    if (!viewer) return;
    const before = getChecklistItems(list);
    const open = before.filter((i) => byOf(i).length === 0 && !i.claim?.locked);
    if (open.length === 0) return;
    const by = (/** @type {typeof before[number]} */ i) => (open.includes(i) ? [viewer] : byOf(i));
    /** @type {Promise<unknown> | null} */
    let waiting = null;
    const detail = {
        id: '',
        action: 'take-all',
        person: viewer,
        by: [viewer],
        previousBy: [],
        items: before,
        ids: open.map((i) => i.id),
        settle: (/** @type {Promise<unknown>} */ a) => void (waiting = a),
    };
    if (!list.dispatchEvent(new CustomEvent(CLAIM_EVENT, { bubbles: true, cancelable: true, detail }))) return;
    if (waiting) {
        try {
            if ((await waiting) === false) return;
        } catch {
            say(list, s.claimNotSaved);
            return;
        }
    }
    setChecklistItems(
        list,
        before.map((i) => ({ ...i, claim: { ...i.claim, by: by(i) } })),
    );
    say(list, s.claimTookAll(open.length));
    const ms = Number(attr(list, 'undo-ms', String(CLAIM_UNDO_MS)));
    if (ms > 0)
        undoToast(s.claimTookAll(open.length), {
            mode: 'revert',
            ms,
            undo: () => setChecklistItems(list, before),
        });
}

/** @param {HTMLElement} list */
export async function copyGaps(list) {
    const s = getStrings();
    const names = getChecklistItems(list)
        .filter((i) => byOf(i).length === 0)
        .map((i) => i.label);
    if (names.length === 0) return;
    try {
        await navigator.clipboard.writeText(s.claimCopyLine(names.join(', ')));
        say(list, s.claimCopied(names.length));
    } catch {
        say(list, s.claimCopyFailed);
    }
}
