// A chip group's tracked value [forms-1102]: with `data-kp-track-value` on the group (written empty by the page), the group keeps
// the attribute in step with what is on, so the unsaved-changes bar counts it, and paints what Discard or Undo write back.
//
// The value is the values on as a JSON list (`["pain","fever"]`; `[]` is All or nothing chosen); a three-way group's is
// `{"include":[…],"exclude":[…]}`. The words are the chips' labels joined, or the All item's label.

import { TRACK_VALUE, onTrackWrite, setTrackValue } from '../track-value.js';
import { getSegmentedTri, getSegmentedValues, isAll, isTri, itemsOf, labelOf, valueOf } from './read.js';

/** Whether a group carries a tracked value. @param {Element} group */
export const isTrackedGroup = (group) => group.hasAttribute(TRACK_VALUE);

/** The group's value and words now. @param {Element} group @returns {{ value: string, text: string }} */
function readGroup(group) {
    const items = itemsOf(group);
    const label = (/** @type {string} */ value) => labelOf(items.find((item) => valueOf(item) === value) ?? group);
    if (isTri(group)) {
        const tri = getSegmentedTri(group);
        const text = [...tri.include.map(label), ...tri.exclude.map((v) => `−${label(v)}`)].join(', ');
        return { value: JSON.stringify(tri), text: text || labelOf(items.find(isAll) ?? group) };
    }
    const values = getSegmentedValues(group);
    const text = values.map(label).join(', ');
    return { value: JSON.stringify(values), text: text || labelOf(items.find(isAll) ?? group) };
}

/**
 * Write the group's value into its attribute; `announce` when a person changed it. The first write is the saved value too.
 * @param {Element} group @param {boolean} [announce]
 */
export function writeGroupTrack(group, announce = false) {
    if (!isTrackedGroup(group)) return;
    const { value, text } = readGroup(group);
    setTrackValue(/** @type {HTMLElement} */ (group), value, { text, announce, initial: true });
}

/**
 * Listen for a value written back into the group and paint it; the caller passes the setters (no import cycle with api.js).
 * @param {HTMLElement} group
 * @param {{ values: (group: Element, values: string[]) => void, tri: (group: Element, values: { include?: string[], exclude?: string[] }) => void }} set
 * @returns {() => void} detach
 */
export function listenGroupWrites(group, set) {
    return onTrackWrite(group, (raw) => {
        let parsed;
        try {
            parsed = JSON.parse(raw || '[]');
        } catch {
            console.warn('kp-segmented: a written-back value is not JSON; the group keeps what it shows', raw);
            return;
        }
        if (isTri(group)) set.tri(group, { include: parsed?.include ?? [], exclude: parsed?.exclude ?? [] });
        else set.values(group, Array.isArray(parsed) ? parsed.map(String) : []);
        writeGroupTrack(group, false);
    });
}
