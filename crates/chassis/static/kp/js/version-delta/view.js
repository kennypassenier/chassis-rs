// What a version chip shows: its tone and marks, the loading, failed and empty words, and the versions with their arrow, level word and spoken form.

import { getStrings } from '../strings.js';
import { VERSION_SORT } from './values.js';
import { ChipCore, shown, toneMap } from './core.js';

/** @typedef {import('./core.js').ChipSettings} ChipSettings */

export class ChipView extends ChipCore {
    /** The tone class, the level and the sort value; the busy mark and the title are cleared. @param {ChipSettings} v */
    markChip(v) {
        const el = this.host;
        el.classList.add('kp-badge', 'kp-badge--version');
        for (const name of ['kp-badge--warning', 'kp-badge--destructive', 'kp-badge--info', 'kp-badge--success']) el.classList.remove(name);
        /** @type {Record<string, string>} */
        const tones = { major: 'warning', downgrade: 'destructive', ...toneMap(el.getAttribute('data-kp-version-tones') ?? undefined) };
        const tone = tones[v.level];
        if (tone && tone !== 'none') el.classList.add(`kp-badge--${tone}`);
        el.setAttribute('data-kp-level', v.state ? 'none' : v.level);
        el.setAttribute('data-kp-sort-value', String(VERSION_SORT[v.level]));
        el.removeAttribute('aria-busy');
        el.removeAttribute('title');
    }

    /**
     * Loading, failed and empty replace the versions.
     * @param {ChipSettings} v
     * @returns {boolean} whether one was drawn
     */
    drawState(v) {
        const el = this.host;
        const s = getStrings();
        if (v.state === 'loading') {
            el.setAttribute('aria-busy', 'true');
            const bone = this.part('kp-skeleton kp-version__bone');
            bone.setAttribute('role', 'img');
            bone.setAttribute('aria-label', s.versionLoading);
            el.replaceChildren(bone);
            return true;
        }
        if (v.state === 'error') {
            const why = el.getAttribute('data-kp-version-error');
            if (why) el.title = why;
            el.setAttribute('data-kp-level', 'none');
            el.replaceChildren(this.part('kp-version__word', 'span'));
            /** @type {HTMLElement} */ (el.firstElementChild).textContent = s.versionFailed;
            return true;
        }
        if (v.state === 'empty' || (!v.from && !v.to)) {
            el.setAttribute('data-kp-level', 'none');
            const word = this.part('kp-version__word');
            word.textContent = s.versionNone;
            el.replaceChildren(word);
            return true;
        }
        return false;
    }

    /** The new version, a link when it has notes. @param {ChipSettings} v */
    toNode(v) {
        const s = getStrings();
        const url = this.host.getAttribute('data-kp-version-href') ?? this.defaults.href ?? null;
        const href = url ? url.replace('{to}', encodeURIComponent(v.to)) : null;
        const node = href ? this.part('kp-version__to', 'a') : this.part('kp-version__to');
        node.append(this.breakable(shown(v.to, v.digest)));
        if (href && node instanceof HTMLAnchorElement) {
            node.href = href;
            node.target = '_blank';
            node.rel = 'noopener noreferrer';
            const note = this.part('kp-sr-only');
            note.textContent = ` (${s.versionNotes})`;
            node.append(note);
        }
        return node;
    }

    /** The level word, with a bang for a major jump. @param {ChipSettings} v */
    levelNode(v) {
        const word = this.part('kp-version__level');
        word.textContent = this.levelWord(v.level);
        if (v.level === 'major') word.prepend(Object.assign(this.part('kp-version__bang'), { textContent: '!' }));
        return word;
    }

    /** What stands in the chip: the versions, the arrow, the level. @param {ChipSettings} v @param {HTMLElement} toNode @returns {Node[]} */
    children(v, toNode) {
        const s = getStrings();
        const { from, level, show } = v;
        if (level === 'same' && from) {
            const word = this.part('kp-version__word');
            word.textContent = s.versionSame;
            return [toNode, word];
        }
        if (show === 'level' && !['unknown', 'other'].includes(level)) return [this.levelNode(v)];
        if (show === 'to' || !from) return [toNode];
        const fromNode = this.part('kp-version__from');
        fromNode.append(this.breakable(shown(from, v.digest)));
        const arrowNode = this.part('kp-version__arrow');
        arrowNode.setAttribute('aria-hidden', 'true');
        arrowNode.textContent = v.arrow;
        /** @type {Node[]} */
        const children = [fromNode, arrowNode, toNode];
        if (['major', 'downgrade'].includes(level)) children.push(this.levelNode(v));
        // A version without numbers is neither big nor small: the raw strings, quietly.
        else if (level === 'unknown' || level === 'other') fromNode.setAttribute('data-kp-raw', '');
        return children;
    }

    /** What a screen reader hears, in words and not in glyphs. @param {ChipSettings} v */
    spoken(v) {
        const s = getStrings();
        const { from, to, level } = v;
        const node = this.part('kp-sr-only');
        node.textContent =
            level === 'same'
                ? `, ${s.versionSpokenSame(to)}`
                : !from
                  ? `, ${s.versionSpokenTo(to)}`
                  : level === 'downgrade'
                    ? `, ${s.versionSpokenDown(from, to)}`
                    : level === 'other' || level === 'unknown'
                      ? `, ${s.versionSpokenChanged(from, to)}`
                      : `, ${s.versionSpoken(from, to, this.levelWord(level))}`;
        return node;
    }
}
