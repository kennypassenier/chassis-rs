// A `[data-kp-alarm]` trigger: a press raises the alarm the trigger describes.

import { attachOne, Controller } from '../controller.js';

/** The triggers of a page. */
const TRIGGER = '[data-kp-alarm]';

/** @typedef {{ strings?: Partial<import('../strings.js').Strings>, show: (options: import('../alarm.js').AlarmOptions) => Promise<unknown> }} TriggerOptions */

export class AlarmTrigger extends Controller {
    /**
     * @param {HTMLElement} host the trigger
     * @param {TriggerOptions} options
     */
    constructor(host, options) {
        super(host, options);
        this.settings = options;
    }

    connect() {
        const trigger = this.host;
        trigger.dataset.kpAlarmAttached = '';
        this.listen(trigger, 'click', () => this.raise());
        this.own(() => delete trigger.dataset.kpAlarmAttached);
    }

    raise() {
        const trigger = this.host;
        const d = trigger.dataset;
        void this.settings.show({
            title: d.kpAlarm ?? '',
            detail: d.kpAlarmDetail,
            code: d.kpAlarmCode,
            mode: d.kpAlarmMode === 'auto' ? 'auto' : 'ack',
            seconds: d.kpAlarmSeconds === undefined ? undefined : Number(d.kpAlarmSeconds),
            escape: d.kpAlarmEscape !== undefined,
            action: d.kpAlarmAction,
            strings: this.settings.strings,
            trigger,
        });
    }
}

/**
 * Wire the triggers below `root` (not `root` itself), except those already wired.
 * @param {ParentNode} root
 * @param {TriggerOptions} options
 * @returns {() => void} detach
 */
export function attachTriggers(root, options) {
    const made = [...root.querySelectorAll(TRIGGER)]
        .filter((node) => !node.hasAttribute('data-kp-alarm-attached'))
        .map((node) => attachOne(/** @type {HTMLElement} */ (node), AlarmTrigger, options))
        .filter((controller) => controller !== undefined);
    return () => {
        for (const controller of made) controller.destroy();
    };
}
