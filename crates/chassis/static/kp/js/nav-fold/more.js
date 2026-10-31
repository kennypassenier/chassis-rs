// The More item: kp's menu button, dressed as one of the bar's links. Built here, put into the list by the controller.

/**
 * @param {Document} doc
 * @returns {{ more: HTMLLIElement, wrapper: HTMLElement, button: HTMLButtonElement, menu: HTMLElement, label: HTMLElement, dot: HTMLElement, alertText: HTMLElement }}
 */
export function buildMore(doc) {
    const more = doc.createElement('li');
    more.className = 'kp-nav__more';
    more.setAttribute('data-kp-nav-more', '');
    more.setAttribute('data-kp-nav-idle', '');
    const wrapper = doc.createElement('div');
    wrapper.className = 'kp-menu-button kp-nav__more-wrap';
    wrapper.setAttribute('data-kp-menu-button', '');
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'kp-nav__link kp-nav__more-button';
    const menu = doc.createElement('div');
    menu.className = 'kp-menu kp-menu--rich kp-nav__more-menu';
    menu.setAttribute('role', 'menu');
    wrapper.append(button, menu);
    more.append(wrapper);
    // The word, then a dot for a counter behind the button (hidden until one is).
    const label = doc.createElement('span');
    const dot = doc.createElement('span');
    dot.className = 'kp-nav__more-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.hidden = true;
    const alertText = doc.createElement('span');
    alertText.className = 'kp-sr-only';
    alertText.hidden = true;
    button.append(label, dot, alertText);
    return { more, wrapper, button, menu, label, dot, alertText };
}
