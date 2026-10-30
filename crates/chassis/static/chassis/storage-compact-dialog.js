// The Storage page's compact flow (VACUUM of the application file): open,
// ask the service what a compact would do, run it. On demand only.
import { api } from './json-api.js';
import { totals } from './storage-budget-html.js';
import { compactShell } from './storage-compact-html.js';

export function createCompactDialog(ctx) {
  // What a compact would do, asked of the service at the moment the dialog opens.
  async function checkCompact(c) {
    c.state = 'checking';
    c.error = '';
    await ctx.redraw();
    try {
      const p = await api('/api/kit/storage/compact/preview', {});
      if (ctx.dialog?.state !== c) return;
      c.free = p.reclaimable_bytes;
      c.state = p.paused ? 'paused' : p.reclaimable_bytes > 0 || totals(ctx.data).wal > 0 ? 'ready' : 'none';
    } catch (error) {
      if (ctx.dialog?.state !== c) return;
      c.state = 'unreadable';
      c.error = error.message;
    }
    await ctx.redraw();
  }

  async function openCompact() {
    const c = { state: 'checking', free: 0, freed: 0, error: '' };
    await ctx.openModal(compactShell(c, totals(ctx.data)), c, 'compact');
    await checkCompact(c);
  }

  async function runCompact(button, c) {
    const before = totals(ctx.data);
    const gain = c.free + before.wal;
    let ok = false;
    c.state = 'running';
    const list = ctx.dialog.dlg.querySelector('.kp-steplist');
    for (const [id, state] of [['pause', 'done'], ['rewrite', 'running']]) list?.querySelector(`[data-kp-step-id="${id}"]`)?.setAttribute('data-state', state);
    ctx.dialog.dlg.querySelector('#storage-compact-cancel')?.setAttribute('disabled', '');
    await ctx.runFlashButton(button, async () => {
      try {
        await api('/api/kit/storage/compact', {});
        ok = true;
        return undefined;
      } catch (error) {
        c.error = `${error.message.replace(/\.*$/, '.')} Nothing was changed.`;
        return { error: error.message.replace(/\.+$/, ''), word: 'Failed', remedy: error.body?.remedy };
      }
    });
    if (ctx.dialog?.state !== c) return;
    if (ok) {
      c.freed = gain;
      c.state = 'done';
      await ctx.load({ quiet: true });
    } else c.state = 'failed';
    await ctx.redraw();
  }

  return { checkCompact, openCompact, runCompact };
}
