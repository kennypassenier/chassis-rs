// The Storage page's budget editor: the live redraw that follows what is
// typed, the form's repaint when the saved setting moves, and Save / Reset.
// Its own module because it is the one part of the page that owns a draft
// (`ctx.draft`, `ctx.formSignature`) and must never eat what is being typed.
import { api } from './json-api.js';
import { editHtml, fixedBy, levelFor, mbBytes, problemWith } from './storage-budget-form.js';
import { figureOf, stackSpec, totals } from './storage-budget-html.js';
import { levelBadge, size, num } from './storage-format.js';

export function createBudgetEditor(ctx) {
  const settingOf = () => ctx.data.budget.setting;
  const savedPair = () => ({ budget: settingOf().budget_mb, warn: settingOf().warn_mb });

  // What is typed in the two fields, as numbers (NaN where a field is empty).
  function typedPair(form) {
    const raw = (key) => form.querySelector(`[data-storage-field="${key}"]`).value.trim().replace(',', '.');
    return { budget: raw('budget') === '' ? NaN : Number(raw('budget')), warn: raw('warn') === '' ? NaN : Number(raw('warn')) };
  }

  // The figure, the bar with its warn mark, the level badge.
  function paintFigure(shown, level) {
    const total = ctx.data.budget.total_bytes;
    const t = { ...totals(ctx.data), budget: mbBytes(shown.budget), warn: mbBytes(shown.warn), level, share: total / mbBytes(shown.budget) };
    const kpi = ctx.budgetCard.querySelector('.storage-budget__figure .kp-kpi');
    const fig = figureOf(t);
    kpi.querySelector('.kp-kpi__value').innerHTML = fig.value;
    kpi.querySelector('.kp-kpi__trend').textContent = fig.trend;
    if (fig.tone) kpi.setAttribute('data-kp-tone', fig.tone);
    else kpi.removeAttribute('data-kp-tone');
    const bar = ctx.budgetCard.querySelector('[data-storage-stackbar]');
    if (bar) ctx.setStackbar(bar, stackSpec(t));
    ctx.budgetCard.querySelector('[data-storage-level]').innerHTML = levelBadge(level);
  }

  // The words under each field.
  function paintNotes(form, shown, bad) {
    const s = settingOf();
    const total = ctx.data.budget.total_bytes;
    const pct = (b) => `${num(Math.round((total / mbBytes(b)) * 100))} %`;
    const note = (key, text, invalid) => {
      const el = form.querySelector(`[data-storage-note="${key}"]`);
      el.textContent = text;
      el.classList.toggle('kp-text-destructive', Boolean(invalid));
      form.querySelector(`[data-storage-field="${key}"]`).toggleAttribute('aria-invalid', Boolean(invalid));
      if (invalid) form.querySelector(`[data-storage-field="${key}"]`).setAttribute('aria-invalid', 'true');
    };
    const badField = bad?.[0];
    note('budget', badField === 'budget' ? bad[1] : `${size(total)} used of ${size(mbBytes(shown.budget))} (${pct(shown.budget)}).${s.budget_fixed ? ` ${fixedBy(s.budget_fixed)}` : ''}`, badField === 'budget');
    note('warn', badField === 'warn' ? bad[1] : `Warns from ${size(mbBytes(shown.warn))}, ${Math.round((shown.warn / shown.budget) * 100)} % of the budget; ${size(Math.max(0, mbBytes(shown.warn) - total))} to go.${s.warn_fixed ? ` ${fixedBy(s.warn_fixed)}` : ''}`, badField === 'warn');
  }

  // The buttons say why they are off.
  function paintButtons(form, differs, bad) {
    const s = settingOf();
    const bothFixed = Boolean(s.budget_fixed && s.warn_fixed);
    form.querySelector('#storage-budget-save').disabled = bothFixed || !ctx.draft || Boolean(bad);
    form.querySelector('#storage-budget-reset').disabled = bothFixed || (!s.stored && !differs);
    form.querySelector('[data-storage-budget-state]').textContent = bothFixed
      ? 'Both values are fixed by configuration, so nothing can be saved here.'
      : bad ? 'Fix the marked field to save.' : !ctx.draft ? (s.stored ? 'This is the saved setting. Reset goes back to the default.' : 'This is the default setting. Change a value to save it.') : 'Not saved yet.';
  }

  // Redraw everything that follows from the draft; never touches the fields' own text.
  function liveBudget() {
    const form = ctx.budgetCard.querySelector('.storage-budget-form');
    if (!form || !ctx.data) return;
    const saved = savedPair();
    const typed = typedPair(form);
    const differs = typed.budget !== saved.budget || typed.warn !== saved.warn;
    ctx.draft = differs ? typed : null;
    const bad = problemWith(typed, ctx.data);
    const shown = bad ? saved : typed; // an invalid draft shows the saved figures, not nonsense
    paintFigure(shown, levelFor(ctx.data.budget.total_bytes, mbBytes(shown.budget), mbBytes(shown.warn)));
    paintNotes(form, shown, bad);
    paintButtons(form, differs, bad);
  }

  function paintBudgetForm() {
    const host = ctx.budgetCard.querySelector('[data-storage-budget-edit]');
    if (!host) return Promise.resolve();
    const s = settingOf();
    const signature = JSON.stringify([s.budget_mb, s.warn_mb, s.stored, s.budget_fixed, s.warn_fixed, s.max_mb]);
    if (host.firstElementChild && (signature === ctx.formSignature || ctx.draft)) {
      liveBudget();
      return Promise.resolve();
    }
    ctx.formSignature = signature;
    ctx.draft = null;
    host.innerHTML = editHtml(settingOf(), ctx.draft ?? savedPair(), ctx.data);
    return ctx.attachParts(host).then(liveBudget);
  }

  async function saveBudget(button, body, word) {
    let answer = null;
    await ctx.runFlashButton(button, async () => {
      try {
        answer = await api('/api/kit/storage/budget', body);
        return word;
      } catch (error) {
        return { error: error.message.replace(/\.+$/, ''), word: 'Refused', remedy: error.body?.remedy };
      }
    });
    if (!answer) return;
    ctx.draft = null;
    ctx.formSignature = '';
    const b = answer.budget;
    ctx.overlays.toast(
      body.reset
        ? `Budget back to the default: ${size(b.budget_bytes)}, warning from ${size(b.warn_bytes)}.`
        : `Budget saved: ${size(b.budget_bytes)}, warning from ${size(b.warn_bytes)}.`,
      { ms: 4000 },
    );
    await ctx.load({ quiet: true });
  }

  // Typing and the stepper change the draft; Save and Reset post.
  function wire() {
    for (const type of ['input', 'change', 'kp-quantity-change']) {
      ctx.root.addEventListener(type, (event) => {
        if (event.target instanceof Element && event.target.closest('.storage-budget-form')) liveBudget();
      });
    }
    ctx.root.addEventListener('click', async (event) => {
      const t = event.target instanceof Element ? event.target : null;
      const save = t?.closest('[data-storage-budget-save]');
      const reset = t?.closest('[data-storage-budget-reset]');
      if (!save && !reset) return;
      event.preventDefault();
      if ((save ?? reset).disabled) return;
      if (save) {
        const s = settingOf();
        const body = {};
        if (!s.budget_fixed) body.budget_mb = ctx.draft.budget;
        if (!s.warn_fixed) body.warn_mb = ctx.draft.warn;
        await saveBudget(save, body, 'Saved');
      } else await saveBudget(reset, { reset: true }, 'Reset');
    });
  }

  return { liveBudget, paintBudgetForm, wire };
}
