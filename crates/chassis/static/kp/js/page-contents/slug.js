// Pure: the id a heading's words make, and which section the reader is in.

/** The id a heading's words make: lower case, letters and digits joined by hyphens. @param {string} text */
export function contentsSlug(text) {
    const slug = text
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'section';
}

/**
 * Which entry is current: the first section (in page order) whose top has passed the offset line and whose bottom has not; with none,
 * the last one passed; and the last entry at the foot of the page. Pure.
 * @param {readonly { top: number, bottom: number }[]} boxes the sections' boxes, in page order, relative to the window
 * @param {number} offset the line, px from the top of the window
 * @param {boolean} atEnd the page is scrolled to its foot
 * @returns {number} the index, -1 for none
 */
export function currentSection(boxes, offset, atEnd) {
    if (!boxes.length) return -1;
    if (atEnd) return boxes.length - 1;
    let found = -1;
    boxes.forEach((box, i) => {
        if (box.top <= offset + 1) found = i;
    });
    return found;
}
