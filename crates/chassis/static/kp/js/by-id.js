// The one way to look an element up by id [byid-1103].
//
// `document.getElementById('')` is a call Firefox logs ("Empty string passed to getElementById()") and
// it can only return null. An id read from an attribute, a dataset or a split list is empty when the
// attribute is missing or blank, so every lookup in the package goes through this helper, which asks
// nothing of the document for an id that cannot name anything. gates/check-get-element-by-id.mjs
// refuses a raw getElementById call anywhere else under js/, components/ and hooks/.

/**
 * @param {Document} doc
 * @param {string | null | undefined} id
 * @returns {HTMLElement | null} The element with that id, or null for a missing, empty or whitespace id.
 */
export const byId = (doc, id) => (typeof id === 'string' && id.trim() !== '' ? doc.getElementById(id) : null);
