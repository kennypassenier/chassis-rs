// Editors that are not form boxes [habits-1103]: an inline title edit, a quick-add line, a rail's draft. The app registers each
// one while it is on screen with how to tell it holds text the server lacks and how to save it; it then takes part in Back,
// reload and the page-wide leave check (js/overlays/page-guard.js) beside the guarded regions and dialogs.

/**
 * An editor the app registers.
 * @typedef {object} EditorOptions
 * @property {HTMLElement} element  the editor; it is dropped once it left the page, and a Discard is released on its next edit
 * @property {() => boolean} isDirty  true while it holds text the server does not (an error counts as true: asking beats losing text)
 * @property {() => Promise<unknown>} [flush]  saves it now; runs before the question, and `isDirty()` must tell afterwards whether it worked
 * @property {() => void} [discard]  Discard was chosen: throw the text away
 * @property {boolean} [reloadOnly]  the text survives a move to another screen: only a reload or closed tab counts it
 */

/** @type {Set<EditorOptions>} */
const editors = new Set();
/** Editors Discard let go of, until their next edit. @type {WeakSet<EditorOptions>} */
const released = new WeakSet();

/**
 * Register an editor; returns the unregister.
 * @param {EditorOptions} editor
 */
export function registerEditor(editor) {
    editors.add(editor);
    return () => void editors.delete(editor);
}

/** @param {EditorOptions} editor */
function dirty(editor) {
    try {
        return editor.isDirty();
    } catch (err) {
        console.warn('an editor could not say whether it holds unsaved text; treating it as unsaved', err);
        return true;
    }
}

/**
 * The editors that hold unsaved text now, as guard units.
 * @param {{ reload?: boolean }} [options] `reload`: also the ones that survive a screen change
 * @returns {import('./guard-question.js').GuardUnit[]}
 */
export function editorUnits({ reload = false } = {}) {
    /** @type {import('./guard-question.js').GuardUnit[]} */
    const out = [];
    for (const e of editors) {
        if (!e.element.isConnected) editors.delete(e);
        else if ((reload || !e.reloadOnly) && !released.has(e) && dirty(e)) {
            out.push({
                el: e.element,
                flush: e.flush,
                release: () => {
                    released.add(e);
                    e.discard?.();
                },
            });
        }
    }
    return out;
}

/** An edit inside a released editor starts holding again. @param {Event} event */
function onEdit(event) {
    if (!(event.target instanceof Node)) return;
    for (const e of editors) if (released.has(e) && e.element.contains(event.target)) released.delete(e);
}

/** @type {[string, (event: Event) => void][]} */
export const EDITOR_LISTENERS = [
    ['keydown', onEdit],
    ['beforeinput', onEdit],
];
