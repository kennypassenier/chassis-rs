// Error helpers shared by the offline client's modules (feat-offline-3).

/** An Error whose message says where it came from. */
export const fail = (message, extra = {}) => Object.assign(new Error(`chassisData: ${message}`), extra);

/** What a failed answer becomes for the caller (the kit's `{error, remedy}` sentence). */
export function refusal(outcome) {
    const b = outcome.body;
    const text = b?.error ? `${b.error}.${b.remedy ? ` ${b.remedy}` : ''}` : `The service answered ${outcome.status}.`;
    return fail(text, { status: outcome.status, body: b ?? null });
}

/**
 * The app's `messages` option: an object, or a function returning one that is
 * called each time words are needed, so they follow the page language
 * (fix-habits-data-7).
 */
export const wordsOf = (messages) => (typeof messages === 'function' ? messages() : messages) ?? {};

/** A heading by its own key, else the shared `title` (kept for compatibility), else the kit's default. */
export const titled = (given, key, fallback) => given[key] ?? given.title ?? fallback;
