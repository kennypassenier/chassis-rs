// Focus and keyboard handling.
import { sequencerApplyKey, sequencerKey } from './links.js';
import { cancelEdit, finishLink, navigate, startLink, stopLink, unlink } from './drag.js';
import { commit, drawDraft, refuse, select } from './edit.js';
import { announce, planOptions, summary } from './instance.js';
/** @typedef {import('./instance.js').SequencerModel} SequencerModel */

/** @param {SequencerModel} c @param {string} id */
export function focusItem(c, id) {
    c.focusId = id;
    for (const [key, bar] of c.bars) bar.tabIndex = key === id ? 0 : -1;
    c.bars.get(id)?.focus();
}
/** @param {SequencerModel} c @param {KeyboardEvent} e */
export function onKey(c, e) {
    const target = /** @type {HTMLElement} */ (e.target);
    const bar = target.closest?.('.kp-sequencer__item');
    if (!(bar instanceof HTMLElement)) return;
    const id = bar.dataset.kpId ?? '';
    const item = c.items.find((i) => i.id === id);
    if (!item) return;
    if (c.kb && c.kb.id === id) {
        const action = sequencerKey(e, { step: c.step, rtl: getComputedStyle(c.el).direction === 'rtl' });
        if (!action) return;
        e.preventDefault();
        if (action.kind === 'cancel') {
            cancelEdit(c, 'key');
            return;
        }
        if (action.kind === 'drop') {
            bar.removeAttribute('data-kp-grabbed');
            commit(c, c.view, 'keyboard');
            announce(c, c.strings.sequencerDropped(summary(c, c.items.find((i) => i.id === id) ?? item)));
            return;
        }
        const plan = sequencerApplyKey(c.view, id, action, planOptions(c));
        if (!plan.ok) {
            refuse(c, id, plan);
            return;
        }
        if (!plan.changed.length) return;
        drawDraft(c, plan.items, plan.changed, true);
        const now = plan.items.find((i) => i.id === id) ?? item;
        announce(c, plan.pushed.length ? `${summary(c, now)}. ${c.strings.sequencerPushed(plan.pushed.length)}` : summary(c, now));
        return;
    }
    if (c.linking) {
        if (e.key === 'Escape') {
            e.preventDefault();
            stopLink(c);
            return;
        }
        if ((e.key === 'Enter' || e.key === ' ') && id !== c.linking) {
            e.preventDefault();
            finishLink(c, id);
            return;
        }
    }
    if (navigate(c, id, e)) {
        e.preventDefault();
        return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(c, id);
        if (!c.editable) return;
        c.kb = { id, before: c.items };
        bar.setAttribute('data-kp-grabbed', '');
        c.el.setAttribute('data-kp-editing', 'keyboard');
        announce(c, c.strings.sequencerGrabbed(item.label));
        return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        select(c, id);
        startLink(c, id);
    } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        unlink(c, id);
    } else if (e.key === 'Escape' && c.selected) select(c, null);
}
