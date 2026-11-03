// The Status page's read-back markup carries no style attribute (CSP style-src 'self').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markupWithoutStyles } from '../../static/chassis/meters.js';

test('a painted meter reads back with its data attribute and without its style', () => {
    const styled = [{ removed: false, removeAttribute(n) { if (n === 'style') this.removed = true; } }];
    const copy = { querySelectorAll: (sel) => (sel === '[style]' ? styled : []), innerHTML: '<span data-chassis-value="0.5"></span>' };
    const el = { cloneNode: (deep) => (assert.equal(deep, true), copy) };
    assert.equal(markupWithoutStyles(el), '<span data-chassis-value="0.5"></span>');
    assert.equal(styled[0].removed, true, 'the copy loses the style the meter got through CSSOM');
});
