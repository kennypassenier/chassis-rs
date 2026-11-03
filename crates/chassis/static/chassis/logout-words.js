// The app's logout words, kept for the kit's own pages (fix-logout-words-1).
// The logout dialog on Status, Clients or Storage has no `configure()`, so it
// knew only the kit's English defaults while the app spoke Dutch. A web-app
// page now stores the words its app gave (rendered, since a function cannot
// be stored), and a kit page of the same origin asks with those.

import { titled } from './data-errors.js';
import { LOGOUT_MESSAGES } from './data-logout.js';

export const LOGOUT_WORDS_KEY = 'chassis-data:logout-words';
const SAMPLE = 7919113; // a count no sentence carries by itself: marks where n goes

/** Store the resolved logout words of `given` (the app's messages, already read). */
export function rememberLogoutWords(storage, given) {
    if (!storage || !given || typeof given !== 'object') return;
    const text = { ...LOGOUT_MESSAGES, ...given, logoutTitle: titled(given, 'logoutTitle', LOGOUT_MESSAGES.logoutTitle) };
    const many = String(text.body(SAMPLE));
    const words = {
        logoutTitle: String(text.logoutTitle),
        accept: String(text.accept),
        stay: String(text.stay),
        one: String(text.body(1)),
        many: many.includes(String(SAMPLE)) ? many.split(String(SAMPLE)).join('{n}') : null,
    };
    try {
        storage.setItem(LOGOUT_WORDS_KEY, JSON.stringify(words));
    } catch (err) {
        console.warn('chassisData: the logout words could not be kept for the kit pages.', err);
    }
}

/** The stored words as logout messages, or {} (the kit's defaults) when none or unreadable. */
export function storedLogoutWords(storage) {
    let words = null;
    try {
        words = JSON.parse(storage?.getItem(LOGOUT_WORDS_KEY) ?? 'null');
    } catch {
        return {};
    }
    if (!words || typeof words !== 'object') return {};
    const { logoutTitle, accept, stay, one, many } = words;
    const body = (n) => (n === 1 || !many ? one : many.split('{n}').join(String(n)));
    return typeof one === 'string' ? { logoutTitle, accept, stay, body } : {};
}
