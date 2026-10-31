// Pure: the tone of a value against its threshold.

/**
 * The tone of a value: warning at or past the threshold, destructive at or
 * past `bad`.
 * @param {number | null} value @param {number} threshold @param {number} [bad]
 * @returns {'' | 'warning' | 'destructive'}
 */
export function bulletTone(value, threshold, bad) {
    if (value == null || !Number.isFinite(value)) return '';
    if (bad !== undefined && value >= bad) return 'destructive';
    return value >= threshold ? 'warning' : '';
}
