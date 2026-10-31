// The selector, the events and the fixed numbers of the connection path.

/** The traces this module draws. */
export const TRACE = '[data-kp-trace]';
/** Fired on the trace when the deciding rule is pressed: `{ rule, hop }`. */
export const TRACE_RULE_EVENT = 'kp-trace-rule';
/** Fired on the trace when Swap is pressed or S is typed. */
export const TRACE_SWAP_EVENT = 'kp-trace-swap';
/** Fired on the trace when Retry is pressed. */
export const TRACE_RETRY_EVENT = 'kp-trace-retry';

/** The hops drawn as placeholders while a trace runs. */
export const GHOST_HOPS = 3;
/** The options the trace watches, which draw it again when they change. */
export const WATCHED_ATTRIBUTES = [
    'data-kp-trace-stop',
    'data-kp-trace-rule',
    'data-kp-trace-verdict',
    'data-kp-trace-summary',
    'data-kp-trace-copy',
    'data-kp-trace-swap',
];
