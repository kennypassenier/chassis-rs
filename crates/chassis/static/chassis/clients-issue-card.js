// The issue dialog's client card, which follows what is typed in the form
// (name, topic) and takes a refusal back when the name changes. Split out of
// clients-issue.js: it owns the card, nothing else.
export function createCardSync(ctx) {
  const textOf = (input) => {
    if (!input) return '';
    if (input instanceof HTMLSelectElement) return input.value ? input.selectedOptions[0].textContent.trim() : '';
    return input.value.trim();
  };

  function sync() {
    if (ctx.issued) return;
    const name = textOf(ctx.nameInput);
    for (const [key, input] of [['name', ctx.nameInput], ['topic', ctx.topicInput]]) {
      const target = ctx.$(`[data-issue-${key}]`);
      if (target) target.textContent = textOf(input) || target.dataset.issueEmpty;
    }
    ctx.idmark.setIdmark(ctx.$('[data-issue-mark]'), name || `new ${ctx.one}`);
    ctx.card.classList.toggle('issue-prev--empty', !name);
    if (ctx.state.dataset.issueRefused !== undefined) {
      // Typing a new name takes the refusal back.
      delete ctx.state.dataset.issueRefused;
      ctx.state.className = 'kp-badge kp-badge--info';
      ctx.state.textContent = 'will be active';
    }
  }

  function wire() {
    const later = () => window.setTimeout(sync, 0);
    for (const type of ['input', 'change', 'kp-usual-pick', 'kp-usual-add']) ctx.dialog.addEventListener(type, later);
    sync();
  }

  return { textOf, wire };
}
