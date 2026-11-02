// The logout guard, for every page that has a logout control (fix-offline-logout-1).
// It does not need `chassisData.configure()`: it looks at the queue of every
// `chassis-data:*` database of the origin, so the kit's own pages (Status,
// Clients, Storage, the header's logout) warn about unsent edits too. With
// nothing unsent the logout stays immediate. Installed once per page, by
// boot-kit.js on kit pages and by data.js on app pages.

import { hookLogout } from './data-logout.js';
import { countStoredQueues, deleteStoredCopies } from './data-stored.js';

/**
 * `confirm` is kp-themes' openConfirmation. `client` (optional) answers
 * { unsent(), purge() } once the app configured chassisData; its count is
 * added to the stored one only when larger (a memory-only queue is not in
 * IndexedDB).
 */
export function installLogoutGuard({ win, doc, confirm, client = () => null, messages = {}, warn = console.warn }) {
    if (win.chassisLogoutGuard) return win.chassisLogoutGuard;
    const unsent = async () => {
        const stored = await countStoredQueues(win.indexedDB, warn);
        const open = await client();
        return Math.max(stored, open ? await open.unsent() : 0);
    };
    const purge = async () => {
        const open = await client();
        if (open) await open.purge();
        await deleteStoredCopies(win.indexedDB);
    };
    const off = hookLogout({ win, doc, purge, unsent, confirm, messages });
    win.chassisLogoutGuard = { unsent, off };
    return win.chassisLogoutGuard;
}
