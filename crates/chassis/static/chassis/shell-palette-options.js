// The palette's DOM builders (a group, an option, a list-item wrapper) and
// the static "This page" group. Split out of shell-palette.js: pure element
// construction, no page state.
export function group(title, key) {
  const li = document.createElement('li');
  li.setAttribute('role', 'presentation');
  li.className = 'kp-palette__group';
  li.setAttribute('data-kp-group', '');
  li.dataset.chassisGroup = key;
  const span = document.createElement('span');
  span.className = 'kp-palette__group-label';
  span.textContent = title;
  const ul = document.createElement('ul');
  ul.setAttribute('role', 'group');
  ul.setAttribute('aria-label', title);
  li.append(span, ul);
  return { li, ul };
}

export function option(value, text, hint, keys, words) {
  const li = document.createElement('li');
  li.className = 'kp-palette__option';
  li.setAttribute('role', 'option');
  li.setAttribute('data-kp-option', '');
  li.dataset.value = value;
  if (words) li.setAttribute('data-kp-words', words);
  li.append(text);
  if (hint) {
    const d = document.createElement('span');
    d.className = 'kp-palette__description';
    d.textContent = hint;
    li.append(d);
  }
  if (keys) {
    li.setAttribute('data-kp-keys', keys);
    const k = document.createElement('kbd');
    k.className = 'kp-palette__keys';
    k.textContent = keys;
    li.append(k);
  }
  return li;
}

export function wrap(el) {
  const li = document.createElement('li');
  li.setAttribute('role', 'presentation');
  li.append(el);
  return li;
}
