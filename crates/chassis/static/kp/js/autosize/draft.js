// A draft kept on this device until the form is sent: the storage key, keeping, bringing back and forgetting it.

/** The storage key of a box's draft, or null when it asks for none. @param {HTMLTextAreaElement} area */
const draftKey = (area) => {
    const name = area.getAttribute('data-kp-remember');
    return name ? `kp-remember:autosize:${name}:draft` : null;
};

/** Keep the box's text as its draft (an empty box clears it). @param {HTMLTextAreaElement} area */
export function keepDraft(area) {
    const key = draftKey(area);
    if (!key) return;
    try {
        if (area.value === '') localStorage.removeItem(key);
        else localStorage.setItem(key, area.value);
    } catch {
        // Storage refused: the draft lasts as long as the page.
    }
}

/** Bring a kept draft back into an empty box. @param {HTMLTextAreaElement} area */
export function restoreDraft(area) {
    const key = draftKey(area);
    if (!key || area.value !== '') return;
    try {
        const draft = localStorage.getItem(key);
        if (draft) area.value = draft;
    } catch {
        // No storage.
    }
}

/** The form was sent: the draft is done. @param {HTMLTextAreaElement} area */
export function forgetDraft(area) {
    const key = draftKey(area);
    if (!key) return;
    try {
        localStorage.removeItem(key);
    } catch {
        // No storage.
    }
}
