// The Storage page's dialog triggers: the click delegation that opens the
// two dialogs and drives their buttons, and the change delegation that makes
// a clean-up preview stale when any choice moves.
import { defaultForm, readForm } from './storage-clean-form.js';

export function wireDialogClicks(ctx) {
  async function cleanClick(d, t) {
    const c = d.state;
    if (t.closest('[data-storage-reset]')) {
      c.form = defaultForm(ctx.kindById(c.kind));
      c.preview = 'idle';
      c.p = null;
      await ctx.redraw();
    } else if (t.closest('[data-storage-preview]')) {
      readForm(d.dlg, c, ctx.kindById(c.kind));
      await ctx.runPreview(c);
    } else if (t.closest('[data-storage-continue]')) {
      c.step = 'confirm';
      await ctx.redraw();
      d.dlg.querySelector('[data-kp-type-confirm] input')?.focus();
    } else if (t.closest('[data-storage-back]')) {
      c.step = 'choose';
      await ctx.redraw();
    } else if (t.closest('[data-storage-delete]')) {
      await ctx.doDelete(t.closest('[data-storage-delete]'), c);
    }
  }

  document.addEventListener('click', async (event) => {
    const t = event.target instanceof Element ? event.target : null;
    if (!t) return;
    const cleanup = t.closest('[data-storage-cleanup]');
    if (cleanup && ctx.root.contains(cleanup)) {
      event.preventDefault();
      await ctx.openCleanup(cleanup.getAttribute('data-storage-cleanup'));
      return;
    }
    if (t.closest('[data-storage-compact]') && !t.closest('[disabled]')) {
      event.preventDefault();
      await ctx.openCompact();
      return;
    }
    const d = ctx.dialog && ctx.dialog.dlg.contains(t) ? ctx.dialog : null;
    if (!d) return;
    if (d.kind === 'clean') await cleanClick(d, t);
    else if (d.kind === 'compact' && t.closest('[data-storage-run]')) await ctx.runCompact(t.closest('[data-storage-run]'), d.state);
  });
}

// A change of any choice in the clean-up dialog makes the old preview stale: it is asked for again.
export function wireStaleness(ctx) {
  for (const type of ['change', 'kp-segmented-change', 'kp-date-change']) {
    document.addEventListener(type, async (event) => {
      const el = event.target instanceof Element ? event.target : null;
      const d = ctx.dialog;
      if (!d || d.kind !== 'clean' || !el || !d.dlg.contains(el)) return;
      if (!el.closest('[data-storage-filter], [data-storage-older], .kp-datepicker')) return;
      const c = d.state;
      readForm(d.dlg, c, ctx.kindById(c.kind));
      if (c.preview !== 'idle' && c.step === 'choose') {
        c.preview = 'idle';
        c.p = null;
        await ctx.redraw();
      }
    });
  }
}
