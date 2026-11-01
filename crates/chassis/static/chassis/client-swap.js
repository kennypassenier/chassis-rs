// Shows what an action changed without a reload: reads the client's page
// again and replaces the regions marked data-client-region with the new ones.
// The request log (data-client-keep) is not a region, so it stays as it is,
// open rows and scroll position included. A region the server no longer
// draws (the token rail of a revoked client keeps its slot) is replaced by
// whatever stands in its place.
export function createSwap(ctx, wire) {
  async function fetchPage() {
    const res = await fetch(location.pathname, { headers: { accept: 'text/html' }, credentials: 'same-origin' });
    // A login page or a 404 means the page is gone or the session ended: leave it to the browser.
    if (!res.ok || res.redirected) return null;
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }

  // The new regions go in; focus stays on the page's heading so a keyboard or
  // screen-reader user is not left on a button that no longer exists.
  async function refresh() {
    const doc = await fetchPage();
    if (!doc) {
      window.location.reload();
      return;
    }
    const open = ctx.page.contains(document.activeElement) ? document.activeElement : null;
    for (const fresh of doc.querySelectorAll('[data-client-region]')) {
      const mine = ctx.page.querySelector(`[data-client-region="${fresh.dataset.clientRegion}"]`);
      if (!mine) continue;
      const adopted = document.adoptNode(fresh);
      mine.replaceWith(adopted);
      wire(adopted);
    }
    if (open && !document.contains(open)) ctx.page.querySelector('.manage-head__title')?.focus();
  }

  return { refresh };
}
