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

/** Intercept the logout form's submit on `doc`. Returns an unbind function. */
export function hookLogout({ win, doc, purge, timeoutMs = 2000 }) {
    const handler = (event) => {
        const form = event.target;
        if (!isLogoutAction(form?.action ?? '', win.location.href) || form.dataset?.chassisDataPurged) return;
        event.preventDefault();
        purgeBeforeLogout(purge, timeoutMs, (fn, ms) => win.setTimeout(fn, ms)).then(() => {
            form.dataset.chassisDataPurged = '1';
            form.submit();
        });
    };
    doc.addEventListener('submit', handler, true);
    return () => doc.removeEventListener('submit', handler, true);
}
