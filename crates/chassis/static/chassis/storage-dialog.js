// The Storage page's modal dialog host: opening one (`ctx.dialog` is the one
// open dialog), giving its cards their package states, and drawing its inside
// again while it stays open. The clean-up and compact flows build on this.
import { cleanInner } from './storage-clean-html.js';
import { compactInner } from './storage-compact-html.js';
import { totals } from './storage-budget-html.js';

export function createDialogHost(ctx) {
  async function openModal(html, state, kind, extra) {
    ctx.dialog?.dlg.close();
    const host = document.createElement('div');
    host.setAttribute('data-storage-modal', '');
    host.innerHTML = html;
    document.body.append(host);
    const dlg = host.querySelector('dialog');
    // The page behind may be drawn again while the dialog is open; the key
    // goes back to the control that opened it, by its stable id.
    const opener = document.activeElement?.id || '';
    ctx.dialog = { host, dlg, kind, state };
    await hydrate(host);
    await ctx.attachParts(host);
    dlg.addEventListener('close', () => {
      host.remove();
      if (ctx.dialog?.host === host) ctx.dialog = null;
      if (opener && (!document.activeElement || document.activeElement === document.body)) document.getElementById(opener)?.focus();
    });
    dlg.addEventListener('cancel', (event) => {
      if (ctx.dialog?.kind === 'compact' && ctx.dialog.state.state === 'running') event.preventDefault();
    });
    dlg.showModal();
    return extra ? extra(dlg) : dlg;
  }

  // The package's states on the cards of a drawn dialog.
  async function hydrate(scope) {
    const set = ctx.setCardState;
    for (const el of scope.querySelectorAll('[data-storage-card="preview"]')) {
      const asked = el.dataset.storagePstate;
      if (asked === 'loading') set(el, 'loading', { words: 'Counting the rows…' });
      else if (asked === 'idle') set(el, 'empty', { title: 'Nothing to preview yet', text: 'Choose what to remove, then press Preview. Nothing is deleted by looking.' });
      else if (asked === 'empty') set(el, 'empty', { title: 'Nothing matches', text: 'No row fits these choices, so there is nothing to delete. Change the date or a choice and preview again.' });
      else if (asked === 'invalid') set(el, 'empty', { title: 'That is not a date', text: 'Type the day as dd/mm/yyyy, for example 30/06/2026, then press Preview.' });
      else if (asked === 'error') set(el, 'error', { title: 'The preview could not be made', text: ctx.dialog?.state.error || 'The service did not answer.', action: 'Try again' });
    }
    for (const el of scope.querySelectorAll('[data-storage-card="steps"]')) {
      const asked = el.dataset.storageSstate;
      if (asked === 'checking') set(el, 'loading', { words: 'Reading the file…' });
      else if (asked === 'failed') set(el, 'error', { title: 'Compacting did not finish', text: ctx.dialog?.state.error || 'The file could not be compacted. Nothing was changed.', action: 'Try again' });
      else if (asked === 'unreadable') set(el, 'error', { title: 'The file could not be read', text: ctx.dialog?.state.error || 'The service did not answer.', action: 'Try again' });
    }
  }

  // Draw the inside of the open dialog again, keeping it open and the focus where it was.
  async function redraw() {
    if (!ctx.dialog) return;
    const { dlg, kind, state } = ctx.dialog;
    const keep = document.activeElement && dlg.contains(document.activeElement) ? document.activeElement : null;
    const key = keep ? keep.id || keep.getAttribute('data-storage-filter') || '' : '';
    dlg.innerHTML = kind === 'clean' ? cleanInner(state, ctx.kindById(state.kind), ctx.narrow.matches) : compactInner(state, totals(ctx.data));
    // The states first, in the same frame as the markup, so a card never stands
    // for a moment in a state it has no plate for; then the parts attach.
    await hydrate(dlg);
    await ctx.attachParts(dlg);
    if (key) dlg.querySelector(`#${CSS.escape(key)}, [data-storage-filter="${CSS.escape(key)}"]`)?.focus();
  }

  return { openModal, hydrate, redraw };
}
