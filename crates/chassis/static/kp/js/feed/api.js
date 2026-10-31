// The calls a page makes on a feed: attach the feeds, get a feed's handle and give a feed its model.

import { attachAgo } from '../freshness.js';
import { attachAll, controllerOf } from '../controller.js';
import { FEED, FEED_TIME_ZONE } from './constants.js';
import { FeedController } from './controller.js';

/** The handle of an attached feed. @param {Element} element @returns {import('./constants.js').FeedHandle | null} */
export const feedOf = (element) => controllerOf(/** @type {HTMLElement} */ (element), FeedController)?.handle ?? null;

/**
 * Give a feed its rows, or its state.
 * @param {Element} element @param {import('./constants.js').FeedModel} model
 */
export function setFeed(element, model) {
    feedOf(element)?.set(model);
}

/**
 * Wire every feed under `root`.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number, timeZone?: string }} [options] `now` so a test never reads the real clock
 * @returns {() => void} detach
 */
export function attachFeeds(root = document, { now = () => Date.now(), timeZone = FEED_TIME_ZONE } = {}) {
    const detach = attachAll(root, FEED, FeedController, { now, timeZone });
    const ago = attachAgo(root, { now, timeZone });
    return () => {
        detach();
        ago();
    };
}
