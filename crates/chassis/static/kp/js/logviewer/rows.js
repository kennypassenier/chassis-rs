// Builds and dresses one log row, and finds the words that match.
import { getStrings } from '../strings.js';
import { SOURCE_PROPERTY, sourceColour } from '../log.js';
import { LOG_LEVELS } from './constants.js';
import { clock } from './levels.js';
import { BUILT, attr, el, stateOf } from './model.js';
import { floorOf, logOf, queryOf } from './reads.js';
/** @typedef {import('./types.js').Kept} Kept */

/** Build one row. @param {Kept} line @returns {HTMLElement} */
export function rowFor(line) {
    const row = el('kp-log__line');
    row.setAttribute('data-id', line.id);
    row.setAttribute('data-kp-severity', line.level);
    const time = el('kp-log__time', 'span');
    time.setAttribute('title', `${clock(line.ts, true)}.${String(new Date(line.ts).getMilliseconds()).padStart(3, '0')}`);
    const source = el('kp-log__source', 'span');
    if (line.source) {
        source.setAttribute('data-kp-source', line.source);
        source.style.setProperty(SOURCE_PROPERTY, sourceColour(line.source));
        source.textContent = line.source;
    }
    const level = el('kp-log__level', 'span');
    const word = el('kp-log__word', 'span');
    word.textContent = line.level;
    level.append(word);
    const message = el('kp-log__message', 'span');
    row.append(time, source, level, message);
    return row;
}

/**
 * Put the options on a row: the time, the filter, the marks.
 * @param {HTMLElement} root
 * @param {HTMLElement} row
 * @param {Kept} line
 */
export function dress(root, row, line) {
    const mode = attr(root, 'time', 'time');
    const timeCell = /** @type {HTMLElement} */ (row.children[0]);
    if (mode !== 'off') {
        const text = clock(line.ts, mode === 'datetime');
        if (timeCell.textContent !== text) timeCell.textContent = text;
    } else timeCell.textContent = '';
    const query = queryOf(root);
    const message = /** @type {HTMLElement} */ (row.children[3]);
    const hit = query !== '' && line.message.toLowerCase().includes(query);
    // Marks: the message is built again only when the text to find changed or the row has no message yet.
    if (BUILT.get(message) !== query || message.firstChild === null) {
        message.replaceChildren();
        if (!hit) message.textContent = line.message;
        else {
            const lower = line.message.toLowerCase();
            let from = 0;
            for (let at = lower.indexOf(query); at !== -1; at = lower.indexOf(query, from)) {
                if (at > from) message.append(line.message.slice(from, at));
                const mark = el('kp-log__match', 'mark');
                mark.textContent = line.message.slice(at, at + query.length);
                message.append(mark);
                from = at + query.length;
            }
            if (from < line.message.length) message.append(line.message.slice(from));
        }
        BUILT.set(message, query);
    }
    const lowEnough = LOG_LEVELS.indexOf(line.level) >= floorOf(root);
    const wanted = attr(root, 'search-only', 'off') === 'on' && query !== '' ? hit : true;
    row.hidden = !(lowEnough && wanted);
}

/** The count text beside the search box. @param {HTMLElement} root */
export function matchWords(root) {
    const s = getStrings();
    const st = stateOf(root);
    if (queryOf(root) === '') return s.logviewerSearchIdle;
    if (st.matches.length === 0) return s.logviewerSearchNone;
    return st.at >= 0 ? s.logviewerMatchAt(st.at + 1, st.matches.length) : s.logviewerMatches(st.matches.length);
}

/** Collect the marks again and keep the current one where it was. @param {HTMLElement} root @param {boolean} [reset] */
export function collect(root, reset = false) {
    const st = stateOf(root);
    const log = logOf(root);
    const before = reset ? null : (st.matches[st.at] ?? null);
    st.matches =
        queryOf(root) === '' ? [] : /** @type {HTMLElement[]} */ ([...log.querySelectorAll('.kp-log__line:not([hidden]) mark.kp-log__match')]);
    st.at = before ? st.matches.indexOf(before) : -1;
    for (const mark of log.querySelectorAll('mark[data-kp-current]')) mark.removeAttribute('data-kp-current');
    if (st.at >= 0) st.matches[st.at].setAttribute('data-kp-current', '');
}
