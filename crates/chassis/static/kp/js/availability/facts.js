// Reads the grid: its state, its answers, who may edit what and the facts of a column.
import { getStrings } from '../strings.js';
/** @typedef {import('./types.js').AvState} AvState */
/** @typedef {import('./types.js').AvailabilityAnswer} AvailabilityAnswer */
/** @typedef {import('./types.js').AvailabilityPerson} AvailabilityPerson */

/** @type {WeakMap<Element, AvState>} */
export const STATE = new WeakMap();

/** @param {string} className @param {string} [tag] */
export const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} root @param {string} name @param {string} fallback */
export const attr = (root, name, fallback) => root.getAttribute(`data-kp-availability-${name}`) ?? fallback;

export const cellKey = (/** @type {string} */ person, /** @type {string} */ column) => `${person}\u0000${column}`;

/** @param {AvailabilityAnswer | undefined} a */
export const toneOf = (a) => (a === 'yes' ? 'ok' : a === 'maybe' ? 'warn' : a === 'no' ? 'bad' : 'muted');
/** @param {AvailabilityAnswer | undefined} a */
export const glyphOf = (a) => (a === 'yes' ? '✓' : a === 'maybe' ? '~' : a === 'no' ? '×' : '');
/** @param {AvailabilityAnswer | undefined} a */
export const wordOf = (a) => {
    const s = getStrings();
    return a === 'yes' ? s.availabilityYes : a === 'maybe' ? s.availabilityMaybe : a === 'no' ? s.availabilityNo : s.availabilityNone;
};

/** @param {HTMLElement} root */
export const stateOf = (root) => /** @type {AvState} */ (STATE.get(root));

/** The person looking. @param {AvState} st */
const viewerOf = (st) => (st.spec.people ?? []).find((p) => p.mine) ?? null;

/** The answers allowed by the root. @param {HTMLElement} root @returns {AvailabilityAnswer[]} */
export const allowed = (root) => (attr(root, 'answers', '3') === '2' ? ['yes', 'no'] : ['yes', 'maybe', 'no']);

/** @param {HTMLElement} root */
const editMode = (root) => {
    const v = root.getAttribute('data-kp-heat-edit');
    return v === 'all' || v === 'off' ? v : 'own';
};

/** Whether this person's cell in this column can be changed now. @param {HTMLElement} root @param {string} person @param {string} column */
export function editable(root, person, column) {
    const st = stateOf(root);
    if (root.hasAttribute('data-kp-disabled') || root.hasAttribute('data-kp-availability-disabled')) return false;
    if ((attr(root, 'locked', '') || '').split(/[\s,]+/).includes(column)) return false;
    const mode = editMode(root);
    if (mode === 'off') return false;
    if (mode === 'all') return true;
    return viewerOf(st)?.id === person;
}

/** The best column or columns, as keys. @param {HTMLElement} root @returns {string[]} */
export function availabilityBest(root) {
    const st = stateOf(root);
    const mode = attr(root, 'best', 'most');
    const people = st.spec.people ?? [];
    const cols = st.set.columns;
    if (mode === 'none' || people.length === 0 || cols.length === 0) return [];
    const quorum = Math.max(1, Number(attr(root, 'quorum', String(people.length))) || people.length);
    const rule = attr(root, 'best-rule', 'yes-count');
    const tally = cols.map((c) => {
        let yes = 0;
        let maybe = 0;
        let no = 0;
        for (const p of people) {
            const a = st.set.answers[p.id]?.[c.key];
            if (a === 'yes') yes += 1;
            else if (a === 'maybe') maybe += 1;
            else if (a === 'no') no += 1;
        }
        return { key: c.key, yes, maybe, no, answered: yes + maybe + no };
    });
    const locked = (attr(root, 'locked', '') || '').split(/[\s,]+/);
    void locked;
    const window = Number(attr(root, 'window', '0')) || 0;
    if (st.unit === 'day' && window > 1 && cols.length >= window) {
        let best = null;
        for (let i = 0; i + window <= cols.length; i += 1) {
            const part = tally.slice(i, i + window);
            if (part.some((t) => t.answered < quorum)) continue;
            const no = part.reduce((n, t) => n + t.no, 0);
            const yes = part.reduce((n, t) => n + t.yes, 0);
            if (yes === 0) continue;
            const score = rule === 'no-nobody' ? [-no, yes] : [yes, -no];
            if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && score[1] > best.score[1]))
                best = { score, keys: part.map((t) => t.key) };
        }
        return best ? best.keys : [];
    }
    const pool = tally.filter((t) => t.answered >= quorum && t.yes > 0 && (mode !== 'everyone' || (t.no === 0 && t.answered === people.length)));
    if (pool.length === 0) return [];
    const score = (/** @type {typeof tally[number]} */ t) => (rule === 'no-nobody' ? [-t.no, t.yes] : [t.yes, -t.no]);
    const top = pool.reduce((a, t) => {
        const x = score(t);
        const y = score(a);
        return x[0] > y[0] || (x[0] === y[0] && x[1] > y[1]) ? t : a;
    }, pool[0]);
    const tops = score(top);
    return pool.filter((t) => score(t)[0] === tops[0] && score(t)[1] === tops[1]).map((t) => t.key);
}

/** The people in the order the grid shows them. @param {HTMLElement} root */
export function ordered(root) {
    const st = stateOf(root);
    const people = [...(st.spec.people ?? [])];
    const sort = attr(root, 'sort', 'mine-first');
    const count = (/** @type {AvailabilityPerson} */ p) => Object.keys(st.set.answers[p.id] ?? {}).length;
    if (sort === 'mine-first') return people.sort((a, b) => Number(Boolean(b.mine)) - Number(Boolean(a.mine)));
    if (sort === 'answered-first') return people.sort((a, b) => Number(Boolean(b.mine)) - Number(Boolean(a.mine)) || count(b) - count(a));
    return people;
}

/** Everything one column says about itself. @param {HTMLElement} root @param {string} key */
export function columnFacts(root, key) {
    const st = stateOf(root);
    const people = st.spec.people ?? [];
    /** @type {Record<AvailabilityAnswer, string[]>} */
    const names = { yes: [], maybe: [], no: [] };
    for (const p of people) {
        const a = st.set.answers[p.id]?.[key];
        if (a) names[a].push(p.name);
    }
    const answered = names.yes.length + names.maybe.length + names.no.length;
    return { names, yes: names.yes.length, maybe: names.maybe.length, no: names.no.length, answered, total: people.length };
}

/** The hover card's words for a column. @param {ReturnType<typeof columnFacts>} f */
export function tipOf(f) {
    const s = getStrings();
    const part = (/** @type {string} */ word, /** @type {string[]} */ names) => (names.length ? `${word}: ${names.join(', ')}` : '');
    return (
        [part(s.availabilityYes, f.names.yes), part(s.availabilityMaybe, f.names.maybe), part(s.availabilityNo, f.names.no)]
            .filter(Boolean)
            .join('. ') || s.availabilityNobodyAnswered
    );
}
