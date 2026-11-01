// Server-rendered sections that follow the kit's tick [ux-chassis-10]. A
// section opts in with one attribute on its element:
//
//   <div data-chassis-refresh-section="/fragments/queue">…first paint…</div>
//
// On every kit tick the kit fetches that address (same origin, with the
// session, HTML) and replaces the element's content when the answer differs
// from what is shown, so an unchanged section keeps its focus, selection and
// scroll. A section never draws a refresh bar of its own: the interval, the
// freshness line and "Refresh now" are the kit's. A failed read keeps what is
// on screen and fails the tick, so the control says so.

export const SECTION = '[data-chassis-refresh-section]';

// The markup as this browser serialises it.
function normalised(doc, html) {
  const holder = doc.createElement('template');
  holder.innerHTML = html;
  return holder.innerHTML;
}

/**
 * Re-read every opted-in section under `root`; true when all answered.
 * `fetchText(url)` is injectable: it resolves the HTML or rejects.
 */
export async function rereadSections(root, fetchText) {
  const outcomes = await Promise.all(
    [...root.querySelectorAll(SECTION)].map(async (section) => {
      try {
        const answer = await fetchText(section.getAttribute('data-chassis-refresh-section'));
        // Compared as the browser would serialise it, so the server's first
        // paint and an identical answer are the same and nothing is replaced.
        const next = normalised(section.ownerDocument, answer);
        if (section.innerHTML !== next) section.innerHTML = next;
        return true;
      } catch (error) {
        console.error('chassisRefresh section', error);
        return false;
      }
    }),
  );
  return outcomes.every(Boolean);
}

/** The browser's reader: same origin, with the session, never from cache. */
export async function fetchFragment(url) {
  const res = await fetch(url, { headers: { accept: 'text/html' }, credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok || res.redirected) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
