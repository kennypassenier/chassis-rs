// The line of facts under a task's title: each fact a package part (a badge for a deadline, a dot and a name for a project, a
// categorical chip for a tag, a muted word for the rest), so a row reads the same in every list and every theme.

/**
 * One fact. A string is a plain muted fact.
 * @typedef {object} TaskFact
 * @property {string} text what it says
 * @property {'plain' | 'badge' | 'project' | 'tag'} [kind] `plain` (default) a muted word; `badge` the package's badge (a deadline);
 *   `project` a categorical dot before the name; `tag` a categorical chip
 * @property {'warning' | 'destructive' | 'success' | 'info'} [tone] a badge's tone (overdue is `destructive`, today `warning`)
 * @property {number} [cat] 1 to 12, the categorical colour of a project or a tag
 * @property {string} [href] a link (a tag's page)
 * @property {string} [label] what a screen reader hears instead of `text` (a glyph's meaning)
 */

/** The kinds a fact can be. */
const KINDS = ['plain', 'badge', 'project', 'tag'];
/** How many categorical colours a theme has. */
const CAT_COUNT = 12;

/** @param {number | undefined} cat */
const validCat = (cat) => (Number.isInteger(cat) && /** @type {number} */ (cat) >= 1 && /** @type {number} */ (cat) <= CAT_COUNT ? String(cat) : null);

/**
 * One fact as its element.
 * @param {Document} doc @param {TaskFact | string | Node} fact
 * @returns {Node}
 */
export function factNode(doc, fact) {
    if (typeof fact !== 'string' && !('text' in fact)) return fact;
    const f = typeof fact === 'string' ? { text: fact } : fact;
    const kind = f.kind && KINDS.includes(f.kind) ? f.kind : 'plain';
    const el = doc.createElement(f.href ? 'a' : 'span');
    if (f.href) el.setAttribute('href', f.href);
    const cat = validCat(f.cat);
    if (cat) el.dataset.kpCat = cat;
    if (kind === 'badge') el.className = `kp-badge${f.tone ? ` kp-badge--${f.tone}` : ''}`;
    else if (kind === 'tag') el.className = 'kp-cat-chip';
    else el.className = `kp-task-row__fact${kind === 'project' ? ' kp-task-row__fact--project' : ''}`;
    if (kind === 'project') {
        const dot = doc.createElement('span');
        dot.className = 'kp-cat-dot';
        dot.setAttribute('aria-hidden', 'true');
        el.append(dot);
    }
    el.append(doc.createTextNode(f.text));
    if (f.label) el.setAttribute('aria-label', f.label);
    if (f.label && !f.href) el.setAttribute('role', 'img');
    return el;
}
