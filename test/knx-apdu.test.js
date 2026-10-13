'use strict';

const assert = require('assert');
const { buildApduData } = require('../lib/KNXApdu');
const { fromDpt1 } = require('../lib/HeatingCoolingMode');

assert.deepStrictEqual(buildApduData(1, 'DPT1.001'), Buffer.from([0x01]));
assert.deepStrictEqual(buildApduData(0, 'DPT1.001'), Buffer.from([0x00]));
assert.deepStrictEqual(buildApduData(1, 'DPT1.100'), Buffer.from([0x01]));
assert.deepStrictEqual(buildApduData(0, 'DPT1.100'), Buffer.from([0x00]));
assert.deepStrictEqual(buildApduData(true, 'DPT1'), Buffer.from([0x01]));
assert.deepStrictEqual(buildApduData(false, 'DPT1'), Buffer.from([0x00]));

const dpt9 = buildApduData(21.5, 'DPT9.001');
assert.ok(Buffer.isBuffer(dpt9));
assert.strictEqual(dpt9.length, 2);
assert.strictEqual(buildApduData(21.5, 'DPT9.1').length, 2);

assert.strictEqual(fromDpt1(buildApduData(1, 'DPT1.100')), 'heat');
assert.strictEqual(fromDpt1(buildApduData(0, 'DPT1.100')), 'cool');

console.log('knx-apdu: all tests passed'); // eslint-disable-line no-console
