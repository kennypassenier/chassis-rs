// The Storage page's cards: the kinds table (drawn once per width class),
// the waiting and failed states, and the paint that fills every card from
// the last read. Its own module because it is the page's only drawing code.
import { attentionBand, budgetHtml, legendSpec, stackSpec, totals } from './storage-budget-html.js';
import { compactHtml } from './storage-compact-card.js';
import { levelBadge, size } from './storage-format.js';
import { kindRow } from './storage-kinds.js';

export function createCards(ctx) {
  // The table is drawn once per width class: data-kp-cards makes its rows
  // cards, and the package reads it when the table attaches.
  async function mountTable() {
    const old = ctx.kindsCard.querySelector('.kp-datatable');
    const fresh = Object.assign(document.createElement('div'), { innerHTML: ctx.tableSkeleton }).firstElementChild;
    if (ctx.narrow.matches) fresh.setAttribute('data-kp-cards', '');
    old.replaceWith(fresh);
    await ctx.attachParts(fresh.parentElement);
    ctx.table = ctx.dataTable(fresh);
    return fresh;
  }

  function cardsReading() {
    ctx.setCardState(ctx.budgetCard, 'loading', { words: 'Reading the storage…' });
    ctx.setCardState(ctx.compactCard, 'loading', { words: 'Reading the storage…' });
    ctx.table?.busy({ text: 'Reading what is stored…', overlay: true });
    ctx.table?.state('loading');
  }

  function cardsFailed(error) {
    const text = `${error.message.replace(/\.*$/, '.')} Nothing was changed.`;
    ctx.setCardState(ctx.budgetCard, 'error', { title: 'The storage could not be read', text, action: 'Try again' });
    ctx.setCardState(ctx.compactCard, 'error', { title: 'The storage could not be read', text, action: 'Try again' });
    ctx.table?.fail(text);
  }

  // The warning: one band, the worst fact first, with its fix.
  async function paintBand(t) {
    ctx.root.querySelector('[data-storage-band]')?.remove();
    const band = attentionBand(t, ctx.data);
    if (band) {
      ctx.root.querySelector('.kp-ops__head').insertAdjacentHTML('afterend', band);
      await ctx.attachParts(ctx.root);
    }
  }

  async function paintBudget(t) {
    const card = ctx.budgetCard;
    card.querySelector('[data-storage-level]').innerHTML = levelBadge(t.level);
    card.querySelector('[data-storage-budget-about]').textContent =
      `Everything this service keeps on disk, against a budget of ${size(t.budget)}. The budget only warns: nothing is ever deleted for you.`;
    const budgetData = card.querySelector('[data-storage-budget]');
    // The editor outlives a redraw: a refresh must not eat what is being typed.
    const keptEditor = budgetData.querySelector('[data-storage-budget-edit]');
    budgetData.innerHTML = budgetHtml(t);
    if (keptEditor?.firstElementChild) budgetData.querySelector('[data-storage-budget-edit]').replaceWith(keptEditor);
    await ctx.attachParts(budgetData);
    ctx.setStackbar(budgetData.querySelector('[data-storage-stackbar]'), stackSpec(t));
    await ctx.paintBudgetForm();
  }

  async function paint() {
    const t = totals(ctx.data);
    await paintBand(t);
    await paintBudget(t);
    const compactData = ctx.compactCard.querySelector('[data-storage-compact]');
    compactData.innerHTML = compactHtml(t, ctx.data);
    await ctx.attachParts(compactData);
    ctx.setStackbar(compactData.querySelector('[data-storage-legend]'), legendSpec(t));
    const kinds = ctx.data.kinds;
    ctx.kindsCard.querySelector('[data-storage-kinds-title]').textContent = `What is stored (${kinds.length} ${kinds.length === 1 ? 'kind' : 'kinds'})`;
    const sorted = [...kinds].sort((a, b) => b.bytes - a.bytes);
    ctx.root.querySelector('[data-storage-kinds]').innerHTML = sorted.map((k) => kindRow(k, t.budget)).join('');
    ctx.setCardState(ctx.budgetCard, 'ready');
    ctx.setCardState(ctx.compactCard, 'ready');
    ctx.table?.state('ready');
    ctx.table?.refresh();
  }

  return { mountTable, cardsReading, cardsFailed, paint };
}
