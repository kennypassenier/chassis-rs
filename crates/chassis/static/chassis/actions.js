// The two document-wide handlers of the kit: [data-post] buttons and the
// busy label on plain POST forms.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

// A project's [data-post] button (a row or a section action, K29): POST (or
// its method) to the route it names, then reload; a refusal is the kit's JSON
// and shows as a word on the button with the sentence under it. Destructive
// ones carry data-kp-confirm; components.js asks first and lets the second
// click through, which is the click seen here. The button is a kp flash
// button: the theme's own spinner while it works, one width throughout.
document.addEventListener('click', async (event) => {
  const post = event.target.closest('[data-post]');
  if (!post || post.hasAttribute('data-kp-armed-pending')) return;
  const { runFlashButton } = await import('../kp/dist/kp-themes.min.js');
  runFlashButton(
    post,
    async () => {
      const res = await fetch(post.dataset.post, { method: post.dataset.method || 'POST', headers: { accept: 'application/json' } });
      if (res.ok) {
        window.location.reload();
        return 'Done';
      }
      const body = await res.json().catch(() => ({}));
      return { error: body.error || `HTTP ${res.status}`, remedy: body.remedy };
    },
    { busyLabel: post.dataset.busyLabel },
  );
});

// Forms with a plain POST (login): a plain POST navigates away; the button
// still shows its busy label until the page changes (rule 31). The Issue
// form on the Clients page is the dialog in the "clients" block below: it
// never navigates, so its submit is only kept from doing so here. Lives in
// this file rather than inline so the page carries no inline script (CSP
// script-src 'self', S8).
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const button = form.querySelector('button[type="submit"]');
  if (form.id === 'issue') {
    event.preventDefault();
    return;
  }
  if (button && button.dataset.busyLabel) {
    button.disabled = true;
    button.textContent = button.dataset.busyLabel;
  }
});
