// The Storage page's clean-up flow for one kind: open, the read-only preview,
// and the one confirmed delete. The server counts again before it deletes.
import { api } from './json-api.js';
import { defaultForm, selectionOf } from './storage-clean-form.js';
import { cleanShell } from './storage-clean-html.js';

export function createCleanDialog(ctx) {
  // The read-only count the server answers: rows, bytes, oldest, newest, samples and the token a delete needs.
  async function runPreview(c) {
    const k = ctx.kindById(c.kind);
    const sel = selectionOf(k, c.form);
    c.p = null;
    c.asked = null;
    if (sel === null) {
      c.preview = 'invalid';
      return ctx.redraw();
    }
    c.preview = 'loading';
    await ctx.redraw();
    try {
      const p = await api(`/api/kit/storage/${encodeURIComponent(c.kind)}/preview`, sel);
      if (ctx.dialog?.state !== c) return;
      c.p = p;
      c.asked = sel;
      c.preview = 'ready';
    } catch (error) {
      if (ctx.dialog?.state !== c) return;
      c.preview = 'error';
      c.error = error.message;
    }
    await ctx.redraw();
  }

  async function openCleanup(kindId) {
    const k = ctx.kindById(kindId);
    if (!k) return;
    const c = { kind: k.id, step: 'choose', preview: 'loading', form: defaultForm(k), p: null, asked: null, done: null, error: '' };
    await ctx.openModal(cleanShell(c, k, ctx.narrow.matches), c, 'clean');
    await runPreview(c);
  }

  async function doDelete(button, c) {
    const typed = ctx.dialog.dlg.querySelector('[data-kp-type-confirm] input')?.value ?? '';
    let result = null;
    await ctx.runFlashButton(button, async () => {
      try {
        const body = await api(`/api/kit/storage/${encodeURIComponent(c.kind)}/delete`, { ...c.asked, token: c.p.token, confirm: typed });
        result = body;
        return undefined;
      } catch (error) {
        return { error: error.message.replace(/\.+$/, ''), word: 'Refused', remedy: error.body?.remedy };
      }
    });
    if (!result || ctx.dialog?.state !== c) return;
    c.done = { count: result.deleted.deleted, free: result.deleted.reclaimable_bytes };
    c.step = 'done';
    await ctx.load({ quiet: true });
    await ctx.redraw();
  }

  return { runPreview, openCleanup, doDelete };
}
