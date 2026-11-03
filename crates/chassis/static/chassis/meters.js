// Paints the kit's meters from data attributes. A value used to ride in a
// style attribute holding the custom property; the CSP forbids inline styles,
// so the markup carries `data-chassis-value` (and `data-chassis-mark`) and
// this module sets the custom properties through CSSOM, which the CSP allows.

const PAIRS = [
  ['data-chassis-value', '--kp-value'],
  ['data-chassis-mark', '--kp-mark'],
];
const SELECTOR = PAIRS.map(([attr]) => `[${attr}]`).join(',');

function paintOne(el) {
  for (const [attr, prop] of PAIRS) {
    const v = el.getAttribute(attr);
    if (v !== null) el.style.setProperty(prop, v);
  }
}

/** Paint `root` and every meter inside it. */
export function paintMeters(root) {
  if (root.matches?.(SELECTOR)) paintOne(root);
  for (const el of root.querySelectorAll?.(SELECTOR) ?? []) paintOne(el);
}

/** Paint the page now and every meter added or re-valued later. */
export function installMeters(doc) {
  paintMeters(doc);
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') paintOne(r.target);
      else for (const n of r.addedNodes) if (n.nodeType === 1) paintMeters(n);
    }
  });
  observer.observe(doc, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: PAIRS.map(([attr]) => attr),
  });
  return observer;
}
