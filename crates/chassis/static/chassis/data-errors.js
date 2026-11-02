// Error helpers shared by the offline client's modules (feat-offline-3).

/** An Error whose message says where it came from. */
export const fail = (message, extra = {}) => Object.assign(new Error(`chassisData: ${message}`), extra);

/** What a failed answer becomes for the caller (the kit's `{error, remedy}` sentence). */
export function refusal(outcome) {
    const b = outcome.body;
    const text = b?.error ? `${b.error}.${b.remedy ? ` ${b.remedy}` : ''}` : `The service answered ${outcome.status}.`;
    return fail(text, { status: outcome.status, body: b ?? null });
}
