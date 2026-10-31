// Sends an answer to the page, with undo, and rolls it back when the page refuses.
import { getStrings } from '../strings.js';
import { undoToast } from '../undo-toast.js';
import { paintKeys } from './api.js';
import { AVAILABILITY_EVENT, AVAILABILITY_REFUSED_MS, AVAILABILITY_UNDO_MS } from './constants.js';
import { attr, cellKey, columnFacts, editable, stateOf, wordOf } from './facts.js';
import { render, say } from './paint.js';
/** @typedef {import('./types.js').AvState} AvState */
/** @typedef {import('./types.js').AvailabilityAnswer} AvailabilityAnswer */

/**
 * Ask for a change of one or more cells in one row.
 * @param {HTMLElement} root @param {string} person @param {string[]} keys @param {AvailabilityAnswer | null} answer
 * @param {{ stroke?: boolean }} [options]
 */
export async function request(root, person, keys, answer, { stroke = false } = {}) {
    const st = stateOf(root);
    const s = getStrings();
    const row = st.set.answers[person] ?? {};
    /** @type {Record<string, AvailabilityAnswer | undefined>} */
    const previous = {};
    const changing = keys.filter((k) => editable(root, person, k) && row[k] !== (answer ?? undefined));
    if (changing.length === 0) return;
    for (const k of changing) previous[k] = row[k];
    /** @type {Promise<unknown> | null} */
    let waiting = null;
    const nextAnswers = structuredClone(st.set.answers);
    for (const k of changing) {
        const r = (nextAnswers[person] ??= {});
        if (answer) r[k] = answer;
        else delete r[k];
    }
    const detail = {
        person,
        keys: changing,
        answer,
        previous,
        answers: nextAnswers,
        settle: (/** @type {Promise<unknown>} */ p) => void (waiting = p),
    };
    const go = root.dispatchEvent(new CustomEvent(AVAILABILITY_EVENT, { bubbles: true, cancelable: true, detail }));
    const label = (/** @type {string[]} */ ks) => ks.map((k) => st.set.columns.find((c) => c.key === k)?.label ?? k).join(', ');
    const refuse = (/** @type {string} */ why) => {
        for (const k of changing) {
            const id = cellKey(person, k);
            window.clearTimeout(st.refused.get(id));
            st.refused.set(
                id,
                window.setTimeout(() => {
                    st.refused.delete(id);
                    paintKeys(root, person, [k]);
                }, AVAILABILITY_REFUSED_MS),
            );
        }
        paintKeys(root, person, changing);
        const line = /** @type {HTMLElement | null} */ (root.querySelector('.kp-availability__why'));
        if (line) {
            line.textContent = why;
            window.setTimeout(() => {
                if (line.textContent === why) line.textContent = '';
            }, AVAILABILITY_REFUSED_MS);
        }
        say(root, why);
    };
    if (!go) return refuse(s.availabilityNotSaved(label(changing)));
    if (waiting) {
        for (const k of changing) st.saving.add(cellKey(person, k));
        paintKeys(root, person, changing);
        /** @type {unknown} */
        let result;
        try {
            result = await waiting;
        } catch {
            result = false;
        }
        for (const k of changing) st.saving.delete(cellKey(person, k));
        if (result === false || (typeof result === 'object' && result !== null && /** @type {any} */ (result).refused === true)) {
            const why = typeof result === 'object' && result !== null ? /** @type {any} */ (result).error : undefined;
            return refuse(why ?? s.availabilityNotSaved(label(changing)));
        }
    }
    const wasComplete = new Set(
        st.set.columns
            .filter((c) => {
                const f = columnFacts(root, c.key);
                return f.total > 0 && f.yes === f.total;
            })
            .map((c) => c.key),
    );
    for (const k of changing) setAvailabilityAnswerQuiet(st, person, k, answer);
    render(root);
    const nowComplete = st.set.columns.filter((c) => {
        const f = columnFacts(root, c.key);
        return f.total > 0 && f.yes === f.total && !wasComplete.has(c.key);
    });
    if (stroke) {
        const mine = Object.values(st.set.answers[person] ?? {});
        say(
            root,
            s.availabilityYourAnswers(
                mine.filter((a) => a === 'yes').length,
                mine.filter((a) => a === 'maybe').length,
                mine.filter((a) => a === 'no').length,
            ),
        );
        const ms = Number(attr(root, 'undo-ms', String(AVAILABILITY_UNDO_MS)));
        if (ms > 0) {
            undoToast(s.availabilityStroke(changing.length), {
                mode: 'revert',
                ms,
                undo: () => {
                    for (const k of changing) setAvailabilityAnswerQuiet(st, person, k, previous[k] ?? null);
                    render(root);
                    root.dispatchEvent(
                        new CustomEvent(AVAILABILITY_EVENT, {
                            bubbles: true,
                            detail: {
                                person,
                                keys: changing,
                                answer: null,
                                previous: {},
                                answers: structuredClone(st.set.answers),
                                restored: true,
                                settle: () => undefined,
                            },
                        }),
                    );
                },
            });
        }
    } else if (nowComplete.length) say(root, s.availabilityEveryone(nowComplete[0].label));
    else
        say(root, s.availabilityCellSaid(st.spec.people?.find((p) => p.id === person)?.name ?? person, label(changing), wordOf(answer ?? undefined)));
    // The focus stays on the cell that was pressed (the grid was redrawn).
    const again = /** @type {HTMLElement | null} */ (
        root.querySelector(`.kp-heat__cell[data-row-key="${CSS.escape(person)}"][data-col-key="${CSS.escape(changing[0])}"]`)
    );
    if (again && !stroke && document.activeElement === document.body) again.focus({ preventScroll: true });
}

/** @param {AvState} st @param {string} person @param {string} key @param {AvailabilityAnswer | null} answer */
function setAvailabilityAnswerQuiet(st, person, key, answer) {
    const row = (st.set.answers[person] ??= {});
    if (answer) row[key] = answer;
    else delete row[key];
    const target = st.spec.sets?.[st.unit];
    if (target) target.answers = structuredClone(st.set.answers);
}
