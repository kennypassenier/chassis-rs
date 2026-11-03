// The phone tab bar's label fit (node --test) [fix-hsb-cycle-1].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIT_LEVELS, fitLevel, isClipped } from '../../static/chassis/shell-tabbar-fit.js';

test('a label is clipped when it is taller or wider than its box', () => {
  assert.equal(isClipped({ scrollHeight: 29, clientHeight: 29, scrollWidth: 72, clientWidth: 72 }), false);
  assert.equal(isClipped({ scrollHeight: 30, clientHeight: 29, scrollWidth: 72, clientWidth: 72 }), false, 'one pixel of slack');
  assert.equal(isClipped({ scrollHeight: 44, clientHeight: 29, scrollWidth: 72, clientWidth: 72 }), true);
  assert.equal(isClipped({ scrollHeight: 29, clientHeight: 29, scrollWidth: 90, clientWidth: 72 }), true);
});

test('the fit takes the first level at which nothing is clipped', () => {
  assert.equal(fitLevel(() => false), '');
  assert.equal(fitLevel((level) => level === ''), 'small');
  assert.equal(fitLevel((level) => level !== 'smaller'), 'smaller');
});

test('when no level fits the smallest one stays', () => {
  assert.equal(fitLevel(() => true), FIT_LEVELS[FIT_LEVELS.length - 1]);
});
