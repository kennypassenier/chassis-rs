// The two doors into a growing text box from outside: a script writing `value =`, and the Mod+Enter submit key.

/** One markup attribute's text, or the fallback. @param {Element} el @param {string} name @param {string} fallback */
export const attr = (el, name, fallback) => el.getAttribute(name) ?? fallback;

/** A script writes `value =`: the setter is the one door. @param {import('./controller.js').AutosizeController} c */
export function hookValueSetter(c) {
    const area = c.area;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (!descriptor?.get || !descriptor.set) return;
    const { get, set } = descriptor;
        Object.defineProperty(area, 'value', {
        configurable: true,
        get() {
            return get.call(this);
        },
        set(v) {
            set.call(this, v);
            c.measureTogether();
            c.drawCounter();
        },
    });
    c.own(() => {
        delete (/** @type {any} */ (area).value);
    });
}

/** Mod+Enter submits, and the `?` sheet lists it. @param {import('./controller.js').AutosizeController} c */
export function registerSubmitKey(c) {
    const area = c.area;
    if (attr(area, 'data-kp-submit-key', 'off') !== 'mod-enter') return;
    void import('../shortcuts.js').then(({ registerShortcuts }) => {
        if (c.destroyed) return;
        const unregister = registerShortcuts(
            area,
            [
                {
                    keys: 'Mod Enter',
                    what: c.strings.autosizeSubmit,
                    group: c.strings.autosizeGroup,
                    when: () => c.doc.activeElement === area && !area.disabled && !area.readOnly,
                    run: () => {
                        if (area.form?.requestSubmit) area.form.requestSubmit();
                        else area.form?.submit();
                    },
                },
            ],
            { dev: false },
        );
        c.own(() => unregister?.());
    });
}
