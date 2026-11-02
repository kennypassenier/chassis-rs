// The thread's list: a divider per day (when asked), then each run of messages.
import { messageItem } from './message.js';
import { dayKey, dayLabel, groupMessages, make } from './options.js';

/**
 * The list: a divider per day (when asked), then each run of messages.
 * @param {HTMLElement} host
 * @param {{ spec: import('../thread.js').ThreadSpec, expanded: Set<string> }} state
 * @param {ReturnType<typeof import('./options.js').threadOptions>} options @param {string} locale
 */
export function threadList(host, { spec, expanded }, options, locale) {
    const doc = host.ownerDocument;
    const sorted = [...(spec.messages ?? [])].sort((a, b) => a.at - b.at);
    const newestKey = [...sorted].reverse().find((m) => m.dir !== 'system')?.key;
    const groups = groupMessages(sorted, options.group);
    if (options.order === 'newest') groups.reverse();
    const list = make(doc, 'kp-thread__list', 'ol');
    let previousDay = '';
    for (const group of groups) {
        const day = dayKey(group[0].at);
        if (options.days && day !== previousDay) {
            const divider = make(doc, 'kp-thread__day', 'li');
            divider.setAttribute('role', 'separator');
            const text = make(doc, 'kp-thread__day-text', 'time');
            text.setAttribute('datetime', new Date(group[0].at).toISOString());
            text.textContent = dayLabel(group[0].at, locale);
            divider.append(text);
            list.append(divider);
        }
        previousDay = day;
        const members = options.order === 'newest' ? [...group].reverse() : group;
        members.forEach((message, index) => list.append(messageItem(doc, message, { options, first: index === 0, newestKey, expanded, locale, spec })));
    }
    return list;
}
