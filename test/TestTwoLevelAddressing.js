'use strict';

/* Verifies 2-level group addressing support in the patched knx library
   (patches/knx+2.5.4.patch) at both seams: Address parse/toString and CEMI
   marshalling. 2-level (main/sub) and 3-level (main/middle/sub) group
   addresses are two textual styles for the same 16-bit value on the bus,
   so a 2-level telegram must be byte-identical to its 3-level twin.
   Run with: npm test */

const assert = require('assert');
const Address = require('knx/src/Address');
const KnxProtocol = require('knx/src/KnxProtocol');
const KnxConstants = require('knx/src/KnxConstants');

function assertThrowsMatching(fn, pattern, message) {
  try {
    fn();
  } catch (error) {
    // the knx library throws plain strings, not Error instances
    assert.ok(String(error).match(pattern), `${message}: unexpected error "${error}"`);
    return;
  }
  assert.fail(`${message}: expected an exception`);
}

// ---- Address level: 2-level and 3-level are the same 16 bits ----

const cases = [
  ['0/0', '0/0/0', 0x0000],
  ['6/7', '6/0/7', 0x3007],
  ['6/207', '6/0/207', 0x30cf],
  ['6/2047', '6/7/255', 0x37ff],
  ['31/2047', '31/7/255', 0xffff],
];
for (const [twoLevel, threeLevel, raw] of cases) {
  const bufTwo = Address.parse(twoLevel, Address.TYPE.GROUP, true);
  const bufThree = Address.parse(threeLevel, Address.TYPE.GROUP, false);
  assert.strictEqual(bufTwo.readUInt16BE(0), raw, `${twoLevel} encodes to 0x${raw.toString(16)}`);
  assert.deepStrictEqual(bufTwo, bufThree, `${twoLevel} and ${threeLevel} are the same address`);
  assert.strictEqual(Address.toString(bufTwo, Address.TYPE.GROUP, true), twoLevel);
  assert.strictEqual(Address.toString(bufThree, Address.TYPE.GROUP, false), threeLevel);
}

// Out-of-range 2-level addresses are rejected
assertThrowsMatching(() => Address.parse('32/0', Address.TYPE.GROUP, true),
  /main group/, '2-level main group above 31');
assertThrowsMatching(() => Address.parse('6/2048', Address.TYPE.GROUP, true),
  /sub group/, '2-level sub group above 2047');

// The original bug: without 2-level mode a 2-token address cannot serialize
assertThrowsMatching(() => Address.parse('6/7', Address.TYPE.GROUP, false),
  /missing 3rd token/, '2-token address in 3-level mode');

// ---- CEMI level: the patched seams honour KnxProtocol.twoLevelAddressing ----

function buildCEMI(destAddr) {
  return {
    msgcode: KnxConstants.MESSAGECODES['L_Data.req'],
    addinfo_length: 0,
    ctrl: {
      frameType: 1,
      reserved: 0,
      repeat: 1,
      broadcast: 1,
      priority: 3,
      acknowledge: 0,
      confirm: 0,
      destAddrType: 1,
      hopCount: 6,
      extendedFrame: 0,
    },
    src_addr: '1.1.1',
    dest_addr: destAddr,
    apdu: {
      tpci: 0, apci: 'GroupValue_Write', data: [1], bitlength: 1,
    },
  };
}

function marshal(destAddr) {
  const writer = KnxProtocol.createWriter();
  writer.CEMI(buildCEMI(destAddr));
  return writer.buffer;
}

function unmarshal(buf) {
  const reader = KnxProtocol.createReader(buf);
  reader.CEMI('cemi');
  return reader.next()['cemi'];
}

// 3-level mode (the default) is unchanged
KnxProtocol.twoLevelAddressing = false;
const telegramThreeLevel = marshal('6/0/7');
assert.strictEqual(unmarshal(telegramThreeLevel).dest_addr, '6/0/7');

// The original bug at the layer where it broke the app: serialization throws,
// no telegram is ever emitted
assertThrowsMatching(() => marshal('6/7'),
  /missing 3rd token/, '2-level telegram in 3-level mode');

// 2-level mode: telegram is byte-identical to its 3-level twin and decodes
// back in 2-level style, so status events match the configured addresses
KnxProtocol.twoLevelAddressing = true;
const telegramTwoLevel = marshal('6/7');
assert.deepStrictEqual(telegramTwoLevel, telegramThreeLevel,
  'a 2-level telegram must be byte-identical to its 3-level twin');
assert.strictEqual(unmarshal(telegramTwoLevel).dest_addr, '6/7');

KnxProtocol.twoLevelAddressing = false;

console.log('TestTwoLevelAddressing: all assertions passed');
