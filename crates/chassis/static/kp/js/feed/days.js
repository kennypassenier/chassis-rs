// Groups the rows by Brussels day and builds the day groups: a heading with its count and failures, and the day's rows.

import { agoMoment } from '../freshness.js';
import { idmarkColours } from '../idmark.js';
import { getStrings } from '../strings.js';
import { MOMENT_DATE_LENGTH } from './constants.js';
import { make } from './dom.js';
import { dayKey, feedOptions, optionAttr } from './options.js';
import { rowItem } from './row.js';
import { counted, dayWord } from './words.js';

/**
 * The rows in runs of one day (or one run, ungrouped), newest first as given.
 * @param {import('./constants.js').FeedRow[]} rows @param {boolean} grouped @param {string} zone
 */
export function groupByDay(rows, grouped, zone) {
    /** @type {{ key: string, at: number, rows: import('./constants.js').FeedRow[] }[]} */
    const days = [];
    for (const row of rows) {
        const key = grouped ? dayKey(row.at, zone) : 'all';
        const last = days[days.length - 1];
        if (last && last.key === key) last.rows.push(row);
        else days.push({ key, at: row.at, rows: [row] });
    }
    return days;
}

/** A day's heading: the word, the date, a rule and, unless switched off, the count and the failures. @param {import('./controller.js').FeedController} c @param {{ key: string, at: number, rows: import('./constants.js').FeedRow[] }} day */
function dayHeading(c, day) {
    const doc = c.host.ownerDocument;
    const t = getStrings();
    const options = feedOptions(c.host);
    const heading = make(doc, 'div', 'kp-feed__day');
    heading.setAttribute('role', 'heading');
    heading.setAttribute('aria-level', String(options.level));
    const failed = day.rows.filter((row) => row.state === 'failed').length;
    const word = make(doc, 'span', 'kp-feed__day-word', dayWord(c, day.at, day.key));
    const date = make(doc, 'time', 'kp-feed__day-date', agoMoment(day.at, c.zone).slice(0, MOMENT_DATE_LENGTH));
    date.setAttribute('datetime', new Date(day.at).toISOString());
    heading.append(word, date, make(doc, 'span', 'kp-feed__day-rule'));
    if (optionAttr(c.host, 'summary') !== 'off') {
        const summary = `${counted(day.rows.length, options.unit)} · ${failed ? t.feedFailed(failed) : t.feedAllOk}`;
        heading.append(make(doc, 'span', 'kp-feed__day-summary', summary));
    }
    return heading;
}

/**
 * The day groups of the list, one `li` per day.
 * @param {import('./controller.js').FeedController} c
 * @param {import('./constants.js').FeedRow[]} rows
 * @param {boolean} grouped
 */
export function dayGroups(c, rows, grouped) {
    const doc = c.host.ownerDocument;
    const slots = idmarkColours(rows.flatMap((row) => (row.actor ? [row.actor.name] : [])));
    return groupByDay(rows, grouped, c.zone).map((day) => {
        const li = make(doc, 'li', 'kp-feed__group');
        if (grouped) li.append(dayHeading(c, day));
        const rowList = make(doc, 'ol', 'kp-feed__rows');
        for (const row of day.rows) rowList.append(rowItem(c, row, slots, grouped));
        li.append(rowList);
        return li;
    });
}
