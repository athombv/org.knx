'use strict';

const assert = require('assert');
const { fromDpt1, toDpt1 } = require('../lib/HeatingCoolingMode');

assert.strictEqual(fromDpt1(Buffer.from([0x01])), 'heat');
assert.strictEqual(fromDpt1(Buffer.from([0x00])), 'cool');
assert.strictEqual(fromDpt1(1), 'heat');
assert.strictEqual(fromDpt1(0), 'cool');
assert.throws(() => fromDpt1(null));
assert.throws(() => fromDpt1(undefined));
assert.throws(() => fromDpt1(Buffer.alloc(0)));
assert.strictEqual(toDpt1('heat'), 1);
assert.strictEqual(toDpt1('cool'), 0);
assert.throws(() => toDpt1('auto'));

console.log('heating-cooling-mode: all tests passed'); // eslint-disable-line no-console
