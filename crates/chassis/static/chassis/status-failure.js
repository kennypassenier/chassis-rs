// The Status page's failed plate: the attention band with one critical item
// and its Try again.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

/* ------------------------------------------------ the failed plate -- */
// The operations page's own failed state: the attention band with one
// critical item and its Try again, the page's body hidden under it.
export function drawFailure(root, setAttention, on) {
  const ops = root;
  let plate = ops.querySelector(':scope > [data-chassis-plate]');
  if (on) {
    if (!plate) {
      plate = document.createElement('div');
      plate.className = 'kp-ops__attention kp-attention';
      plate.setAttribute('data-chassis-plate', '');
      ops.querySelector('.kp-ops__attention')?.after(plate);
    }
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'kp-button kp-button--sm';
    retry.setAttribute('data-chassis-retry', '');
    retry.textContent = 'Try again';
    setAttention(plate, [
      {
        key: 'status-unreadable',
        severity: 'critical',
        title: 'The status could not be read',
        text: 'The service did not answer. What now: check that it is running, then try again.',
        action: retry,
      },
    ]);
    ops.setAttribute('data-kp-state', 'error');
  } else if (plate) {
    plate.remove();
    if (ops.getAttribute('data-kp-state') === 'error') ops.removeAttribute('data-kp-state');
  }
}
