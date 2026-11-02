// The failed-edits drawer's behaviour (feat-offline-failed-view-1): builds the
// dialog once, redraws it from the client's queue whenever it changes while
// open, and routes the buttons to drop() / resave(). Markup pieces live in
// data-failed.js.

import { wordsOf } from './data-errors.js';
import { FAILED_MESSAGES, renderEmpty, renderEntry, reviewable } from './data-failed.js';

function shell(doc, text, id) {
    const dialog = doc.createElement('dialog');
    dialog.className = 'kp-drawer kp-dialog chassis-failed';
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    dialog.innerHTML = `<header class="kp-drawer__head"><h2 class="kp-dialog__title" id="${id}-title"></h2>`
        + '<button type="button" class="kp-icon-button kp-dialog__close" data-chassis-failed-act="close">×</button>'
        + '<p class="kp-drawer__desc"></p></header><div class="kp-drawer__body"></div>'
        + '<footer class="kp-drawer__foot"></footer>';
    dialog.querySelector('.kp-dialog__title').textContent = text.title;
    dialog.querySelector('.kp-dialog__close').setAttribute('aria-label', text.close);
    dialog.querySelector('.kp-drawer__desc').textContent = text.intro;
    return dialog;
}

/**
 * `kp` supplies openDialog and openConfirmation; `data` is the client
 * (queue(), drop(), resave()). Returns { open, refresh, destroy }.
 */
export function createFailedView({ win, doc, kp, data, messages = {} }) {
    // Read each time the drawer draws, so it follows the page language (fix-habits-data-7).
    const wording = () => ({ ...FAILED_MESSAGES, ...wordsOf(messages) });
    let listening = false;
    let dialog = null;
    const body = () => dialog.querySelector('.kp-drawer__body');

    async function refresh() {
        if (!dialog) return;
        const text = wording();
        const items = reviewable(await data.queue());
        const list = doc.createElement('ul');
        list.className = 'chassis-failed__list';
        list.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr);gap:var(--kp-space-3);margin:0;padding:0;list-style:none';
        list.append(...items.map((e) => renderEntry(doc, e, text)));
        body().replaceChildren(items.length ? list : renderEmpty(doc, text));
        const foot = dialog.querySelector('.kp-drawer__foot');
        foot.hidden = items.length === 0;
        const all = doc.createElement('button');
        all.type = 'button';
        all.className = 'kp-button kp-button--destructive';
        all.dataset.chassisFailedAct = 'discard-all';
        all.textContent = `${text.discardAll} (${items.length})`;
        foot.replaceChildren(all);
    }

    const confirmAll = (trigger, n) => new Promise((resolve) => {
        const text = wording();
        if (!kp.openConfirmation) return resolve(true);
        kp.openConfirmation(trigger, {
            phrase: text.confirmTitle(n), description: text.confirmBody, acceptLabel: text.confirmAccept,
            strings: { confirmCancel: text.confirmCancel }, onAccept: () => resolve(true), onCancel: () => resolve(false),
        });
    });

    async function act(target) {
        const id = Number(target.dataset.chassisFailedId);
        const kind = target.dataset.chassisFailedAct;
        if (kind === 'close') return dialog.close();
        if (kind === 'discard') await data.drop(id);
        else if (kind === 'save') await data.resave(id);
        else if (kind === 'discard-all') {
            const items = reviewable(await data.queue());
            if (items.length && await confirmAll(target, items.length)) for (const e of items) await data.drop(e.id);
        }
        await refresh();
    }

    const onClick = (event) => {
        const target = event.target.closest?.('[data-chassis-failed-act]');
        if (target && dialog.contains(target)) {
            act(target).catch((err) => console.warn('chassisData: the failed-edits view could not complete that action.', err));
        }
    };
    const onQueue = () => dialog?.open && refresh().catch((err) => console.warn('chassisData: the failed-edits view could not refresh.', err));

    return {
        async open(trigger = null) {
            if (dialog && !dialog.open) { // rebuilt while shut, so its title and intro take the current words
                dialog.remove();
                dialog = null;
            }
            if (!dialog) {
                dialog = shell(doc, wording(), 'chassis-failed');
                dialog.addEventListener('click', onClick);
                doc.body.append(dialog);
                if (!listening) win.addEventListener('chassis-data-queue', onQueue);
                listening = true;
            }
            await refresh();
            if (!dialog.open) kp.openDialog(dialog, { trigger, modal: true });
        },
        refresh,
        destroy() {
            win.removeEventListener('chassis-data-queue', onQueue);
            listening = false;
            dialog?.remove();
            dialog = null;
        },
    };
}
