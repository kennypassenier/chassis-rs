// Builds one feed row: the state mark, the title (a plain line, a link or a disclosure button), its detail, its opening lines, who and when.

import { agoMoment, setAgo } from '../freshness.js';
import { setIdmark } from '../idmark.js';
import { getStrings } from '../strings.js';
import { FEED_RELATIVE_MS, MOMENT_CLOCK_AT } from './constants.js';
import { make } from './dom.js';
import { feedOptions } from './options.js';
import { nextFeedNumber } from './state.js';
import { stateWord } from './words.js';

/**
 * The time cell of a row: the ticking ago line for the first 24 hours, then the moment.
 * @param {import('./controller.js').FeedController} c
 * @param {import('./constants.js').FeedRow} row @param {boolean} grouped
 */
function whenCell(c, row, grouped) {
    const doc = c.host.ownerDocument;
    const mode = feedOptions(c.host).time;
    const age = c.now() - row.at;
    const relative = mode === 'relative' || (mode !== 'moment' && age < FEED_RELATIVE_MS);
    const iso = new Date(row.at).toISOString();
    if (relative) {
        const when = make(doc, 'time', 'kp-ago kp-feed__when');
        when.setAttribute('data-kp-ago-bare', '');
        setAgo(when, row.at);
        when.setAttribute('datetime', iso);
        if (mode !== 'relative') c.nextFlip = Math.min(c.nextFlip, row.at + FEED_RELATIVE_MS);
        return when;
    }
    const moment = agoMoment(row.at, c.zone);
    const when = make(doc, 'time', 'kp-feed__when', mode === 'clock' && grouped ? moment.slice(MOMENT_CLOCK_AT) : moment);
    when.setAttribute('datetime', iso);
    when.title = moment;
    return when;
}

/** The title: a disclosure button when there are lines to open, a link when there is an href, else plain. @param {Document} doc @param {import('./constants.js').FeedRow} row @param {boolean} openable @param {boolean} isOpen @param {string} regionId */
function titleOf(doc, row, openable, isOpen, regionId) {
    if (openable) {
        const toggle = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-feed__toggle'));
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', String(isOpen));
        toggle.setAttribute('aria-controls', regionId);
        toggle.append(make(doc, 'span', 'kp-feed__title-text', row.title), make(doc, 'span', 'kp-feed__chevron'));
        return toggle;
    }
    if (row.href) {
        const link = /** @type {HTMLAnchorElement} */ (make(doc, 'a', 'kp-feed__link'));
        link.href = row.href;
        link.append(make(doc, 'span', 'kp-feed__title-text', row.title));
        return link;
    }
    return make(doc, 'span', 'kp-feed__title-text', row.title);
}

/** The lines that open under the row, and the "Open" link when the row has an href. @param {Document} doc @param {import('./constants.js').FeedRow} row @param {string} regionId @param {boolean} isOpen */
function moreRegion(doc, row, regionId, isOpen) {
    const t = getStrings();
    const region = make(doc, 'div', 'kp-feed__more');
    region.id = regionId;
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', t.feedMoreLabel(row.title));
    region.hidden = !isOpen;
    for (const line of row.more ?? []) region.append(make(doc, 'div', 'kp-feed__line', line));
    if (row.href) {
        const out = /** @type {HTMLAnchorElement} */ (make(doc, 'a', 'kp-feed__open', t.feedOpen));
        out.href = row.href;
        region.append(out);
    }
    return region;
}

/** The text column: the title and its state word, the detail and the opening lines. @param {import('./controller.js').FeedController} c @param {import('./constants.js').FeedRow} row @param {HTMLElement} li */
function textColumn(c, row, li) {
    const doc = c.host.ownerDocument;
    const text = make(doc, 'div', 'kp-feed__text');
    const openable = feedOptions(c.host).expand !== 'off' && !!row.more?.length;
    const isOpen = c.open.has(row.key);
    const regionId = `${c.id}-more-${nextFeedNumber()}`;
    const head = make(doc, 'div', 'kp-feed__title');
    head.append(titleOf(doc, row, openable, isOpen, regionId));
    const word = stateWord(row.state);
    if (word) head.append(make(doc, 'span', 'kp-sr-only', `, ${word}`));
    text.append(head);
    if (row.detail) text.append(make(doc, 'div', 'kp-feed__detail', row.detail));
    if (openable) {
        text.append(moreRegion(doc, row, regionId, isOpen));
        li.toggleAttribute('data-kp-open', isOpen);
    }
    return text;
}

/** The chip that names who started the row: round for a person or an agent, the name beside the mark or only as its title. @param {Document} doc @param {import('./constants.js').FeedActor} who @param {number | undefined} slot @param {string} mode */
function actorChip(doc, who, slot, mode) {
    const t = getStrings();
    const actor = make(doc, 'span', 'kp-feed__actor');
    const chip = make(doc, 'span', 'kp-idmark-name kp-idmark-name--wrap');
    const mark = make(doc, 'span', `kp-idmark kp-idmark--xs${['person', 'agent'].includes(who.kind ?? '') ? ' kp-idmark--round' : ''}`);
    setIdmark(mark, who.name, { slot, title: mode === 'mark' });
    if (mode === 'mark') chip.append(mark, make(doc, 'span', 'kp-sr-only', who.name));
    else chip.append(mark, make(doc, 'span', 'kp-feed__actor-name', who.name));
    actor.append(make(doc, 'span', 'kp-sr-only', `${t.feedBy} `), chip);
    return actor;
}

/**
 * One row of the feed.
 * @param {import('./controller.js').FeedController} c
 * @param {import('./constants.js').FeedRow} row @param {Map<string, number>} slots the colour slot of each actor @param {boolean} grouped
 */
export function rowItem(c, row, slots, grouped) {
    const doc = c.host.ownerDocument;
    const li = make(doc, 'li', 'kp-feed__row');
    li.setAttribute('data-kp-key', row.key);
    if (row.state) li.setAttribute('data-state', row.state);
    const mark = make(doc, 'span', 'kp-feed__mark');
    mark.setAttribute('aria-hidden', 'true');
    if (row.state === 'running') mark.append(make(doc, 'span', 'kp-spinner'));
    const cell = make(doc, 'span', 'kp-feed__mark-cell');
    cell.append(mark);
    const text = textColumn(c, row, li);
    const meta = make(doc, 'div', 'kp-feed__meta');
    const actorMode = feedOptions(c.host).actor;
    if (row.actor && actorMode !== 'off') meta.append(actorChip(doc, row.actor, slots.get(row.actor.name), actorMode));
    else if (actorMode !== 'off') meta.append(make(doc, 'span', 'kp-feed__actor'));
    meta.append(whenCell(c, row, grouped));
    li.append(cell, text, meta);
    return li;
}
