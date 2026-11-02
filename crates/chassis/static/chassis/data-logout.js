// Logout empties the offline copy (feat-offline-1). The logout form's submit
// is held for the purge (at most `timeoutMs`), then sent; the worker also
// deletes the chassis-data databases when it sees the /logout request.

export const LOGOUT_PATH = '/logout';

/** Whether a form action posts to the kit's logout. */
export function isLogoutAction(action, base) {
    try {
        return new URL(action, base).pathname === LOGOUT_PATH;
    } catch {
        return false;
    }
}

/** Purge, but never block the logout longer than `timeoutMs`. */
export async function purgeBeforeLogout(purge, timeoutMs, setTimer) {
    const late = new Promise((resolve) => setTimer(() => resolve('late'), timeoutMs));
    try {
        return await Promise.race([purge().then(() => 'purged'), late]);
    } catch (err) {
        console.warn('chassisData: the offline copy could not be purged at logout; the worker deletes it.', err);
        return 'failed';
    }
}

export const LOGOUT_MESSAGES = {
    title: 'Log out with unsent changes?',
    body: (n) => `${n} ${n === 1 ? 'change has' : 'changes have'} not been sent yet and will be lost.`,
    accept: 'Log out anyway',
    stay: 'Stay',
};

/** Whether logging out needs the person's word first: only when edits would be lost. */
export function logoutNeedsConfirm(unsent) {
    return Number.isInteger(unsent) && unsent > 0;
}

/**
 * Ask with the kit's confirm dialog (kp-themes `openConfirmation`, opened on
 * `trigger`); resolves true on "Log out anyway", false on "Stay" / Escape.
 */
export function askLogout({ confirm, trigger, unsent, messages = {} }) {
    const text = { ...LOGOUT_MESSAGES, ...messages };
    return new Promise((resolve) => {
        confirm(trigger, {
            phrase: text.title,
            description: text.body(unsent),
            acceptLabel: text.accept,
            strings: { confirmCancel: text.stay },
            onAccept: () => resolve(true),
            onCancel: () => resolve(false),
        });
    });
}

/**
 * Intercept the logout form's submit on `doc`: with unsent edits (queued or
 * failed) the person confirms first, then the copy is purged and the form is
 * sent; without any it goes at once. Returns an unbind function.
 */
export function hookLogout({ win, doc, purge, unsent = () => 0, confirm = null, messages = {}, timeoutMs = 2000 }) {
    const proceed = async (form) => {
        await purgeBeforeLogout(purge, timeoutMs, (fn, ms) => win.setTimeout(fn, ms));
        form.dataset.chassisDataPurged = '1';
        form.submit();
    };
    const handler = (event) => {
        const form = event.target;
        if (!isLogoutAction(form?.action ?? '', win.location.href) || form.dataset?.chassisDataPurged) return;
        event.preventDefault();
        const trigger = event.submitter ?? form;
        Promise.resolve(unsent()).then(async (n) => {
            const ask = logoutNeedsConfirm(n) && confirm;
            if (ask && !(await askLogout({ confirm, trigger, unsent: n, messages }))) return;
            await proceed(form);
        }).catch((err) => {
            console.warn('chassisData: could not check for unsent changes at logout; logging out.', err);
            return proceed(form);
        });
    };
    doc.addEventListener('submit', handler, true);
    return () => doc.removeEventListener('submit', handler, true);
}
