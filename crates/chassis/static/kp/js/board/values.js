// The selectors, events and sizes of the board, and the element maker its parts share.

/** A board: `section.kp-board[data-kp-board]`. */
export const BOARD = '[data-kp-board]';
/** A lane of a board, a direct child the page gives: `[data-kp-board-lane="<key>"]`. */
export const LANE = '[data-kp-board-lane]';
/** Fired on the board, bubbling, when Try again is pressed on its failed plate. */
export const BOARD_RETRY_EVENT = 'kp-board-retry';
/** Fired on the board, bubbling, when a narrow board's switcher shows another lane: `{ lane, source }`. */
export const BOARD_LANE_EVENT = 'kp-board-lane';
/** What a "Move to" entry of a card's menu reports as its value, before the lane's key [uxtouch1101]. */
export const MOVE_PREFIX = 'kp-board-move:';
/** Under this many rem of its own width a board is narrow: one lane under a switcher (default), or the lanes scroll sideways. */
export const NARROW_REM = 40;
/** The root font size when the document gives none it can read [px]. */
export const FALLBACK_REM_PX = 16;

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc @param {K} tag @param {string} [className] @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
export const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
};

/** The items of a lane's list: its children that carry `data-kp-item`. @param {HTMLElement} list */
export const itemsOf = (list) => [...list.children].filter((child) => child instanceof HTMLElement && child.dataset.kpItem !== undefined);

/** A lane's limit: `data-kp-board-limit`, 0 when it has none. @param {HTMLElement} lane */
export const limitOf = (lane) => Math.max(0, Number.parseInt(lane.dataset.kpBoardLimit ?? '', 10) || 0);
