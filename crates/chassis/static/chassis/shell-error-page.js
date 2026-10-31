// The error page's script: the drawing, the copy button, the way back and
// the time.
// Split out of shell.js by responsibility; the page runs exactly as before.

import { attachArt, attachPatterns } from '../kp/dist/kp-themes.min.js';
import { $$ } from './shell-dom.js';

// Returns nothing; `joined` collects the names of the kp modules attached here.
export function attachErrorPage(joined) {
  attachArt(document);
  attachPatterns(document);
  joined.push('art', 'patterns');
  for (const el of $$('[data-chassis-when]')) {
    const when = new Date(el.getAttribute('datetime'));
    if (Number.isNaN(when.getTime())) continue;
    const two = (n) => String(n).padStart(2, '0');
    // dd/mm/yyyy HH:mm, 24 hours (UI_PRINCIPLES, rule 52).
    el.textContent = `${two(when.getDate())}/${two(when.getMonth() + 1)}/${when.getFullYear()} ${two(when.getHours())}:${two(when.getMinutes())}`;
    el.title = el.getAttribute('datetime');
  }
  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-chassis-back]')) return;
    if (history.length > 1) history.back();
    else location.assign('/');
  });
}
