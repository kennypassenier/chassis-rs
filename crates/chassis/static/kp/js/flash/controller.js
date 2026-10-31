// One wired flash button: its faces, and the press that posts or runs the page's work, guarded while it is busy.

import { FlashRun } from './run.js';
import { post } from './post.js';

export class FlashButton extends FlashRun {
    /** Listen for the press of a `data-kp-post` button; a press while busy never reaches the page's own handler. */
    listenPress() {
        const button = this.host;
        // The guard runs first (capture), so a consumer's own click handler never sees a press made while busy.
        this.listen(
            button,
            'click',
            (event) => {
                if (this.running || button.getAttribute('aria-disabled') === 'true') {
                    event.stopImmediatePropagation();
                    event.preventDefault();
                }
            },
            true,
        );
        this.listen(button, 'click', (event) => {
            if (!button.hasAttribute('data-kp-post')) return;
            event.preventDefault();
            void this.run(() => post(button), this.flashOptions);
        });
    }
}
